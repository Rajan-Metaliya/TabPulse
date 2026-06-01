/**
 * Options page script for Tab Status Framework.
 * Handles saving and loading user settings.
 */

// Default settings
const DEFAULT_SETTINGS = {
  showBadge: true,
  customPatterns: [],
  customStatusConfig: null // Will use DEFAULT_STATUS_CONFIG from statusMap.js if null
};

// Default status configuration (matches statusMap.js)
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
      'approved'
    ],
    jiraCategories: ['done', 'complete', 'green']
  },
  merged: {
    icon: '🟣',
    color: 'purple',
    label: 'Merged',
    keywords: ['merged', 'completed'],
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

/**
 * Load settings from Chrome storage.
 */
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
      resolve(settings);
    });
  });
}

/**
 * Save settings to Chrome storage.
 */
async function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(settings, () => {
      resolve();
    });
  });
}

/**
 * Show status message.
 */
function showStatus(message, type = 'success') {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = `status-message ${type}`;
  statusEl.style.display = 'block';

  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 3000);
}

/**
 * Parse custom patterns from textarea.
 */
function parseCustomPatterns(text) {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && !line.startsWith('//'));
}

/**
 * Validate URL pattern.
 */
function isValidPattern(pattern) {
  try {
    // Basic validation: must be a URL-like string
    return pattern.startsWith('http://') || pattern.startsWith('https://');
  } catch (e) {
    return false;
  }
}

/**
 * Load and populate the form with current settings.
 */
async function populateForm() {
  const settings = await loadSettings();

  // Populate checkboxes
  document.getElementById('showBadge').checked = settings.showBadge;

  // Populate custom patterns
  const patternsText = settings.customPatterns.join('\n');
  document.getElementById('customPatterns').value = patternsText;

  // Populate status configuration
  const statusConfig = settings.customStatusConfig || DEFAULT_STATUS_CONFIG;
  populateStatusConfig(statusConfig);
}

/**
 * Populate status configuration fields.
 */
function populateStatusConfig(config) {
  const categories = ['todo', 'inProgress', 'done'];

  categories.forEach(category => {
    const section = document.querySelector(`[data-category="${category}"]`);
    if (section && config[category]) {
      const textarea = section.querySelector('.status-keywords');
      if (textarea) {
        textarea.value = config[category].keywords.join('\n');
      }
    }
  });
}

/**
 * Extract status configuration from form.
 */
function extractStatusConfig() {
  const config = JSON.parse(JSON.stringify(DEFAULT_STATUS_CONFIG)); // Deep clone
  const categories = ['todo', 'inProgress', 'done'];

  categories.forEach(category => {
    const section = document.querySelector(`[data-category="${category}"]`);
    if (section) {
      const textarea = section.querySelector('.status-keywords');
      if (textarea) {
        const keywords = textarea.value
          .split('\n')
          .map(k => k.trim().toLowerCase())
          .filter(k => k);
        config[category].keywords = keywords;
      }
    }
  });

  return config;
}

/**
 * Save form data to storage.
 */
async function handleSave() {
  try {
    // Get form values
    const showBadge = document.getElementById('showBadge').checked;
    const patternsText = document.getElementById('customPatterns').value;
    const customPatterns = parseCustomPatterns(patternsText);

    // Validate patterns
    const invalidPatterns = customPatterns.filter(p => !isValidPattern(p));
    if (invalidPatterns.length > 0) {
      showStatus(`Invalid URL patterns: ${invalidPatterns.join(', ')}`, 'error');
      return;
    }

    // Get status configuration
    const customStatusConfig = extractStatusConfig();

    // Save settings
    const settings = {
      showBadge,
      customPatterns,
      customStatusConfig
    };

    await saveSettings(settings);
    showStatus('✓ Settings saved successfully!', 'success');

    // Notify content scripts to reload
    chrome.runtime.sendMessage({ type: 'settingsUpdated', settings });

  } catch (error) {
    showStatus(`Error saving settings: ${error.message}`, 'error');
    console.error('Save error:', error);
  }
}

/**
 * Reset settings to defaults.
 */
async function handleReset() {
  if (!confirm('Reset all settings to defaults?')) {
    return;
  }

  try {
    await saveSettings(DEFAULT_SETTINGS);
    await populateForm();
    showStatus('✓ Settings reset to defaults', 'success');

    // Notify content scripts
    chrome.runtime.sendMessage({ type: 'settingsUpdated', settings: DEFAULT_SETTINGS });
  } catch (error) {
    showStatus(`Error resetting settings: ${error.message}`, 'error');
  }
}

/**
 * Export configuration to JSON file.
 */
async function handleExport() {
  try {
    const settings = await loadSettings();

    // Create export object with metadata
    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      settings: {
        customStatusConfig: settings.customStatusConfig || DEFAULT_STATUS_CONFIG,
        customPatterns: settings.customPatterns
      }
    };

    // Create download
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tab-status-config-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showStatus('✓ Configuration exported!', 'success');
  } catch (error) {
    showStatus(`Error exporting: ${error.message}`, 'error');
  }
}

/**
 * Import configuration from JSON file.
 */
async function handleImport() {
  document.getElementById('importFile').click();
}

/**
 * Process imported file.
 */
async function processImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const importData = JSON.parse(text);

    // Validate import data
    if (!importData.settings || !importData.settings.customStatusConfig) {
      throw new Error('Invalid configuration file format');
    }

    // Apply imported settings
    const currentSettings = await loadSettings();
    const newSettings = {
      ...currentSettings,
      customStatusConfig: importData.settings.customStatusConfig,
      customPatterns: importData.settings.customPatterns || []
    };

    await saveSettings(newSettings);
    await populateForm();

    showStatus('✓ Configuration imported successfully!', 'success');

    // Notify content scripts
    chrome.runtime.sendMessage({ type: 'settingsUpdated', settings: newSettings });

  } catch (error) {
    showStatus(`Error importing: ${error.message}`, 'error');
    console.error('Import error:', error);
  }

  // Reset file input
  event.target.value = '';
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', async () => {
  await populateForm();

  // Attach event listeners
  document.getElementById('save').addEventListener('click', handleSave);
  document.getElementById('reset').addEventListener('click', handleReset);
  document.getElementById('exportConfig').addEventListener('click', handleExport);
  document.getElementById('importConfig').addEventListener('click', handleImport);
  document.getElementById('importFile').addEventListener('change', processImportFile);
});
