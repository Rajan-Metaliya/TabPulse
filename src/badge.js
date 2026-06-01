/**
 * Page badge overlay for Tab Status Framework.
 * Displays a floating badge on the page with status information.
 */

(function() {
  'use strict';

  let badge = null;
  let hideTimeout = null;

  /**
   * Create the status badge element.
   */
  function createBadge() {
    const badgeEl = document.createElement('div');
    badgeEl.id = 'tab-status-badge';
    badgeEl.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.85);
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      font-weight: 500;
      z-index: 999999;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      transition: opacity 0.3s ease, transform 0.3s ease;
      opacity: 0;
      transform: translateY(-10px);
      pointer-events: none;
      max-width: 300px;
      line-height: 1.4;
    `;
    document.body.appendChild(badgeEl);
    return badgeEl;
  }

  /**
   * Show the status badge with information.
   *
   * @param {Object} titleData - Title data from plugin
   */
  function showBadge(titleData) {
    if (!titleData) return;

    // Create badge if it doesn't exist
    if (!badge) {
      badge = createBadge();
    }

    const { icon, id, status, category, checks } = titleData;

    // Format badge content
    let content = `${icon} <strong>${id}</strong>`;
    if (status) {
      content += `<br><span style="opacity: 0.8;">Status: ${status}</span>`;
    }

    // Add check status if available (Azure DevOps)
    if (checks && checks.status) {
      const checkIcon = getCheckIcon(checks.status);
      let checkLine = `<br><span style="opacity: 0.9;">${checkIcon} Checks: `;

      if (checks.summary) {
        checkLine += checks.summary;
      } else {
        checkLine += checks.status;
      }

      // Color coding based on status
      if (checks.status === 'failing') {
        checkLine = checkLine.replace(/opacity: 0\.9/, 'opacity: 1; color: #ff6b6b; font-weight: 600');
      } else if (checks.status === 'passing') {
        checkLine = checkLine.replace(/opacity: 0\.9/, 'opacity: 1; color: #51cf66');
      } else if (checks.status === 'running') {
        checkLine = checkLine.replace(/opacity: 0\.9/, 'opacity: 1; color: #4c9eff');
      } else if (checks.status === 'not-started') {
        checkLine = checkLine.replace(/opacity: 0\.9/, 'opacity: 0.7; color: #adb5bd');
      }

      checkLine += '</span>';
      content += checkLine;
    }

    // Add auto-complete or other details
    if (checks && checks.details && checks.details.length > 0) {
      content += `<br><span style="opacity: 0.7; font-size: 11px;">🤖 ${checks.details.join(', ')}</span>`;
    }

    if (category && category !== 'unknown') {
      content += `<br><span style="opacity: 0.6; font-size: 11px;">Category: ${category}</span>`;
    }

    badge.innerHTML = content;

    // Show with animation
    requestAnimationFrame(() => {
      badge.style.opacity = '1';
      badge.style.transform = 'translateY(0)';
    });

    // Auto-hide after 4 seconds (longer if checks present)
    const hideDelay = (checks && checks.status) ? 5000 : 3000;
    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(hideBadge, hideDelay);
  }

  /**
   * Get icon for check status.
   *
   * @param {string} status - Check status
   * @returns {string} Icon
   */
  function getCheckIcon(status) {
    switch (status) {
      case 'passing': return '✅';
      case 'failing': return '❌';
      case 'running': return '⏳';
      case 'pending': return '⏸️';
      case 'not-started': return '⏹️';
      default: return '❔';
    }
  }

  /**
   * Hide the badge.
   */
  function hideBadge() {
    if (!badge) return;

    badge.style.opacity = '0';
    badge.style.transform = 'translateY(-10px)';
  }

  /**
   * Update badge with new data.
   *
   * @param {Object} titleData - Title data from plugin
   */
  function updateBadge(titleData) {
    showBadge(titleData);
  }

  /**
   * Remove the badge.
   */
  function removeBadge() {
    if (badge) {
      badge.remove();
      badge = null;
    }
    clearTimeout(hideTimeout);
  }

  // Export for use in other modules
  window.TabStatusBadge = {
    show: showBadge,
    hide: hideBadge,
    update: updateBadge,
    remove: removeBadge
  };

  console.log('[TabStatus:Badge] Exported to window.TabStatusBadge');

})();
