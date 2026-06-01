# Status Color Configuration

This document shows the default status-to-color mappings for your workflow.

## ⚪ Gray — "To Do" Category

Represents work that is planned but not yet started.

**Statuses:**
- DRAFT
- HOLD / PAUSED
- IN SCOPING
- PENDING PO APPROVAL
- REFINED
- SCOPED AND READY FOR REFINEMENT
- READY FOR DEVELOPMENT
- To Do
- Backlog
- Open
- New

## 🔵 Blue — "In Progress" Category

Represents active work in development or testing.

**Statuses:**
- BLOCKED
- IN DEVELOPMENT
- READY FOR TESTING
- QA IN PROGRESS
- DEVELOPMENT COMPLETE
- ADDED TO RELEASE BRANCH
- In Progress
- Reviewing
- Code Review
- WIP
- **In review** (Azure DevOps)
- **Waiting for author** (Azure DevOps)
- **Active** (Azure DevOps)

## 🟢 Green — "Done" Category

Represents completed work in any stage of completion.

**Statuses:**
- CANNOT REPRODUCE
- NOT NEEDED
- DUPLICATE
- NOT A BUG
- QA COMPLETED
- READY FOR UAT
- READY FOR PO ACCEPTANCE
- UAT NOT REQUIRED
- UAT IN PROGRESS
- UAT COMPLETE
- DONE
- Closed
- Resolved
- Complete
- Fixed
- **Approved** (Azure DevOps)

## 🟣 Purple — "Merged" Category

For Bitbucket and Azure DevOps pull requests that have been merged.

**Statuses:**
- MERGED (Bitbucket)
- **Completed** (Azure DevOps)

## 🔴 Red — "Blocked/Declined" Category

Represents work that won't be completed.

**Statuses:**
- DECLINED
- REJECTED
- ABANDONED
- CANCELLED
- FAILED

## ❔ Gray — "Unknown" Category

Fallback when status doesn't match any category.

---

## Customization

### Via Options Page (Recommended)

1. Right-click the extension icon → **Options**
2. Navigate to **Status Color Mappings** section
3. Edit keywords for each category
4. Click **Save Settings**

### Import/Export

- **Export**: Save your configuration as JSON to share with teammates
- **Import**: Load a saved configuration file

### Keyword Matching

- Keywords are **case-insensitive**
- Matches are **substring-based** (e.g., "qa" matches "QA IN PROGRESS")
- First match wins (order: To Do → In Progress → Done → Merged → Blocked)

## Sharing Config Across Projects

1. Configure statuses for your project
2. Click **Export Config** in options
3. Share the JSON file with your team
4. Others can **Import Config** to use the same mappings

---

**File Location**: This configuration is stored in Chrome's sync storage and syncs across your Chrome browsers when signed in.
