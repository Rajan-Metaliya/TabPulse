/**
 * Options-page controller for the Tab Grouping section.
 *
 * Thin UI that message-passes to src/grouping/background.js. Ported from
 * tab-grouper's popup.js, adapted to live inside TabPulse's options page:
 *   - resolves the target window via chrome.windows.getLastFocused (the options
 *     page is a full tab, so { active, currentWindow } would target itself),
 *   - routes status through TabPulse's #status element (class `status-message`).
 *
 * All grouping DOM ids are prefixed `grp-` to avoid clashing with the existing
 * title-framework options ids. The shared element is `#status`.
 */
(function () {
  let currentRules = [];
  let currentWindowId = null;
  let editingRuleId = null;

  const COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

  // ── Messaging ──────────────────────────────────────────────────────────────

  function send(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (response?.error) return reject(new Error(response.error));
        resolve(response);
      });
    });
  }

  // ── Status (reuses the existing #status element + TabPulse convention) ───────

  function showStatus(message, type = 'success') {
    const el = document.getElementById('status');
    if (!el) return;
    el.textContent = message;
    el.className = `status-message ${type}`;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Init ─────────────────────────────────────────────────────────────────

  async function init() {
    try {
      const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
      currentWindowId = win.id;
    } catch {
      const win = await chrome.windows.getCurrent();
      currentWindowId = win.id;
    }

    await Promise.all([loadRules(), loadAutoGroup()]);
    await Promise.all([loadActiveGroups(), loadSuggestions()]);
    setupListeners();
  }

  // ── Data loads ─────────────────────────────────────────────────────────────

  async function loadRules() {
    currentRules = await send({ type: 'getRules' });
    renderRules();
  }

  async function loadAutoGroup() {
    const { autoGroup } = await send({ type: 'getAutoGroup' });
    document.getElementById('grp-autoGroup').checked = !!autoGroup;
  }

  async function loadActiveGroups() {
    const groups = await send({ type: 'getActiveGroups', windowId: currentWindowId });
    renderActiveGroups(groups);
  }

  async function loadSuggestions() {
    const suggestions = await send({ type: 'getSuggestions', windowId: currentWindowId });
    renderSuggestions(suggestions);
  }

  // ── Render: Active Groups ──────────────────────────────────────────────────

  function renderActiveGroups(groups) {
    const section = document.getElementById('grp-activeGroupsSection');
    const list = document.getElementById('grp-activeGroupsList');

    if (!groups || groups.length === 0) { section.classList.add('hidden'); return; }

    section.classList.remove('hidden');
    list.innerHTML = '';

    for (const group of groups) {
      const n = group.tabIds.length;
      const item = document.createElement('div');
      item.className = 'group-item';
      item.innerHTML = `
        <span class="color-swatch color-${esc(group.color)}"></span>
        <span class="group-name">${esc(group.name)}</span>
        <span class="tab-count">${n} tab${n !== 1 ? 's' : ''}</span>
        <button class="btn-danger btn-sm close-group" data-group-id="${group.groupId}">Close All</button>
      `;
      list.appendChild(item);
    }
  }

  // ── Render: Suggestions ─────────────────────────────────────────────────────

  function renderSuggestions(suggestions) {
    const section = document.getElementById('grp-suggestionsSection');
    const list = document.getElementById('grp-suggestionsList');

    if (!suggestions || suggestions.length === 0) { section.classList.add('hidden'); return; }

    section.classList.remove('hidden');
    list.innerHTML = '';

    for (const { pattern, count } of suggestions) {
      const item = document.createElement('div');
      item.className = 'suggestion-item';
      item.innerHTML = `
        <span class="suggestion-pattern">${esc(pattern)}</span>
        <span class="tab-count">${count} tabs</span>
        <button class="btn-secondary btn-sm add-suggestion" data-pattern="${esc(pattern)}">+ Add Rule</button>
      `;
      list.appendChild(item);
    }
  }

  // ── Render: Rules ────────────────────────────────────────────────────────────

  function renderRules() {
    const list = document.getElementById('grp-rulesList');
    list.innerHTML = '';

    for (const rule of currentRules) {
      const item = document.createElement('div');
      item.className = 'rule-item';
      item.dataset.id = rule.id;

      if (rule.id === editingRuleId) {
        const colorOptions = COLORS.map(c =>
          `<option value="${c}" ${rule.color === c ? 'selected' : ''}>${c.charAt(0).toUpperCase() + c.slice(1)}</option>`
        ).join('');

        item.classList.add('editing');
        item.innerHTML = `
          <div class="edit-form">
            <input class="edit-name" type="text" value="${esc(rule.name)}"
                   placeholder="Group name" ${rule.isCatchAll ? 'disabled' : ''}>
            <input class="edit-keywords" type="text" value="${esc(rule.keywords.join(', '))}"
                   placeholder="Keywords (comma-separated)" ${rule.isCatchAll ? 'disabled' : ''}>
            <select class="edit-color">${colorOptions}</select>
            <div class="form-actions">
              <button class="btn-primary btn-sm save-edit" data-id="${rule.id}">Save</button>
              <button class="btn-ghost btn-sm cancel-edit">Cancel</button>
            </div>
          </div>
        `;
      } else {
        const keywords = rule.isCatchAll
          ? '<span class="catch-all-badge">catch-all</span>'
          : `<span class="rule-keywords">${esc(rule.keywords.join(', '))}</span>`;

        const actions = rule.isCatchAll
          ? `<button class="btn-icon edit-rule" data-id="${rule.id}" title="Edit color">✎</button>`
          : `
              <button class="btn-icon edit-rule" data-id="${rule.id}" title="Edit rule">✎</button>
              <button class="btn-icon delete-rule" data-id="${rule.id}" title="Delete rule">✕</button>
            `;

        item.innerHTML = `
          <span class="color-swatch color-${esc(rule.color)}"></span>
          <span class="rule-name">${esc(rule.name)}</span>
          ${keywords}
          <span class="rule-actions">${actions}</span>
        `;
      }

      list.appendChild(item);
    }
  }

  // ── Listeners ────────────────────────────────────────────────────────────────

  function setupListeners() {
    // Auto-group toggle
    document.getElementById('grp-autoGroup').addEventListener('change', async (e) => {
      try {
        await send({ type: 'setAutoGroup', autoGroup: e.target.checked });
        showStatus(e.target.checked ? 'Auto-grouping enabled' : 'Auto-grouping disabled', 'success');
      } catch (err) {
        showStatus(err.message, 'error');
      }
    });

    // Group Tabs Now
    document.getElementById('grp-groupBtn').addEventListener('click', async () => {
      const btn = document.getElementById('grp-groupBtn');
      btn.disabled = true;
      btn.textContent = 'Grouping…';
      try {
        const groups = await send({ type: 'groupTabs', windowId: currentWindowId });
        renderActiveGroups(groups);
        await loadSuggestions();
        showStatus('Tabs grouped!', 'success');
      } catch (err) {
        showStatus(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '⚡ Group Tabs Now';
      }
    });

    // Close All tabs in an active group
    document.getElementById('grp-activeGroupsList').addEventListener('click', async (e) => {
      const btn = e.target.closest('.close-group');
      if (!btn) return;
      btn.disabled = true;
      btn.textContent = 'Closing…';
      try {
        const groups = await send({
          type: 'closeGroup',
          groupId: parseInt(btn.dataset.groupId, 10),
          windowId: currentWindowId,
        });
        renderActiveGroups(groups);
        await loadSuggestions();
      } catch (err) {
        showStatus(err.message, 'error');
      }
    });

    // Add Rule from suggestion — pre-fill the add form
    document.getElementById('grp-suggestionsList').addEventListener('click', (e) => {
      const btn = e.target.closest('.add-suggestion');
      if (!btn) return;
      const pattern = btn.dataset.pattern;
      const namePart = pattern.split('/').pop() || pattern.split('.')[0];
      const name = namePart.charAt(0).toUpperCase() + namePart.slice(1);

      document.getElementById('grp-newRuleName').value = name;
      document.getElementById('grp-newRuleKeywords').value = pattern;
      document.getElementById('grp-addRuleForm').classList.remove('hidden');
      document.getElementById('grp-newRuleName').focus();
      document.getElementById('grp-addRuleBtn').scrollIntoView({ behavior: 'smooth' });
    });

    // Toggle Add Rule form
    document.getElementById('grp-addRuleBtn').addEventListener('click', () => {
      document.getElementById('grp-addRuleForm').classList.toggle('hidden');
    });

    // Save new rule
    document.getElementById('grp-saveRuleBtn').addEventListener('click', async () => {
      const name = document.getElementById('grp-newRuleName').value.trim();
      const keywords = document.getElementById('grp-newRuleKeywords').value
        .split(',').map(k => k.trim()).filter(Boolean);
      const color = document.getElementById('grp-newRuleColor').value;

      if (!name || keywords.length === 0) {
        showStatus('Name and at least one keyword are required', 'error');
        return;
      }

      const newRule = { id: Date.now().toString(), name, color, keywords };
      const catchAllIdx = currentRules.findIndex(r => r.isCatchAll);
      if (catchAllIdx >= 0) currentRules.splice(catchAllIdx, 0, newRule);
      else currentRules.push(newRule);

      await send({ type: 'saveRules', rules: currentRules });
      renderRules();
      await loadSuggestions();
      resetAddForm();
      showStatus('Rule added!', 'success');
    });

    document.getElementById('grp-cancelRuleBtn').addEventListener('click', resetAddForm);

    // Rule list delegation: edit, delete, save-edit, cancel-edit
    document.getElementById('grp-rulesList').addEventListener('click', async (e) => {
      const editBtn = e.target.closest('.edit-rule');
      if (editBtn) {
        editingRuleId = editBtn.dataset.id;
        renderRules();
        return;
      }

      const delBtn = e.target.closest('.delete-rule');
      if (delBtn) {
        currentRules = currentRules.filter(r => r.id !== delBtn.dataset.id);
        await send({ type: 'saveRules', rules: currentRules });
        renderRules();
        await loadSuggestions();
        return;
      }

      const saveBtn = e.target.closest('.save-edit');
      if (saveBtn) {
        const item = saveBtn.closest('.rule-item');
        const name = item.querySelector('.edit-name').value.trim();
        const rawKw = item.querySelector('.edit-keywords').value;
        const keywords = rawKw.split(',').map(k => k.trim()).filter(Boolean);
        const color = item.querySelector('.edit-color').value;
        const id = saveBtn.dataset.id;

        const rule = currentRules.find(r => r.id === id);
        if (rule) {
          if (!rule.isCatchAll && (!name || keywords.length === 0)) {
            showStatus('Name and keywords are required', 'error');
            return;
          }
          if (!rule.isCatchAll) { rule.name = name; rule.keywords = keywords; }
          rule.color = color;
          await send({ type: 'saveRules', rules: currentRules });
          await loadSuggestions();
        }
        editingRuleId = null;
        renderRules();
        showStatus('Rule updated!', 'success');
        return;
      }

      if (e.target.closest('.cancel-edit')) {
        editingRuleId = null;
        renderRules();
      }
    });
  }

  function resetAddForm() {
    document.getElementById('grp-newRuleName').value = '';
    document.getElementById('grp-newRuleKeywords').value = '';
    document.getElementById('grp-addRuleForm').classList.add('hidden');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
