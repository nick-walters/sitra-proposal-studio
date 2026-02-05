
# Plan: Enhanced B3.1 Population with Official Table Formats

## Overview

This plan enhances the "Populate Part B3.1" functionality to transfer WP draft content into the official Horizon Europe table formats, with proper captioning and an option to include budget cost justifications. Milestones (Table 3.1d) remain empty for manual design by proposal writers.

## Data Mapping Summary

| EC Table | Source | Auto-populated? |
|----------|--------|-----------------|
| Table 3.1b: WP descriptions | wp_drafts, wp_draft_tasks | Yes |
| Table 3.1c: Deliverables | wp_draft_deliverables | Yes |
| Table 3.1d: Milestones | Manual entry | No (empty template) |
| Table 3.1e: Critical risks | wp_draft_risks | Yes |
| Table 3.1f: Staff effort | wp_draft_task_effort | Yes |
| Table 3.1g: Subcontracting | budget_items | Optional (user choice) |
| Table 3.1h: Equipment costs | budget_items | Optional (user choice) |

Note: "Task interactions and bottlenecks" from WP drafts remain visible in the WP editor for reference but are not copied to B3.1.

---

## Implementation Steps

### Step 1: Update B3.1 Population Logic

Restructure `src/lib/b31Population.ts` to generate all official tables:

#### Table 3.1b: Work package description (Single Caption, Multiple Tables)

One caption followed by multiple WP tables (one per WP):

```text
Table 3.1b: Work package description

┌────────────────────────┬──────────────────────────┐
│ Work package number    │ WP1                      │
│ Work package title     │ Project Management       │
│ Participant number     │ 1, 2, 3                  │
│ Person-months          │ 12.0                     │
│ Start month            │ 1                        │
│ End month              │ 36                       │
│ Objectives             │ [objectives text]        │
│ Description of work    │ [tasks with details]     │
└────────────────────────┴──────────────────────────┘

┌────────────────────────┬──────────────────────────┐
│ Work package number    │ WP2                      │
│ ...                    │ ...                      │
└────────────────────────┴──────────────────────────┘
(No additional captions between WPs)
```

#### Table 3.1c: List of deliverables
Auto-populated from `wp_draft_deliverables`:
| Number | Deliverable name | Short description | WP | Lead | Type | Diss. | Due |

#### Table 3.1d: List of milestones
Empty template for manual entry:
| MS | Milestone name | Related WP(s) | Due month | Means of verification |

#### Table 3.1e: Critical risks
Auto-populated from `wp_draft_risks`:
| Description of risk | WP(s) involved | Proposed mitigation measures |

#### Table 3.1f: Summary of staff effort
Auto-populated from `wp_draft_task_effort`:
| Partner | WP1 | WP2 | WP3 | ... | Total |

#### Tables 3.1g & 3.1h: Cost justifications (Optional)
Only generated when user opts in:
- 3.1g: Subcontracting costs from `budget_items` where category='subcontracting'
- 3.1h: Equipment costs from `budget_items` where category='purchase' and item is major equipment

---

### Step 2: Update WPManagementCard

Modify the "Populate Part B3.1" dialog:
- Current WP selection checkboxes
- New toggle: "Include cost justifications from budget"
- Pass option to `populateB31()` function

---

### Step 3: Table Caption Strategy

To avoid renumbering issues with subsequent tables:
- All WP description tables share a single "Table 3.1b" caption
- Each subsequent table (3.1c, 3.1d, etc.) has its own caption
- This ensures the caption auto-numbering system works correctly

---

## File Changes

### Modified Files

1. **`src/lib/b31Population.ts`**
   - Restructure `generateWPContent()` to use Table 3.1b row format (Work package number, title, participants, etc.)
   - Create single caption for all WP description tables
   - Update `generateDeliverablesTable()` to match exact EC columns (add Short description column)
   - Update `generateRisksTable()` to use EC format (description text, not risk ID)
   - Add `generateMilestonesTable()` - empty template with correct headers
   - Add `generateStaffEffortTable()` - matrix from wp_draft_task_effort
   - Add `generateSubcontractingTable()` - from budget_items
   - Add `generatePurchaseCostsTable()` - from budget_items
   - Update `populateB31()` signature to accept `includeCostJustifications: boolean`

2. **`src/components/WPManagementCard.tsx`**
   - Add checkbox/toggle for "Include cost justifications"
   - Update populate button handler to pass new option

---

## Data Flow

```text
WP Management Card
┌─────────────────────────────────────────────────┐
│ Select WPs to populate:                         │
│ [x] WP1  [x] WP2  [x] WP3  [ ] WP4 ...         │
│                                                 │
│ ☐ Include cost justifications from budget      │
│                                                 │
│              [Populate Part B3.1]               │
└─────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│ populateB31(proposalId, wpIds, userId, options) │
│                                                 │
│ Fetches:                                        │
│ • wp_drafts (info, objectives, methodology)     │
│ • wp_draft_tasks (descriptions)                 │
│ • wp_draft_task_effort (person-months)          │
│ • wp_draft_deliverables                         │
│ • wp_draft_risks                                │
│ • participants (names)                          │
│ • budget_items (if includeCosts = true)         │
└─────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│ Generated HTML for Section 3.1:                 │
│                                                 │
│ Table 3.1b: Work package description            │
│   [WP1 table] [WP2 table] [WP3 table]...       │
│                                                 │
│ Table 3.1c: List of deliverables               │
│   [auto-populated rows]                         │
│                                                 │
│ Table 3.1d: List of milestones                 │
│   [empty template for manual entry]             │
│                                                 │
│ Table 3.1e: Critical risks                     │
│   [auto-populated rows]                         │
│                                                 │
│ Table 3.1f: Summary of staff effort            │
│   [auto-populated matrix]                       │
│                                                 │
│ (If opted in:)                                  │
│ Table 3.1g: Subcontracting costs               │
│ Table 3.1h: Purchase costs                     │
└─────────────────────────────────────────────────┘
```

---

## Reference Data (Stays in WP Editor)

The following WP draft content remains visible in the WP editor for reference when designing milestones, but is NOT copied to B3.1:
- Task interactions and bottlenecks section

---

## Summary

| Change | Details |
|--------|---------|
| No database changes | Milestones are manual, no new table needed |
| b31Population.ts | Generate Tables 3.1b-h with proper formatting |
| WPManagementCard | Add cost justification toggle |
| Milestones | Empty template inserted, writers fill manually |
| Caption strategy | Single caption for all WP description tables |
