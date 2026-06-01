/**
 * Status normalization and icon mapping for Tab Status Framework.
 *
 * This module provides a single source of truth for mapping raw platform-specific
 * status strings to normalized categories with icons. This allows for consistent
 * icon display across custom workflows (e.g., Jira's customizable statuses).
 */

(function() {
  'use strict';

/**
 * Status category configuration.
 * Each category has an icon and a list of keywords/patterns to match against.
 *
 * CUSTOMIZATION: Edit this object to add new categories or change icons/mappings.
 * Or use the Options page to configure without editing code.
 */
const DEFAULT_STATUS_CONFIG = {
  todo: {
    icon: '⚪',
    color: 'gray',
    label: 'To Do',
    keywords: [
      'to do', 'todo', 'backlog', 'open', 'selected', 'new', 'ready',
      'draft', 'hold', 'paused', 'in scoping', 'pending po approval',
      'refined', 'scoped and ready for refinement', 'ready for development'
    ],
    jiraCategories: ['new', 'indeterminate']
  },
  inProgress: {
    icon: '🔵',
    color: 'blue',
    label: 'In Progress',
    keywords: [
      'in progress', 'in dev', 'in development', 'reviewing', 'code review', 'wip', 'work in progress',
      'blocked', 'ready for testing', 'qa in progress', 'development complete',
      'added to release branch', 'in qa', 'testing',
      // Azure DevOps
      'in review', 'waiting for author', 'active'
    ],
    jiraCategories: ['indeterminate', 'yellow', 'blue']
  },
  done: {
    icon: '🟢',
    color: 'green',
    label: 'Done',
    keywords: [
      'done', 'closed', 'resolved', 'complete', 'completed', 'finished', 'fixed',
      'cannot reproduce', 'not needed', 'duplicate', 'not a bug',
      'qa completed', 'ready for uat', 'ready for po acceptance',
      'uat not required', 'uat in progress', 'uat complete', 'released',
      // Azure DevOps
      'approved'
    ],
    jiraCategories: ['done', 'complete', 'green']
  },
  merged: {
    icon: '🟣',
    color: 'purple',
    label: 'Merged',
    keywords: ['merged', 'completed'], // Azure DevOps uses "Completed" for merged PRs
    platforms: ['bitbucket', 'azure']
  },
  blocked: {
    icon: '🔴',
    color: 'red',
    label: 'Blocked',
    keywords: ['declined', 'rejected', 'abandoned', 'cancelled', 'canceled', 'failed'],
    jiraCategories: []
  },
  unknown: {
    icon: '❔',
    color: 'gray',
    label: 'Unknown',
    keywords: [],
    isFallback: true
  }
};

// Current active configuration (will be loaded from storage)
let STATUS_CONFIG = { ...DEFAULT_STATUS_CONFIG };

/**
 * Load custom status configuration from storage.
 */
async function loadCustomStatusConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ customStatusConfig: null }, (result) => {
      if (result.customStatusConfig) {
        STATUS_CONFIG = result.customStatusConfig;
        console.log('[TabStatus:StatusMap] Loaded custom status config');
      } else {
        STATUS_CONFIG = { ...DEFAULT_STATUS_CONFIG };
        console.log('[TabStatus:StatusMap] Using default status config');
      }
      resolve(STATUS_CONFIG);
    });
  });
}

/**
 * Normalize a raw status string to a category.
 *
 * @param {string} rawStatus - The raw status text from the platform
 * @param {string} platform - Platform identifier ('jira', 'bitbucket', etc.)
 * @param {Object} metadata - Additional metadata (e.g., jiraCategory for Jira's color category)
 * @returns {Object} { category: string, icon: string }
 */
function normalizeStatus(rawStatus, platform = '', metadata = {}) {
  if (!rawStatus || typeof rawStatus !== 'string') {
    return {
      category: 'unknown',
      icon: STATUS_CONFIG.unknown.icon
    };
  }

  const normalizedStatus = rawStatus.toLowerCase().trim();

  // Try to match against each category
  for (const [categoryKey, config] of Object.entries(STATUS_CONFIG)) {
    if (config.isFallback) continue; // Skip fallback category in matching

    // Check platform-specific categories (e.g., Jira color categories)
    if (platform === 'jira' && metadata.jiraCategory) {
      const jiraCat = metadata.jiraCategory.toLowerCase();
      if (config.jiraCategories && config.jiraCategories.includes(jiraCat)) {
        return {
          category: categoryKey,
          icon: config.icon
        };
      }
    }

    // Check platform restriction
    if (config.platforms && !config.platforms.includes(platform)) {
      continue;
    }

    // Check keyword matching
    for (const keyword of config.keywords) {
      if (normalizedStatus.includes(keyword)) {
        return {
          category: categoryKey,
          icon: config.icon
        };
      }
    }
  }

  // No match found, return unknown
  return {
    category: 'unknown',
    icon: STATUS_CONFIG.unknown.icon
  };
}

/**
 * Get the icon for a specific category directly.
 *
 * @param {string} category - Category key
 * @returns {string} Icon emoji or '❔' if not found
 */
function getIconForCategory(category) {
  return STATUS_CONFIG[category]?.icon || STATUS_CONFIG.unknown.icon;
}

/**
 * Get all available categories (useful for debugging/options UI).
 *
 * @returns {Object} The complete status configuration
 */
function getAllCategories() {
  return { ...STATUS_CONFIG };
}

// Export for use in other modules
window.TabStatusMap = {
  normalizeStatus,
  getIconForCategory,
  getAllCategories,
  loadCustomStatusConfig,
  DEFAULT_STATUS_CONFIG,
  get STATUS_CONFIG() { return STATUS_CONFIG; }
};

// Initialize: load custom config if available
if (typeof chrome !== 'undefined' && chrome.storage) {
  loadCustomStatusConfig().catch(err => {
    console.warn('[TabStatus:StatusMap] Failed to load custom config:', err);
  });
}

console.log('[TabStatus:StatusMap] Exported to window.TabStatusMap');

})(); // End IIFE
