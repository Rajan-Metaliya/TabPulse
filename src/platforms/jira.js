/**
 * Jira platform plugin for Tab Status Framework.
 *
 * Handles Jira Cloud (*.atlassian.net) issue pages.
 * Uses fallback chains for resilience against UI changes.
 */

(function() {
  'use strict';

  const { waitForElement, getText, getAttributeText, safeQuerySelector } = window.TabStatusUtils;
  const { normalizeStatus } = window.TabStatusMap;
  const { register } = window.TabStatusRegistry;

  /**
   * Extract issue ID from Jira URL.
   * @param {URL} url
   * @returns {string|null} Issue key (e.g., "OPP-1234") or null
   */
  function extractIssueId(url) {
    // Match pattern: /browse/PROJECT-123
    const match = url.pathname.match(/\/browse\/([A-Z][A-Z0-9]+-\d+)/i);
    return match ? match[1].toUpperCase() : null;
  }

  /**
   * Try multiple selectors to find the status element.
   * Returns the first matching element or null.
   *
   * @param {Document} doc
   * @returns {Element|null}
   */
  function findStatusElement(doc) {
    // Selector chain - try in order from most specific to most general
    const selectors = [
      // Primary: data-testid attribute (most stable)
      '[data-testid="issue.views.issue-base.foundation.status.status-field-wrapper"]',
      '[data-testid*="status-field"]',
      '[data-testid*="status.status-field"]',

      // Secondary: common class patterns
      '[data-testid="issue.views.field.status.common.ui.status-lozenge"]',
      '[id*="status-field"]',

      // Tertiary: structural selectors (less stable)
      '[role="button"][aria-label*="Status"]',
      'button[aria-haspopup="dialog"][id*="status"]',

      // Quaternary: fallback to any status lozenge in issue view
      '#jira-issue-header [class*="status"]',
      '.issue-view [class*="status-lozenge"]',
      '.issue-header [class*="status"]'
    ];

    for (const selector of selectors) {
      const element = safeQuerySelector(selector, doc);
      if (element) {
        console.log('[TabStatus:Jira] Found status element with selector:', selector);
        return element;
      }
    }

    return null;
  }

  /**
   * Extract status text from the status element with fallbacks.
   *
   * @param {Element} statusElement
   * @returns {string} Status text or empty string
   */
  function extractStatusText(statusElement) {
    if (!statusElement) return '';

    // Try multiple extraction methods
    const methods = [
      // Method 1: Direct text content
      () => getText(statusElement),

      // Method 2: aria-label
      () => getAttributeText(statusElement, ['aria-label', 'title']),

      // Method 3: Look for nested span with status text
      () => {
        const span = statusElement.querySelector('span[class*="status"], span[data-testid*="status"]');
        return span ? getText(span) : '';
      },

      // Method 4: Look for any visible text node
      () => {
        const textNode = Array.from(statusElement.childNodes)
          .find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
        return textNode ? textNode.textContent.trim() : '';
      }
    ];

    for (const method of methods) {
      try {
        const result = method();
        if (result) {
          // Clean up common prefixes
          const cleaned = result
            .replace(/^Status:\s*/i, '')
            .replace(/^Status\s*/i, '')
            .trim();
          if (cleaned) {
            return cleaned;
          }
        }
      } catch (e) {
        console.warn('[TabStatus:Jira] Error extracting status:', e);
      }
    }

    return '';
  }

  /**
   * Try to extract Jira's native status category (color category).
   * This is more stable than text matching for standard workflows.
   *
   * @param {Element} statusElement
   * @returns {string|null} Category name or null
   */
  function extractJiraCategory(statusElement) {
    if (!statusElement) return null;

    // Look for data attributes that might contain category info
    const categoryAttrs = [
      'data-category',
      'data-status-category',
      'data-category-key'
    ];

    for (const attr of categoryAttrs) {
      const value = statusElement.getAttribute(attr);
      if (value) return value.toLowerCase();
    }

    // Try to infer from class names (Jira sometimes uses color-based classes)
    const classList = statusElement.className || '';
    const colorMatch = classList.match(/\b(blue|yellow|green|gray|grey)\b/i);
    if (colorMatch) {
      const colorMap = {
        'blue': 'indeterminate',
        'yellow': 'indeterminate',
        'green': 'done',
        'gray': 'new',
        'grey': 'new'
      };
      return colorMap[colorMatch[1].toLowerCase()] || null;
    }

    return null;
  }

  /**
   * Jira plugin implementation.
   */
  const jiraPlugin = {
    name: 'jira',

    match(url) {
      return url.hostname.endsWith('.atlassian.net') &&
             url.pathname.includes('/browse/');
    },

    async getTitleData(doc, url) {
      // Extract issue ID from URL
      const issueId = extractIssueId(url);
      if (!issueId) {
        console.warn('[TabStatus:Jira] Could not extract issue ID from URL:', url.href);
        return null;
      }

      // Wait for status element to appear (async DOM load)
      const statusElement = await waitForElement(
        // Pass all selectors to waitForElement as fallback chain
        [
          '[data-testid="issue.views.issue-base.foundation.status.status-field-wrapper"]',
          '[data-testid*="status-field"]',
          '[data-testid="issue.views.field.status.common.ui.status-lozenge"]',
          '[role="button"][aria-label*="Status"]',
          '#jira-issue-header [class*="status"]'
        ],
        { timeout: 8000, root: doc.body }
      );

      // Extract status text
      let statusText = '';
      let jiraCategory = null;

      if (statusElement) {
        statusText = extractStatusText(statusElement);
        jiraCategory = extractJiraCategory(statusElement);
        console.log('[TabStatus:Jira] Extracted status:', statusText, 'category:', jiraCategory);
      } else {
        console.warn('[TabStatus:Jira] Could not find status element for:', issueId);
      }

      // Normalize status to get category and icon
      const { category, icon } = normalizeStatus(
        statusText,
        'jira',
        { jiraCategory }
      );

      return {
        id: issueId,
        status: statusText || '',
        category,
        icon
      };
    },

    getObserveTargets(doc) {
      // Return the status element so we can watch for live status changes
      const statusElement = findStatusElement(doc);
      return statusElement ? [statusElement] : [];
    }
  };

  // Register the plugin
  register(jiraPlugin);
  console.log('[TabStatus:Jira] Plugin registered');

})();
