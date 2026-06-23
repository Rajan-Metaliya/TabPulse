/**
 * TabPulse — Tab Grouping service worker.
 *
 * Groups tabs by keyword rules. Grouping is INCREMENTAL: when a group for a
 * rule already exists in the window, matching (currently-ungrouped) tabs JOIN
 * that group instead of spawning a duplicate. Tabs the user has placed manually
 * (anything already in a group) are left untouched.
 *
 * This worker is isolated from the title-rewriting content scripts — it shares
 * only chrome.storage with them, using disjoint keys (`rules`, `autoGroup`).
 */

const DEFAULT_RULES = [
  { id: '1', name: 'Others', color: 'grey', keywords: [], isCatchAll: true },
];

const AUTO_GROUP_DEFAULT = true;

// ── Settings / rules ────────────────────────────────────────────────────────

async function getRules() {
  const { rules } = await chrome.storage.sync.get({ rules: null });
  if (!rules) {
    await chrome.storage.sync.set({ rules: DEFAULT_RULES });
    return DEFAULT_RULES;
  }
  return rules;
}

async function getAutoGroup() {
  const { autoGroup } = await chrome.storage.sync.get({ autoGroup: AUTO_GROUP_DEFAULT });
  return autoGroup;
}

// ── Rule → group identity (per-window map in session storage) ────────────────
// Group ids are not stable across browser restarts, so we keep the mapping in
// chrome.storage.session (cleared on restart, survives worker suspension) and
// always validate it against a live chrome.tabGroups.query.

function groupMapKey(windowId) {
  return `groupMap:${windowId}`;
}

async function getGroupMap(windowId) {
  const key = groupMapKey(windowId);
  const stored = await chrome.storage.session.get({ [key]: {} });
  return stored[key] || {};
}

async function putGroupMap(windowId, map) {
  await chrome.storage.session.set({ [groupMapKey(windowId)]: map });
}

/**
 * Returns a Map<ruleId, groupId> of rules that currently have a live group in
 * this window. Trusts the persisted map only for groups that still exist, then
 * recovers unmapped rules by matching an existing group's title to rule.name.
 */
async function resolveRuleGroups(windowId, rules, existingGroups) {
  const live = new Set(existingGroups.map(g => g.id));
  const stored = await getGroupMap(windowId);
  const result = new Map();

  // 1. Trust stored mappings only if the group still exists.
  for (const [ruleId, groupId] of Object.entries(stored)) {
    if (live.has(groupId)) result.set(ruleId, groupId);
  }

  // 2. Recovery: adopt an existing group whose title === rule.name and whose id
  //    isn't already claimed (handles cold start / first run over existing groups).
  const claimed = new Set(result.values());
  for (const rule of rules) {
    if (result.has(rule.id)) continue;
    const match = existingGroups.find(g => g.title === rule.name && !claimed.has(g.id));
    if (match) {
      result.set(rule.id, match.id);
      claimed.add(match.id);
    }
  }

  // 3. Rewrite the persisted map to exactly the validated set.
  await putGroupMap(windowId, Object.fromEntries(result));
  return result;
}

async function persistGroupMapping(windowId, ruleId, groupId) {
  const map = await getGroupMap(windowId);
  map[ruleId] = groupId;
  await putGroupMap(windowId, map);
}

// ── Eligibility / matching ───────────────────────────────────────────────────

function isEligible(tab) {
  if (!tab || !tab.url) return false;
  if (tab.pinned) return false; // grouping a pinned tab unpins it — never do that
  if (
    tab.url.startsWith('chrome://') ||
    tab.url.startsWith('chrome-extension://') ||
    tab.url.startsWith('about:')
  ) return false;
  return true;
}

/** First rule whose keyword is a substring of url+title; catch-all as fallback. */
function firstMatchingRule(tab, rules) {
  const haystack = (tab.url + ' ' + (tab.title || '')).toLowerCase();
  for (const rule of rules) {
    if (rule.isCatchAll) continue;
    if (rule.keywords.some(kw => haystack.includes(kw.toLowerCase()))) return rule;
  }
  return rules.find(r => r.isCatchAll) || null;
}

// ── Read-only queries (unchanged from tab-grouper) ───────────────────────────

async function getActiveGroups(windowId) {
  const tabGroups = await chrome.tabGroups.query({ windowId });
  const result = [];
  for (const group of tabGroups) {
    const tabs = await chrome.tabs.query({ groupId: group.id });
    result.push({
      groupId: group.id,
      name: group.title || 'Unnamed',
      color: group.color,
      tabIds: tabs.map(t => t.id),
    });
  }
  return result;
}

async function closeGroup(groupId, windowId) {
  const tabs = await chrome.tabs.query({ groupId });
  if (tabs.length > 0) {
    await chrome.tabs.remove(tabs.map(t => t.id));
  }
  return getActiveGroups(windowId);
}

// Detect unmatched URL patterns (hostname/firstPath) that appear in 2+ tabs.
async function getSuggestions(windowId) {
  const rules = await getRules();
  const tabs = await chrome.tabs.query({ windowId });

  const patternCount = new Map();

  for (const tab of tabs) {
    if (!isEligible(tab)) continue;

    const url = tab.url.toLowerCase();
    const alreadyMatched = rules.some(r =>
      !r.isCatchAll && r.keywords.some(kw => url.includes(kw.toLowerCase()))
    );
    if (alreadyMatched) continue;

    try {
      const u = new URL(tab.url);
      const first = u.pathname.split('/').filter(Boolean)[0];
      const pattern = first ? `${u.hostname}/${first}` : u.hostname;
      patternCount.set(pattern, (patternCount.get(pattern) || 0) + 1);
    } catch { /* ignore unparseable URLs */ }
  }

  return Array.from(patternCount.entries())
    .filter(([, n]) => n >= 2)
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => b.count - a.count);
}

// ── Incremental grouping (the core behavior) ─────────────────────────────────

const syncing = new Set(); // windowIds currently mid-sync (re-entrancy guard)

async function groupTabs(windowId) {
  if (syncing.has(windowId)) return getActiveGroups(windowId);
  syncing.add(windowId);
  try {
    const rules = await getRules();
    const tabs = await chrome.tabs.query({ windowId });
    const existingGroups = await chrome.tabGroups.query({ windowId });
    const ruleIdToGroupId = await resolveRuleGroups(windowId, rules, existingGroups);

    const toJoin = new Map();   // groupId -> [tabId, ...]
    const toCreate = new Map(); // ruleId  -> [tabId, ...]

    for (const tab of tabs) {
      if (!isEligible(tab)) continue;
      // Only ever group UNGROUPED tabs — never re-home a tab the user placed.
      if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) continue;

      const rule = firstMatchingRule(tab, rules);
      if (!rule) continue;

      const targetGroupId = ruleIdToGroupId.get(rule.id);
      if (targetGroupId != null) {
        if (!toJoin.has(targetGroupId)) toJoin.set(targetGroupId, []);
        toJoin.get(targetGroupId).push(tab.id);
      } else {
        if (!toCreate.has(rule.id)) toCreate.set(rule.id, []);
        toCreate.get(rule.id).push(tab.id);
      }
    }

    // Join existing groups (no ungroup, no churn).
    for (const [groupId, tabIds] of toJoin) {
      if (tabIds.length === 0) continue;
      try {
        await chrome.tabs.group({ groupId, tabIds });
      } catch {
        // Group vanished between query and now — fall back to creating one.
        // Find which rule owned this group id and re-queue its tabs.
        let ownerRuleId = null;
        for (const [ruleId, gid] of ruleIdToGroupId) {
          if (gid === groupId) { ownerRuleId = ruleId; break; }
        }
        if (ownerRuleId != null) {
          if (!toCreate.has(ownerRuleId)) toCreate.set(ownerRuleId, []);
          toCreate.get(ownerRuleId).push(...tabIds);
        }
      }
    }

    // Create groups only for rules that have no existing group.
    for (const [ruleId, tabIds] of toCreate) {
      if (tabIds.length === 0) continue;
      const rule = rules.find(r => r.id === ruleId);
      if (!rule) continue;
      const newGroupId = await chrome.tabs.group({ tabIds, createProperties: { windowId } });
      // Only set title/color on groups WE create — never overwrite a user's customization.
      await chrome.tabGroups.update(newGroupId, { title: rule.name, color: rule.color });
      await persistGroupMapping(windowId, ruleId, newGroupId);
      ruleIdToGroupId.set(ruleId, newGroupId);
    }

    return getActiveGroups(windowId);
  } finally {
    syncing.delete(windowId);
  }
}

// ── Auto-grouping (default ON) ───────────────────────────────────────────────

const debounceTimers = new Map(); // windowId -> timeoutId
const DEBOUNCE_MS = 400;

function scheduleSync(windowId) {
  const existing = debounceTimers.get(windowId);
  if (existing) clearTimeout(existing);
  debounceTimers.set(windowId, setTimeout(() => {
    debounceTimers.delete(windowId);
    groupTabs(windowId).catch(err => console.error('[TabPulse] auto-group failed:', err));
  }, DEBOUNCE_MS));
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Wait for the URL + title to settle before matching.
  if (changeInfo.status !== 'complete') return;
  if (!isEligible(tab)) return;
  if (!(await getAutoGroup())) return;
  scheduleSync(tab.windowId);
});

// ── Open the options page when the toolbar icon is clicked ───────────────────
// (No popup is declared, so onClicked fires.)
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

// ── Message dispatcher (same contract as tab-grouper's popup expected) ───────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const actions = {
    getRules:        () => getRules(),
    saveRules:       () => chrome.storage.sync.set({ rules: message.rules }).then(() => ({ ok: true })),
    getAutoGroup:    () => getAutoGroup().then(autoGroup => ({ autoGroup })),
    setAutoGroup:    () => chrome.storage.sync.set({ autoGroup: message.autoGroup }).then(() => ({ ok: true })),
    groupTabs:       () => groupTabs(message.windowId),
    getActiveGroups: () => getActiveGroups(message.windowId),
    closeGroup:      () => closeGroup(message.groupId, message.windowId),
    getSuggestions:  () => getSuggestions(message.windowId),
  };

  const action = actions[message.type];
  if (action) {
    action().then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true; // keep channel open for async response
  }
  // Unknown types (e.g. the content script's `settingsUpdated`) fall through.
});
