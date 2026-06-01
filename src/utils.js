/**
 * Core utilities for Tab Status Framework
 */

(function() {
  'use strict';

/**
 * Wait for an element to appear in the DOM with timeout and retry logic.
 * Uses MutationObserver for efficiency but falls back to polling if needed.
 *
 * @param {string|string[]} selectors - CSS selector(s) to wait for (tries in order)
 * @param {Object} options - Configuration options
 * @param {number} options.timeout - Max time to wait in milliseconds (default: 10000)
 * @param {Element} options.root - Root element to search within (default: document.body)
 * @param {number} options.pollInterval - Polling fallback interval in ms (default: 100)
 * @returns {Promise<Element|null>} The found element or null if timeout
 */
function waitForElement(selectors, options = {}) {
  const {
    timeout = 10000,
    root = document.body,
    pollInterval = 100
  } = options;

  const selectorArray = Array.isArray(selectors) ? selectors : [selectors];

  return new Promise((resolve) => {
    // Try immediate lookup first
    for (const selector of selectorArray) {
      const element = root.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }
    }

    let timeoutId;
    let observer;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (observer) observer.disconnect();
    };

    const check = () => {
      for (const selector of selectorArray) {
        const element = root.querySelector(selector);
        if (element) {
          cleanup();
          resolve(element);
          return true;
        }
      }
      return false;
    };

    // Set up MutationObserver
    observer = new MutationObserver(() => {
      check();
    });

    observer.observe(root, {
      childList: true,
      subtree: true
    });

    // Set up timeout
    timeoutId = setTimeout(() => {
      cleanup();
      resolve(null);
    }, timeout);

    // Polling fallback for very dynamic pages
    const pollTimeoutId = setInterval(() => {
      if (check()) {
        clearInterval(pollTimeoutId);
      }
    }, pollInterval);

    // Clear polling on timeout
    setTimeout(() => clearInterval(pollTimeoutId), timeout);
  });
}

/**
 * Debounce function to limit execution rate.
 *
 * @param {Function} func - Function to debounce
 * @param {number} wait - Milliseconds to wait
 * @param {boolean} immediate - Execute on leading edge if true
 * @returns {Function} Debounced function
 */
function debounce(func, wait, immediate = false) {
  let timeout;
  return function executedFunction(...args) {
    const context = this;
    const later = () => {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
}

/**
 * Extract visible text from an element, cleaning up whitespace.
 *
 * @param {Element} element - DOM element to extract text from
 * @returns {string} Cleaned text content
 */
function getText(element) {
  if (!element) return '';

  // Use innerText for visible text (respects CSS display/visibility)
  const text = element.innerText || element.textContent || '';
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * Extract text from element's attribute with fallbacks.
 *
 * @param {Element} element - DOM element
 * @param {string[]} attributes - Attribute names to try in order
 * @returns {string} First non-empty attribute value or empty string
 */
function getAttributeText(element, attributes) {
  if (!element) return '';

  for (const attr of attributes) {
    const value = element.getAttribute(attr);
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

/**
 * Safe querySelector that returns null instead of throwing.
 *
 * @param {string} selector - CSS selector
 * @param {Element} root - Root element to search within
 * @returns {Element|null}
 */
function safeQuerySelector(selector, root = document) {
  try {
    return root.querySelector(selector);
  } catch (e) {
    console.warn('[TabStatus] Invalid selector:', selector, e);
    return null;
  }
}

/**
 * Safe querySelectorAll that returns empty array instead of throwing.
 *
 * @param {string} selector - CSS selector
 * @param {Element} root - Root element to search within
 * @returns {Element[]}
 */
function safeQuerySelectorAll(selector, root = document) {
  try {
    return Array.from(root.querySelectorAll(selector));
  } catch (e) {
    console.warn('[TabStatus] Invalid selector:', selector, e);
    return [];
  }
}

// Export for use in other modules
window.TabStatusUtils = {
  waitForElement,
  debounce,
  getText,
  getAttributeText,
  safeQuerySelector,
  safeQuerySelectorAll
};

console.log('[TabStatus:Utils] Exported to window.TabStatusUtils');

})(); // End IIFE
