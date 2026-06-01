/**
 * Bitbucket platform plugin for Tab Status Framework.
 *
 * Handles Bitbucket Cloud (bitbucket.org) pull request pages.
 * Uses fallback chains for resilience against UI changes.
 */

(function() {
  'use strict';

  const { waitForElement, getText, safeQuerySelector } = window.TabStatusUtils;
  const { normalizeStatus } = window.TabStatusMap;
  const { register } = window.TabStatusRegistry;

  /**
   * Extract PR number from Bitbucket URL.
   * @param {URL} url
   * @returns {string|null} PR number prefixed with # (e.g., "#123") or null
   */
  function extractPRNumber(url) {
    // Match pattern: /pull-requests/123
    const match = url.pathname.match(/\/pull-requests\/(\d+)/);
    return match ? `#${match[1]}` : null;
  }

  /**
   * Try multiple selectors to find the PR status element.
   *
   * @param {Document} doc
   * @returns {Element|null}
   */
  function findStatusElement(doc) {
    // Selector chain - try in order from most specific to most general
    const selectors = [
      // Primary: status badge/lozenge (common Bitbucket pattern)
      '[data-testid="pullrequest-status"]',
      '[data-qa="pr-status-badge"]',

      // Secondary: look for status in header
      '.pull-request-header [class*="status"]',
      '.pr-header-status',
      '[class*="PullRequestStatus"]',

      // Tertiary: look for status lozenge/badge components
      'span[class*="Badge"][class*="status" i]',
      'span[class*="Lozenge"]',

      // Quaternary: structural fallbacks
      'header [class*="status"]',
      '.aui-lozenge',

      // Last resort: scan for common status text in header
      'h1 + div span, h1 + section span'
    ];

    for (const selector of selectors) {
      const element = safeQuerySelector(selector, doc);
      if (element) {
        const text = getText(element).toLowerCase();
        // Verify this looks like a status (contains expected keywords)
        if (text && (
          text.includes('open') ||
          text.includes('merged') ||
          text.includes('declined') ||
          text.includes('superseded') ||
          text.includes('draft')
        )) {
          console.log('[TabStatus:Bitbucket] Found status element with selector:', selector);
          return element;
        }
      }
    }

    return null;
  }

  /**
   * Extract status text from the status element.
   *
   * @param {Element} statusElement
   * @returns {string} Status text or empty string
   */
  function extractStatusText(statusElement) {
    if (!statusElement) return '';

    // Try to get clean text
    let text = getText(statusElement);

    // Clean up common artifacts
    text = text
      .replace(/^Status:\s*/i, '')
      .replace(/^PR\s+Status:\s*/i, '')
      .replace(/\s*\(.*?\)\s*/, '') // Remove parenthetical notes
      .trim();

    return text;
  }

  /**
   * Infer status from page context if direct element not found.
   * This is a last-resort fallback.
   *
   * @param {Document} doc
   * @returns {string} Status or empty string
   */
  function inferStatusFromContext(doc) {
    // Look for merge button states
    const mergeButton = safeQuerySelector('[data-testid="merge-button"], button[class*="merge" i]', doc);
    if (mergeButton) {
      const disabled = mergeButton.hasAttribute('disabled') || mergeButton.getAttribute('aria-disabled') === 'true';
      if (!disabled) {
        return 'Open'; // Can merge = likely open
      }
    }

    // Look for "merged" indicators
    const mergedIndicators = [
      '.pull-request-header [class*="merged"]',
      '[class*="MergedIcon"]',
      'svg[aria-label*="merged" i]'
    ];
    for (const selector of mergedIndicators) {
      if (safeQuerySelector(selector, doc)) {
        return 'Merged';
      }
    }

    // Look for "declined" indicators
    const declinedIndicators = [
      '[class*="DeclinedIcon"]',
      'svg[aria-label*="declined" i]'
    ];
    for (const selector of declinedIndicators) {
      if (safeQuerySelector(selector, doc)) {
        return 'Declined';
      }
    }

    // Check document title as last resort
    const title = doc.title.toLowerCase();
    if (title.includes('merged')) return 'Merged';
    if (title.includes('declined')) return 'Declined';
    if (title.includes('superseded')) return 'Declined';

    return '';
  }

  /**
   * Bitbucket plugin implementation.
   */
  const bitbucketPlugin = {
    name: 'bitbucket',

    match(url) {
      return url.hostname === 'bitbucket.org' &&
             url.pathname.includes('/pull-requests/');
    },

    async getTitleData(doc, url) {
      // Extract PR number from URL
      const prNumber = extractPRNumber(url);
      if (!prNumber) {
        console.warn('[TabStatus:Bitbucket] Could not extract PR number from URL:', url.href);
        return null;
      }

      // Wait for status element to appear
      const statusElement = await waitForElement(
        [
          '[data-testid="pullrequest-status"]',
          '[data-qa="pr-status-badge"]',
          '.pull-request-header [class*="status"]',
          'span[class*="Lozenge"]',
          'header [class*="status"]'
        ],
        { timeout: 8000, root: doc.body }
      );

      // Extract status text
      let statusText = '';

      if (statusElement) {
        statusText = extractStatusText(statusElement);
        console.log('[TabStatus:Bitbucket] Extracted status:', statusText);
      } else {
        // Fallback: try to infer from context
        statusText = inferStatusFromContext(doc);
        console.warn('[TabStatus:Bitbucket] Could not find status element, inferred:', statusText);
      }

      // If still no status, default to "Open" as that's most common
      if (!statusText) {
        statusText = 'Open';
      }

      // Normalize status to get category and icon
      const { category, icon } = normalizeStatus(statusText, 'bitbucket');

      return {
        id: prNumber,
        status: statusText,
        category,
        icon
      };
    },

    getObserveTargets(doc) {
      // Return the status element so we can watch for status changes
      const statusElement = findStatusElement(doc);
      return statusElement ? [statusElement] : [];
    }
  };

  // Register the plugin
  register(bitbucketPlugin);
  console.log('[TabStatus:Bitbucket] Plugin registered');

})();
