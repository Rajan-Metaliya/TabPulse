/**
 * Azure DevOps platform plugin for Tab Status Framework.
 *
 * Handles Azure DevOps (both visualstudio.com and dev.azure.com) pull request pages.
 * Uses fallback chains for resilience against UI changes.
 */

(function() {
  'use strict';

  const { waitForElement, getText, safeQuerySelector, safeQuerySelectorAll } = window.TabStatusUtils;
  const { normalizeStatus } = window.TabStatusMap;
  const { register } = window.TabStatusRegistry;

  /**
   * Extract PR number from Azure DevOps URL.
   * @param {URL} url
   * @returns {string|null} PR number prefixed with # (e.g., "#47795") or null
   */
  function extractPRNumber(url) {
    // Match pattern: /pullrequest/47795
    const match = url.pathname.match(/\/pullrequest\/(\d+)/);
    return match ? `#${match[1]}` : null;
  }

  /**
   * Try multiple selectors to find the PR status/state element.
   *
   * @param {Document} doc
   * @returns {Element|null}
   */
  function findPRStateElement(doc) {
    // Azure DevOps shows PR state (Active/Completed/Abandoned) in various places
    const selectors = [
      // Primary: status badge/pill
      '[class*="pr-status"]',
      '[class*="pull-request-status"]',
      '[aria-label*="Pull request status"]',
      '[data-automation-id*="pr-status"]',

      // Secondary: header area
      '.repos-pr-header [class*="status"]',
      '.pr-header-status',
      '[class*="PullRequestStatus"]',

      // Tertiary: badge/lozenge components
      '.bolt-pill[class*="status"]',
      '.badge[class*="pr"]',

      // Quaternary: scan header for state text
      'header h1 + div [class*="badge"]',
      '.pr-title-area [class*="pill"]'
    ];

    for (const selector of selectors) {
      const element = safeQuerySelector(selector, doc);
      if (element) {
        const text = getText(element).toLowerCase();
        // Verify this looks like a PR state
        if (text && (
          text.includes('active') ||
          text.includes('completed') ||
          text.includes('abandoned') ||
          text.includes('draft')
        )) {
          console.log('[TabStatus:Azure] Found PR state element with selector:', selector);
          return element;
        }
      }
    }

    return null;
  }

  /**
   * Find reviewer vote elements.
   * Azure shows individual reviewer statuses with votes.
   *
   * @param {Document} doc
   * @returns {Element[]}
   */
  function findReviewerVoteElements(doc) {
    const selectors = [
      '[class*="reviewer-vote"]',
      '[class*="reviewer-status"]',
      '[data-automation-id*="reviewer"]',
      '.repos-pr-reviewer-vote',
      '[class*="vote-icon"]'
    ];

    for (const selector of selectors) {
      const elements = safeQuerySelectorAll(selector, doc);
      if (elements.length > 0) {
        console.log('[TabStatus:Azure] Found reviewer elements with selector:', selector);
        return elements;
      }
    }

    return [];
  }

  /**
   * Extract PR state (Active, Completed, Abandoned, Draft).
   *
   * @param {Element} stateElement
   * @param {Document} doc
   * @returns {string}
   */
  function extractPRState(stateElement, doc) {
    if (stateElement) {
      const text = getText(stateElement).toLowerCase();

      if (text.includes('completed')) return 'Completed';
      if (text.includes('abandoned')) return 'Abandoned';
      if (text.includes('draft')) return 'Draft';
      if (text.includes('active')) return 'Active';
    }

    // Fallback: check document title
    const title = doc.title.toLowerCase();
    if (title.includes('completed')) return 'Completed';
    if (title.includes('abandoned')) return 'Abandoned';

    // Default to Active if nothing else found
    return 'Active';
  }

  /**
   * Find and extract check/build status elements.
   * Azure DevOps shows pipeline/build status for PRs.
   *
   * @param {Document} doc
   * @returns {Object} { status: string, summary: string }
   */
  function extractCheckStatus(doc) {
    const result = {
      status: null,  // 'passing', 'failing', 'pending', 'running', 'not-started'
      summary: null,  // e.g., "2/2 passed", "1/2 failed", "not yet run"
      details: []
    };

    // Selectors for check/build status elements
    const checkSelectors = [
      '[class*="build-status"]',
      '[class*="status-indicator-"]',
      '[class*="pr-status-section"]',
      '[class*="policy-section"]',
      '[data-automation-id*="build"]',
      '[data-automation-id*="status-indicator"]',
      '[aria-label*="checks"]',
      '[aria-label*="build"]',
      '[aria-label*="required"]'
    ];

    // Try to find check status area
    let checkContainer = null;
    for (const selector of checkSelectors) {
      const elements = safeQuerySelectorAll(selector, doc);
      for (const el of elements) {
        const text = getText(el).toLowerCase();
        if (text.includes('check') || text.includes('build') || text.includes('required') ||
            text.includes('policy') || text.includes('not yet run')) {
          checkContainer = el;
          break;
        }
      }
      if (checkContainer) break;
    }

    if (!checkContainer) {
      // Try to find by common text patterns in the page
      const bodyText = doc.body.innerText;

      // Check for "not yet run" pattern
      const notYetRunMatch = bodyText.match(/(\d+)\s+required\s+(?:checks?|policies)\s+not yet run/i);
      if (notYetRunMatch) {
        result.summary = 'Not yet run';
        result.status = 'not-started';
        result.details.push(`${notYetRunMatch[1]} check(s) waiting`);
      } else {
        // Check for completed checks pattern
        const checkMatch = bodyText.match(/(\d+)\s+of\s+(\d+)\s+required\s+(checks?|policies)/i);
        if (checkMatch) {
          const passed = parseInt(checkMatch[1]);
          const total = parseInt(checkMatch[2]);
          result.summary = `${passed}/${total} checks`;
          result.status = passed === total ? 'passing' : 'failing';
        }
      }

      // Check for auto-complete status
      if (bodyText.includes('automatically complete') || bodyText.includes('auto-complete')) {
        result.details.push('Auto-complete enabled');
      }

      return result;
    }

    // Extract status from container
    const containerText = getText(checkContainer).toLowerCase();

    // Look for "not yet run" first (draft PRs)
    if (containerText.includes('not yet run') || containerText.includes('not run')) {
      result.status = 'not-started';
      result.summary = 'Not yet run';

      // Try to extract count
      const countMatch = containerText.match(/(\d+)\s+required/i);
      if (countMatch) {
        result.details.push(`${countMatch[1]} check(s) waiting`);
      }
    }
    // Look for specific status indicators
    else if (containerText.includes('failed') || containerText.includes('failing')) {
      result.status = 'failing';
    } else if (containerText.includes('passed') || containerText.includes('succeeded') || containerText.includes('success')) {
      result.status = 'passing';
    } else if (containerText.includes('running') || containerText.includes('in progress')) {
      result.status = 'running';
    } else if (containerText.includes('pending') || containerText.includes('waiting') || containerText.includes('queued')) {
      result.status = 'pending';
    }

    // Try to extract summary like "1 of 2 required checks failed"
    const summaryMatch = containerText.match(/(\d+)\s+of\s+(\d+)\s+(?:required\s+)?(?:checks?|builds?|policies)/i);
    if (summaryMatch) {
      result.summary = `${summaryMatch[1]}/${summaryMatch[2]} checks`;
    }

    // Look for auto-complete indicator
    const autoCompleteSelectors = [
      '[aria-label*="auto"]',
      '[class*="auto-complete"]',
      '[data-automation-id*="auto-complete"]'
    ];

    for (const selector of autoCompleteSelectors) {
      const el = safeQuerySelector(selector, doc);
      if (el) {
        const text = getText(el).toLowerCase();
        if (text.includes('auto') && text.includes('complete')) {
          result.details.push('Auto-complete enabled');
          break;
        }
      }
    }

    // Also check page text for auto-complete
    if (doc.body.innerText.toLowerCase().includes('automatically complete')) {
      if (!result.details.includes('Auto-complete enabled')) {
        result.details.push('Auto-complete enabled');
      }
    }

    return result;
  }

  /**
   * Determine aggregate reviewer vote status.
   * Priority: Rejected > Approved > Waiting/In Review
   *
   * @param {Element[]} reviewerElements
   * @param {Document} doc
   * @returns {string}
   */
  function determineReviewerStatus(reviewerElements, doc) {
    if (reviewerElements.length === 0) {
      // No reviewers or can't find elements, check for approval indicators in page
      return inferReviewStatusFromPage(doc);
    }

    let hasApproved = false;
    let hasRejected = false;
    let hasWaitingForAuthor = false;

    reviewerElements.forEach(el => {
      const text = getText(el).toLowerCase();
      const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() || '';
      const combined = `${text} ${ariaLabel}`;

      if (combined.includes('rejected') || combined.includes('reject')) {
        hasRejected = true;
      } else if (combined.includes('approved') || combined.includes('approve')) {
        hasApproved = true;
      } else if (combined.includes('waiting') || combined.includes('wait')) {
        hasWaitingForAuthor = true;
      }
    });

    // Priority order
    if (hasRejected) return 'Rejected';
    if (hasApproved) return 'Approved';
    if (hasWaitingForAuthor) return 'Waiting for author';

    return 'In review';
  }

  /**
   * Infer review status from page context if direct elements not found.
   *
   * @param {Document} doc
   * @returns {string}
   */
  function inferReviewStatusFromPage(doc) {
    // Look for approval/rejection indicators
    const pageText = doc.body.innerText.toLowerCase();

    // Check for approval messages
    if (pageText.includes('approved by') || pageText.includes('all approvals')) {
      return 'Approved';
    }

    // Check for rejection messages
    if (pageText.includes('rejected by') || pageText.includes('changes requested')) {
      return 'Rejected';
    }

    // Check for waiting indicators
    if (pageText.includes('waiting for author') || pageText.includes('author response')) {
      return 'Waiting for author';
    }

    // Default
    return 'In review';
  }

  /**
   * Resolve final status based on PR state and reviewer votes.
   * Priority logic:
   * 1. Completed (PR state) → "Completed"
   * 2. Abandoned (PR state) → "Rejected"
   * 3. Draft (PR state) → "Draft"
   * 4. Active + reviewer votes → "Approved" / "Rejected" / "In review"
   *
   * @param {string} prState
   * @param {string} reviewerStatus
   * @returns {string}
   */
  function resolveFinalStatus(prState, reviewerStatus) {
    // PR state takes precedence
    if (prState === 'Completed') return 'Completed';
    if (prState === 'Abandoned') return 'Rejected';
    if (prState === 'Draft') return 'Draft';

    // For Active PRs, use reviewer status
    if (prState === 'Active') {
      return reviewerStatus;
    }

    return 'In review';
  }

  /**
   * Azure DevOps plugin implementation.
   */
  const azurePlugin = {
    name: 'azure',

    match(url) {
      // Match both Azure DevOps URL formats
      return (
        (url.hostname.endsWith('.visualstudio.com') ||
         url.hostname === 'dev.azure.com') &&
        url.pathname.includes('/_git/') &&
        url.pathname.includes('/pullrequest/')
      );
    },

    async getTitleData(doc, url) {
      // Extract PR number from URL
      const prNumber = extractPRNumber(url);
      if (!prNumber) {
        console.warn('[TabStatus:Azure] Could not extract PR number from URL:', url.href);
        return null;
      }

      // Wait for PR state element to appear
      const stateElement = await waitForElement(
        [
          '[class*="pr-status"]',
          '[class*="pull-request-status"]',
          '.repos-pr-header [class*="status"]',
          '.bolt-pill[class*="status"]',
          'header [class*="badge"]'
        ],
        { timeout: 8000, root: doc.body }
      );

      // Extract PR state (Completed, Abandoned, Active, Draft)
      const prState = extractPRState(stateElement, doc);
      console.log('[TabStatus:Azure] PR State:', prState);

      // Get reviewer elements (may be empty if no reviewers yet)
      const reviewerElements = findReviewerVoteElements(doc);

      // Determine reviewer status
      const reviewerStatus = determineReviewerStatus(reviewerElements, doc);
      console.log('[TabStatus:Azure] Reviewer Status:', reviewerStatus);

      // Resolve final status based on priority logic
      const finalStatus = resolveFinalStatus(prState, reviewerStatus);
      console.log('[TabStatus:Azure] Final Status:', finalStatus);

      // Extract check/build status
      const checkStatus = extractCheckStatus(doc);
      console.log('[TabStatus:Azure] Check Status:', checkStatus);

      // Normalize status to get category and icon
      const { category, icon } = normalizeStatus(finalStatus, 'azure');

      return {
        id: prNumber,
        status: finalStatus,
        category,
        icon,
        // Additional Azure-specific data
        checks: checkStatus
      };
    },

    getObserveTargets(doc) {
      // Return both state and reviewer elements to watch for changes
      const targets = [];

      const stateElement = findPRStateElement(doc);
      if (stateElement) targets.push(stateElement);

      const reviewerElements = findReviewerVoteElements(doc);
      targets.push(...reviewerElements);

      return targets;
    }
  };

  // Register the plugin
  register(azurePlugin);
  console.log('[TabStatus:Azure] Plugin registered');

})();
