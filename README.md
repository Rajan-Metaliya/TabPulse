# Tab Status Framework

A production-ready Chrome Extension (Manifest V3) that automatically rewrites browser tab titles for developer productivity tools with visual status indicators.

## 🎯 What It Does

Transforms tab titles like this:
- `[OPP-1234] Add login feature - Jira` → `🟡 OPP-1234 | In Progress`
- `Pull request #123: Fix bug - Bitbucket` → `🟣 #123 | Merged`

## ✨ Features

- **🔌 Plugin Architecture**: Easily extensible for new platforms (Jira, Bitbucket, and more)
- **🔄 SPA Navigation Support**: Works with single-page apps (detects History API changes)
- **🛡️ Resilient**: Multiple fallback selectors for each platform to handle UI changes
- **⚡ Performance**: Debounced observers, minimal CPU usage
- **🎨 Status Normalization**: Maps custom workflow statuses to consistent icon categories
- **📌 Floating Badge**: Shows status details in a corner badge when you load a page
- **⚙️ Configurable URLs**: Add your company-specific URLs via the options page

## 📦 Installation

### Load as Unpacked Extension

1. **Clone or download** this repository
2. **Open Chrome** and navigate to `chrome://extensions/`
3. **Enable "Developer mode"** (toggle in top-right)
4. Click **"Load unpacked"**
5. Select the `TabPulse` directory (containing `manifest.json`)
6. **Reload the extension** after loading (click the 🔄 icon on the extension card)

### Verify Installation

**Option 1: Test with Jira**
1. Navigate to a Jira issue (e.g., `https://yourcompany.atlassian.net/browse/PROJ-123`)
2. Open Developer Tools (F12) → Console tab
3. Look for `[TabStatus]` messages - you should see:
   ```
   [TabStatus] Initializing Tab Status Framework
   [TabStatus] Checking URL: https://...
   [TabStatus] ✓ Using plugin: jira
   [TabStatus] ✓ Got title data: {icon: "🟡", id: "PROJ-123", ...}
   [TabStatus] ✓ Setting title: 🟡 PROJ-123 | In Progress
   ```
4. The tab title should update within 1-2 seconds to show: `🟡 PROJ-123 | In Progress`

**Option 2: Test with Bitbucket**
1. Navigate to a pull request (e.g., `https://bitbucket.org/owner/repo/pull-requests/123`)
2. Open Console (F12) and check for `[TabStatus]` logs
3. Tab title should show: `🟣 #123 | Merged` (or Open/Declined)

### 🔍 Troubleshooting Installation

**If you see no logs in the console:**
- The extension may not have loaded - check `chrome://extensions/` shows it as enabled
- The URL might not match - extension only works on `*.atlassian.net/browse/*` and `bitbucket.org/*/pull-requests/*`
- Try reloading the page after enabling the extension

**If you see "No plugin matched" in the logs:**
- Verify you're on a supported URL pattern
- Check the console for the exact URL being checked

**If you see errors in the console:**
- Check that all files loaded correctly (no 404 errors)
- Try reloading the extension in `chrome://extensions/`

## 🌐 Supported Platforms

| Platform | URL Pattern | ID Format | Status Detection |
|----------|-------------|-----------|------------------|
| **Jira** | `*.atlassian.net/browse/*` | `OPP-1234` | Multiple fallback selectors |
| **Bitbucket** | `bitbucket.org/*/pull-requests/*` | `#123` | Status badge + context inference |
| **Azure DevOps** | `*.visualstudio.com/*/_git/*/pullrequest/*`<br>`dev.azure.com/*/_git/*/pullrequest/*` | `#47795` | PR state + reviewer votes |

### Azure DevOps Status Logic

The extension intelligently resolves Azure DevOps PR status using priority logic:

1. **PR State takes precedence:**
   - `Completed` → 🟣 Completed (merged)
   - `Abandoned` → 🔴 Rejected
   - `Draft` → ⚪ Draft

2. **For Active PRs, checks reviewer votes:**
   - All approved → 🟢 Approved
   - Any rejected → 🔴 Rejected
   - Otherwise → 🔵 In review

3. **CI/CD Check Status** (shown in title and badge):
   - ✅ All checks passing
   - ❌ Checks failing (e.g., "1/2 checks")
   - ⏳ Checks running
   - ⏸️ Checks pending
   - ⏹️ Checks not yet run (Draft PRs)
   - 🤖 Auto-complete enabled

**Example titles:**
- `🟣 #47795 | Completed | ✅ 2/2 checks`
- `🔵 #47795 | In review | ❌ 1/2 checks`
- `🟢 #47795 | Approved | ⏳ Checks running`
- `⚪ #41256 | Draft | ⏹️ Not yet run` ← **Draft PR**

### Adding Custom URLs

Right-click the extension icon → **Options** to add your company-specific URLs:
- Custom Jira instances (e.g., `https://jira.company.com/browse/*`)
- Self-hosted Bitbucket (e.g., `https://bitbucket.company.com/*/pull-requests/*`)
- Other Jira/Bitbucket-like platforms

The extension will automatically detect Jira and Bitbucket patterns on these URLs.

## 🎨 Status Icon Mapping

The extension normalizes platform-specific statuses to consistent categories:

| Icon | Category | Example Statuses |
|------|----------|------------------|
| ⚪ | To Do | To Do, Backlog, Open, New |
| 🟡 | In Progress | In Progress, In Review, In Dev |
| 🟢 | Done | Done, Closed, Resolved, Complete |
| 🟣 | Merged | Merged (Bitbucket PRs) |
| 🔴 | Blocked | Blocked, Declined, Rejected |
| ❔ | Unknown | Status not yet loaded or unrecognized |

### Customizing Status Mapping

Edit `src/statusMap.js` to add new categories or change mappings:

```javascript
const STATUS_CONFIG = {
  myCategory: {
    icon: '🔵',
    keywords: ['my status', 'custom status'],
    jiraCategories: ['custom'], // Jira color category mapping
    platforms: ['jira'] // Optional: limit to specific platforms
  }
};
```

## 🔧 Adding a New Platform Plugin

### 1. Create Plugin File

Create `src/platforms/yourplatform.js`:

```javascript
/**
 * Your Platform plugin for Tab Status Framework.
 */

(function() {
  'use strict';

  const { waitForElement, getText, safeQuerySelector } = window.TabStatusUtils;
  const { normalizeStatus } = window.TabStatusMap;
  const { register } = window.TabStatusRegistry;

  /**
   * Extract work item ID from URL.
   */
  function extractId(url) {
    // Example: /issues/TICKET-123
    const match = url.pathname.match(/\/issues\/([A-Z]+-\d+)/);
    return match ? match[1] : null;
  }

  /**
   * Find status element with fallback selectors.
   */
  function findStatusElement(doc) {
    const selectors = [
      '[data-testid="status"]',
      '.status-badge',
      '[class*="status"]'
    ];

    for (const selector of selectors) {
      const element = safeQuerySelector(selector, doc);
      if (element) return element;
    }
    return null;
  }

  /**
   * Plugin implementation.
   */
  const yourPlatformPlugin = {
    name: 'yourplatform',

    match(url) {
      // Return true if this URL belongs to your platform
      return url.hostname === 'yourplatform.com' &&
             url.pathname.includes('/issues/');
    },

    async getTitleData(doc, url) {
      // 1. Extract ID from URL
      const id = extractId(url);
      if (!id) return null;

      // 2. Wait for status element (async DOM)
      const statusElement = await waitForElement(
        [
          '[data-testid="status"]',
          '.status-badge',
          '[class*="status"]'
        ],
        { timeout: 8000, root: doc.body }
      );

      // 3. Extract status text
      const statusText = statusElement ? getText(statusElement) : '';

      // 4. Normalize to category and icon
      const { category, icon } = normalizeStatus(statusText, 'yourplatform');

      // 5. Return formatted data
      return {
        id,
        status: statusText,
        category,
        icon
      };
    },

    getObserveTargets(doc) {
      // Return elements to watch for live status changes
      const statusElement = findStatusElement(doc);
      return statusElement ? [statusElement] : [];
    }
  };

  // Register the plugin
  register(yourPlatformPlugin);
  console.log('[TabStatus:YourPlatform] Plugin registered');

})();
```

### 2. Update manifest.json

Add your platform's URL patterns:

```json
{
  "content_scripts": [
    {
      "matches": [
        "https://*.atlassian.net/browse/*",
        "https://bitbucket.org/*/pull-requests/*",
        "https://yourplatform.com/issues/*"  // Add this
      ],
      "js": [
        "src/utils.js",
        "src/statusMap.js",
        "src/registry.js",
        "src/titleManager.js",
        "src/platforms/jira.js",
        "src/platforms/bitbucket.js",
        "src/platforms/yourplatform.js",  // Add this
        "src/content.js"
      ],
      "run_at": "document_idle"
    }
  ],
  "host_permissions": [
    "https://*.atlassian.net/*",
    "https://bitbucket.org/*",
    "https://yourplatform.com/*"  // Add this
  ]
}
```

### 3. Test Your Plugin

1. Reload the extension in `chrome://extensions/`
2. Navigate to your platform's work item page
3. Check the console (F12) for plugin logs
4. Verify the tab title updates correctly

## 🏗️ Architecture

```
manifest.json           # Extension configuration
src/
  content.js            # Orchestrator: routing, navigation, coordination
  registry.js           # Plugin registry (register/find plugins)
  titleManager.js       # Title management with loop prevention
  statusMap.js          # Status normalization and icon mapping
  utils.js              # Shared utilities (waitForElement, debounce, etc.)
  platforms/
    jira.js             # Jira plugin
    bitbucket.js        # Bitbucket plugin
```

### Key Components

- **Orchestrator (`content.js`)**: Detects SPA navigation, routes to plugins, manages title updates
- **Title Manager**: Owns `document.title`, prevents infinite loops with MutationObserver
- **Registry**: Maps URLs to platform plugins
- **Status Map**: Normalizes platform-specific statuses to consistent categories
- **Plugins**: Self-contained platform implementations with fallback chains

## 🐛 Troubleshooting

### Title Not Updating

1. **Check console logs** (F12 → Console): Look for `[TabStatus]` messages
2. **Verify URL matches**: Plugin must match the URL pattern
3. **Check selector health**: Platform may have changed their DOM structure

### Infinite Loop / Flickering Title

- The `titleManager.js` has built-in loop prevention
- If it backs off, check for conflicting extensions modifying the title

### Status Not Found

- The extension shows `❔ ID` when status hasn't loaded yet
- Check `getObserveTargets()` in the plugin to ensure status elements are being watched
- Consider increasing `timeout` in `waitForElement()` calls

### SPA Navigation Not Detected

- Verify `history.pushState` / `history.replaceState` patching is working
- Check if the platform uses non-standard navigation (e.g., `location.href` assignment)

## 🔍 Known Limitations

### Selector Maintenance

Platform UIs change frequently. Selectors most likely to need updates:

- **Jira**: `data-testid` attributes (Atlassian changes these with redesigns)
- **Bitbucket**: Status badge classes (Atlassian may update component library)

### Status Detection Edge Cases

- **Custom Jira workflows**: If your org uses very custom status names, add them to `statusMap.js`
- **Bitbucket Draft PRs**: Currently treated as "Open" (Draft detection is challenging)

### Performance

- The extension is optimized with debouncing (100-300ms delays)
- On very large/complex pages, initial load may take 2-3 seconds
- Status observation uses mutation observers (minimal overhead)

## 📝 Development Tips

### Debugging Plugins

Enable verbose logging by opening the console (F12) and look for `[TabStatus:PluginName]` messages.

### Testing Selector Changes

Use the browser console to test selectors:

```javascript
// Test if a selector works
document.querySelector('[data-testid="status"]');

// Test with the extension's safe wrapper
window.TabStatusUtils.safeQuerySelector('[data-testid="status"]');
```

### Adding Fallback Selectors

Always provide multiple selectors in order from most specific to most general:

```javascript
const selectors = [
  '[data-testid="exact-id"]',        // Most specific
  '[data-testid*="partial-match"]',   // Partial match
  '[class*="fallback-class"]',        // Class-based
  'header [role="button"]'            // Structural
];
```

## 📜 License

MIT License - feel free to fork and customize for your needs.

## 🤝 Contributing

Contributions welcome! Please:

1. Keep plugins self-contained (no cross-plugin dependencies)
2. Provide fallback selector chains
3. Test with SPA navigation (don't just reload the page)
4. Document any platform-specific quirks

## 🔮 Future Enhancements

Potential features (not yet implemented):

- Options UI for customizing status mappings
- Background service worker for sync across tabs
- Export/import custom configurations
- Support for GitHub Issues/PRs
- Support for Linear
- Support for Asana

---

**Need help?** Open an issue with:
- Platform and URL
- Console logs (F12 → Console)
- Expected vs actual behavior
