/**
 * Content script orchestrator for Tab Status Framework.
 *
 * This is the main entry point that:
 * 1. Detects SPA navigation (history API changes)
 * 2. Routes to the appropriate platform plugin
 * 3. Formats and applies the custom title
 * 4. Observes for live status changes
 */

(function() {
  'use strict';

  const { debounce } = window.TabStatusUtils;
  const { findPlugin } = window.TabStatusRegistry;
  const { setTitle, clearTitle } = window.TabStatusTitleManager;
  const { show: showBadge, update: updateBadge } = window.TabStatusBadge || {};

  /**
   * Current state tracking.
   */
  let currentPlugin = null;
  let statusObserver = null;
  let lastUrl = null;
  let settings = { showBadge: true, customPatterns: [] };

  /**
   * Format title data into the display string.
   *
   * @param {Object} titleData - From plugin's getTitleData()
   * @returns {string} Formatted title
   */
  function formatTitle(titleData) {
    if (!titleData) {
      console.warn('[TabStatus] No title data to format');
      return null;
    }

    const { icon, id, status, checks } = titleData;

    // Always show at least icon + id
    const displayIcon = icon || '❔';
    const displayId = id || 'Unknown';

    console.log('[TabStatus] Formatting title:', { icon: displayIcon, id: displayId, status, checks });

    // Build title parts
    let titleParts = [`${displayIcon} ${displayId}`];

    // Add status if available
    if (status && status.trim()) {
      titleParts.push(status);
    }

    // Add check status indicator if available (for Azure DevOps)
    if (checks && checks.status) {
      const checkIcon = getCheckStatusIcon(checks.status);
      if (checks.summary) {
        titleParts.push(`${checkIcon} ${checks.summary}`);
      } else if (checks.status === 'failing') {
        titleParts.push(`${checkIcon} Checks failing`);
      } else if (checks.status === 'running') {
        titleParts.push(`${checkIcon} Checks running`);
      } else if (checks.status === 'not-started') {
        titleParts.push(`${checkIcon} Checks not run`);
      }
    }

    // Join with separator
    return titleParts.join(' | ');
  }

  /**
   * Get icon for check status in title.
   *
   * @param {string} status - Check status
   * @returns {string} Icon
   */
  function getCheckStatusIcon(status) {
    switch (status) {
      case 'passing': return '✅';
      case 'failing': return '❌';
      case 'running': return '⏳';
      case 'pending': return '⏸️';
      case 'not-started': return '⏹️';
      default: return '';
    }
  }

  /**
   * Update the tab title for the current page.
   * This is the main coordination function.
   */
  async function updateTitle() {
    try {
      const url = new URL(window.location.href);
      console.log('[TabStatus] Checking URL:', url.href);

      // Find matching plugin
      const plugin = findPlugin(url);

      if (!plugin) {
        console.log('[TabStatus] No plugin matched for:', url.href);
        cleanup();
        return;
      }

      console.log('[TabStatus] ✓ Using plugin:', plugin.name);

      // Get title data from plugin
      const titleData = await plugin.getTitleData(document, url);

      if (!titleData) {
        console.warn('[TabStatus] Plugin returned no title data');
        cleanup();
        return;
      }

      console.log('[TabStatus] ✓ Got title data:', titleData);

      // Format and apply title
      const formattedTitle = formatTitle(titleData);
      if (formattedTitle) {
        console.log('[TabStatus] ✓ Setting title:', formattedTitle);
        setTitle(formattedTitle);

        // Show badge if enabled
        if (settings.showBadge && showBadge) {
          showBadge(titleData);
        }
      } else {
        console.error('[TabStatus] Failed to format title');
      }

      // Set up observers for live updates
      setupStatusObserver(plugin);

      // Track current state
      currentPlugin = plugin;

    } catch (error) {
      console.error('[TabStatus] Error updating title:', error);
    }
  }

  /**
   * Set up mutation observer for status changes.
   *
   * @param {Object} plugin - Current platform plugin
   */
  function setupStatusObserver(plugin) {
    // Clean up existing observer
    if (statusObserver) {
      statusObserver.disconnect();
      statusObserver = null;
    }

    // Get elements to observe from plugin
    if (!plugin.getObserveTargets) {
      return; // Plugin doesn't support observation
    }

    const targets = plugin.getObserveTargets(document);
    if (!targets || targets.length === 0) {
      console.log('[TabStatus] No observe targets from plugin');
      return;
    }

    // Create debounced update handler
    const debouncedUpdate = debounce(() => {
      console.log('[TabStatus] Status changed, updating title');
      updateTitle();
    }, 300);

    // Observe each target
    statusObserver = new MutationObserver(() => {
      debouncedUpdate();
    });

    targets.forEach(target => {
      if (target && target.nodeType === Node.ELEMENT_NODE) {
        statusObserver.observe(target, {
          childList: true,
          characterData: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'aria-label', 'title', 'data-testid']
        });
        console.log('[TabStatus] Observing status element for changes');
      }
    });
  }

  /**
   * Clean up observers and state.
   */
  function cleanup() {
    if (statusObserver) {
      statusObserver.disconnect();
      statusObserver = null;
    }
    currentPlugin = null;
    clearTitle();
  }

  /**
   * Detect and handle SPA navigation.
   * Jira and Bitbucket use the History API for in-app navigation,
   * so we need to patch it to detect URL changes.
   */
  function setupNavigationDetection() {
    // Store original functions
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    // Debounced handler for navigation changes
    const handleNavigation = debounce(() => {
      const newUrl = window.location.href;
      if (newUrl !== lastUrl) {
        console.log('[TabStatus] Navigation detected:', newUrl);
        lastUrl = newUrl;
        updateTitle();
      }
    }, 300);

    // Patch pushState
    history.pushState = function(...args) {
      originalPushState.apply(history, args);
      handleNavigation();
    };

    // Patch replaceState
    history.replaceState = function(...args) {
      originalReplaceState.apply(history, args);
      handleNavigation();
    };

    // Listen for popstate (browser back/forward)
    window.addEventListener('popstate', () => {
      console.log('[TabStatus] Popstate detected');
      handleNavigation();
    });

    // Also listen for hashchange (some SPAs use this)
    window.addEventListener('hashchange', () => {
      console.log('[TabStatus] Hashchange detected');
      handleNavigation();
    });

    console.log('[TabStatus] Navigation detection initialized');
  }

  /**
   * Load settings from Chrome storage.
   */
  async function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get({ showBadge: true, customPatterns: [] }, (result) => {
        resolve(result);
      });
    });
  }

  /**
   * Initialize the extension.
   */
  async function init() {
    console.log('[TabStatus] Initializing Tab Status Framework');

    // Load settings
    try {
      settings = await loadSettings();
      console.log('[TabStatus] Settings loaded:', settings);
    } catch (error) {
      console.warn('[TabStatus] Could not load settings, using defaults:', error);
    }

    // Set up navigation detection for SPA routing
    setupNavigationDetection();

    // Store initial URL
    lastUrl = window.location.href;

    // Initial title update
    updateTitle();

    // Also update on DOM changes (for very dynamic pages)
    // This is a backup mechanism in case navigation detection misses something
    const documentObserver = new MutationObserver(debounce(() => {
      const newUrl = window.location.href;
      if (newUrl !== lastUrl) {
        console.log('[TabStatus] URL change detected via DOM observer');
        lastUrl = newUrl;
        updateTitle();
      }
    }, 500));

    documentObserver.observe(document.body, {
      childList: true,
      subtree: false // Only observe direct children for performance
    });

    console.log('[TabStatus] Initialization complete');
  }

  /**
   * Listen for settings updates from options page.
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'settingsUpdated') {
      console.log('[TabStatus] Settings updated:', message.settings);
      settings = message.settings;

      // Reload status config
      if (window.TabStatusMap && window.TabStatusMap.loadCustomStatusConfig) {
        window.TabStatusMap.loadCustomStatusConfig();
      }

      // Refresh the current page status
      updateTitle();
    }
  });

  // Start the extension when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM already loaded
    init();
  }

  // Handle page unload
  window.addEventListener('beforeunload', () => {
    cleanup();
  });

})();
