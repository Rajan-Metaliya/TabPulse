/**
 * Plugin registry for Tab Status Framework.
 *
 * Manages platform-specific plugins and routes URL matching to the correct plugin.
 */

(function() {
  'use strict';

/**
 * @typedef {Object} TitleData
 * @property {string} id - Work item identifier (e.g., "OPP-1234" or "#123")
 * @property {string} status - Raw human-readable status string (may be "" if not found)
 * @property {string} category - Normalized category key from statusMap
 * @property {string} icon - Icon emoji derived from category
 */

/**
 * @typedef {Object} PlatformPlugin
 * @property {string} name - Unique plugin identifier
 * @property {function(URL): boolean} match - Synchronous URL test
 * @property {function(Document, URL): Promise<TitleData|null>} getTitleData - Resolve work item and status
 * @property {function(Document): Element[]} [getObserveTargets] - Optional: DOM nodes to observe for changes
 */

class PluginRegistry {
  constructor() {
    /** @type {PlatformPlugin[]} */
    this.plugins = [];
  }

  /**
   * Register a platform plugin.
   *
   * @param {PlatformPlugin} plugin - Plugin implementation
   * @throws {Error} If plugin is invalid or duplicate name
   */
  register(plugin) {
    // Validate plugin interface
    if (!plugin.name || typeof plugin.name !== 'string') {
      throw new Error('Plugin must have a name property');
    }

    if (typeof plugin.match !== 'function') {
      throw new Error(`Plugin ${plugin.name} must implement match(url)`);
    }

    if (typeof plugin.getTitleData !== 'function') {
      throw new Error(`Plugin ${plugin.name} must implement getTitleData(document, url)`);
    }

    // Check for duplicate names
    if (this.plugins.some(p => p.name === plugin.name)) {
      console.warn(`[TabStatus] Plugin ${plugin.name} already registered, overwriting`);
      this.plugins = this.plugins.filter(p => p.name !== plugin.name);
    }

    this.plugins.push(plugin);
    console.log(`[TabStatus] Registered plugin: ${plugin.name}`);
  }

  /**
   * Find the matching plugin for the given URL.
   *
   * @param {string|URL} url - URL to match against
   * @returns {PlatformPlugin|null} Matching plugin or null
   */
  findPlugin(url) {
    const urlObj = typeof url === 'string' ? new URL(url) : url;

    for (const plugin of this.plugins) {
      try {
        if (plugin.match(urlObj)) {
          return plugin;
        }
      } catch (error) {
        console.error(`[TabStatus] Error in ${plugin.name}.match():`, error);
      }
    }

    return null;
  }

  /**
   * Get all registered plugin names.
   *
   * @returns {string[]} Array of plugin names
   */
  getPluginNames() {
    return this.plugins.map(p => p.name);
  }

  /**
   * Unregister a plugin by name.
   *
   * @param {string} name - Plugin name to remove
   * @returns {boolean} True if plugin was found and removed
   */
  unregister(name) {
    const initialLength = this.plugins.length;
    this.plugins = this.plugins.filter(p => p.name !== name);
    return this.plugins.length < initialLength;
  }
}

// Create global singleton registry
const registry = new PluginRegistry();

// Export for use in other modules
window.TabStatusRegistry = {
  register: (plugin) => registry.register(plugin),
  findPlugin: (url) => registry.findPlugin(url),
  getPluginNames: () => registry.getPluginNames(),
  unregister: (name) => registry.unregister(name)
};

console.log('[TabStatus:Registry] Exported to window.TabStatusRegistry');

})(); // End IIFE
