/**
 * Title manager for Tab Status Framework.
 *
 * Manages document.title updates and prevents infinite loops when the platform
 * tries to rewrite the title. Uses a MutationObserver on the <title> element
 * to re-apply our custom title when the app overwrites it.
 */

(function() {
  'use strict';

  // Check dependencies
  if (!window.TabStatusUtils) {
    console.error('[TabStatus:TitleManager] TabStatusUtils not loaded!');
    return;
  }

  const { debounce } = window.TabStatusUtils;

class TitleManager {
  constructor() {
    /** @type {string|null} Last title we wrote (for loop prevention) */
    this.lastSetTitle = null;

    /** @type {MutationObserver|null} Observer for <title> element changes */
    this.titleObserver = null;

    /** @type {string|null} The custom title we want to maintain */
    this.desiredTitle = null;

    /** @type {number} Counter to detect rapid oscillation */
    this.mutationCount = 0;

    /** @type {number} Timestamp of last mutation reset */
    this.lastMutationReset = Date.now();

    this.init();
  }

  /**
   * Initialize the title observer.
   */
  init() {
    const titleElement = document.querySelector('title');
    if (!titleElement) {
      console.warn('[TabStatus] No <title> element found');
      return;
    }

    // Debounced handler to avoid tight loops
    const debouncedHandler = debounce(() => this.handleTitleMutation(), 100);

    this.titleObserver = new MutationObserver((mutations) => {
      // Reset counter periodically to avoid false positives
      if (Date.now() - this.lastMutationReset > 5000) {
        this.mutationCount = 0;
        this.lastMutationReset = Date.now();
      }

      this.mutationCount++;

      // Safety: if we see too many mutations in a short time, back off
      if (this.mutationCount > 20) {
        console.warn('[TabStatus] Too many title mutations, backing off');
        this.stop();
        return;
      }

      debouncedHandler();
    });

    this.titleObserver.observe(titleElement, {
      childList: true,
      characterData: true,
      subtree: true
    });

    console.log('[TabStatus] Title observer initialized');
  }

  /**
   * Handle title element mutation.
   * Re-applies our desired title if the platform overwrote it.
   */
  handleTitleMutation() {
    const currentTitle = document.title;

    // If the current title is what we set, ignore (this is our own mutation)
    if (currentTitle === this.lastSetTitle) {
      return;
    }

    // If we have a desired title and it's different from current, re-apply
    if (this.desiredTitle && currentTitle !== this.desiredTitle) {
      console.log('[TabStatus] Title was overwritten, re-applying:', this.desiredTitle);
      this.applyTitle(this.desiredTitle);
    }
  }

  /**
   * Set the document title and track it.
   *
   * @param {string} title - The title to set
   */
  setTitle(title) {
    if (!title || typeof title !== 'string') {
      console.warn('[TabStatus] Invalid title:', title);
      return;
    }

    this.desiredTitle = title;
    this.applyTitle(title);
  }

  /**
   * Actually write the title to the DOM.
   *
   * @param {string} title - The title to write
   */
  applyTitle(title) {
    try {
      // Temporarily pause observation to avoid detecting our own change
      this.pause();

      document.title = title;
      this.lastSetTitle = title;

      // Resume observation after a short delay
      setTimeout(() => this.resume(), 50);
    } catch (error) {
      console.error('[TabStatus] Error setting title:', error);
    }
  }

  /**
   * Clear the custom title (revert to platform default).
   */
  clearTitle() {
    this.desiredTitle = null;
    this.lastSetTitle = null;
    // Don't actively revert the title, just stop enforcing ours
  }

  /**
   * Pause title observation temporarily.
   */
  pause() {
    if (this.titleObserver) {
      this.titleObserver.disconnect();
    }
  }

  /**
   * Resume title observation.
   */
  resume() {
    const titleElement = document.querySelector('title');
    if (this.titleObserver && titleElement) {
      this.titleObserver.observe(titleElement, {
        childList: true,
        characterData: true,
        subtree: true
      });
    }
  }

  /**
   * Stop observing and clean up.
   */
  stop() {
    if (this.titleObserver) {
      this.titleObserver.disconnect();
      this.titleObserver = null;
    }
    this.clearTitle();
    console.log('[TabStatus] Title manager stopped');
  }

  /**
   * Restart the title manager (useful after errors).
   */
  restart() {
    this.stop();
    this.mutationCount = 0;
    this.lastMutationReset = Date.now();
    this.init();
  }
}

// Create global singleton with error handling
let titleManager;
try {
  titleManager = new TitleManager();
  console.log('[TabStatus:TitleManager] Initialized successfully');
} catch (error) {
  console.error('[TabStatus:TitleManager] Initialization error:', error);
  // Create a dummy titleManager so exports don't fail
  titleManager = {
    setTitle: (title) => { document.title = title; },
    clearTitle: () => {},
    pause: () => {},
    resume: () => {},
    stop: () => {},
    restart: () => {}
  };
}

// Export for use in other modules
window.TabStatusTitleManager = {
  setTitle: (title) => titleManager.setTitle(title),
  clearTitle: () => titleManager.clearTitle(),
  pause: () => titleManager.pause(),
  resume: () => titleManager.resume(),
  stop: () => titleManager.stop(),
  restart: () => titleManager.restart()
};

console.log('[TabStatus:TitleManager] Exported to window.TabStatusTitleManager');

})(); // End IIFE
