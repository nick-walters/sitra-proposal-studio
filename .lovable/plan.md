

# B3.1 Section Overhaul: Auto-populated Figures, Tables, and Structured Content

## Overview

This plan restructures the Part B3.1 editor to automatically display all required Horizon Europe section elements in the correct order, pulling data from work packages, figures, participants, and budget. It also updates the Figures page to auto-fill titles/sections for PERT and Gantt charts and enforces one-per-proposal limits.

## Scope Breakdown

### 1. Figure Creation Defaults (FigureManager)

**File:** `src/components/FigureManager.tsx`

- When clicking "PERT Diagram" in the figure type selector, auto-fill title to "PERT chart" and section to B3.1 (`3.1`)
- When clicking "Gantt Chart", auto-fill title to "Gantt chart" and section to B3.1
- Enforce one PERT and one Gantt per proposal: disable those type buttons if one already exists, show a tooltip "Already created"
- The caption generated in B3.1 should match the title (already works via `figure.caption || figure.title` pattern)

### 2. B3.1 Section Structure (DocumentEditor + new B31 components)

**File:** `src/components/DocumentEditor.tsx` -- refactor the B3.1 block (lines 969-978)

Replace the current simple insertion of 3 tables with a comprehensive ordered component that renders all required items:

**New file:** `src/components/B31SectionContent.tsx`

This component renders in order:
1. Free-text editor area (already exists as the TipTap editor above)
2. **Figure 3.1.a** -- PERT chart (auto-included if a PERT figure exists for this proposal)
3. **Figure 3.1.b** -- Gantt chart (auto-included if a Gantt figure exists)
4. **Table 3.1.a** -- List of work packages (auto-generated read-only table)
5. **Table 3.1.b** -- Work package descriptions (auto-generated from WP drafts, color-coded headers)
6. **Table 3.1.c** -- Deliverables (existing `B31DeliverablesTable`)
7. **Table 3.1.d** -- Milestones (existing `B31MilestonesTable`)
8. **Table 3.1.e** -- Critical risks (existing `B31RisksTable`)
9. **Table 3.1.f** -- Person months per participant per WP (auto-generated matrix from effort data)
10. **Table 3.1.g** -- Subcontracting cost justifications (conditional, from budget)
11. **Table 3.1.h** -- Equipment purchase costs (conditional, from budget where equipment > 15% of personnel costs)

### 3. New Auto-generated Tables

#### Table 3.1.a -- List of Work Packages
- Columns: WP, Lead participant, Person months, Duration
- WP format: "WPX: SHORT -- Title"
- Lead participant: colored bubble with number, e.g. "1. Sitra"
- Person months: summed from `wp_draft_task_effort`
- Duration: computed from min(task start_month) to max(task end_month), format "MXX--MXX"

#### Table 3.1.b -- Work Package Descriptions
- One table per WP, header row uses WP color
- Content pulled from WP drafts (objectives, methodology, tasks, deliverables)
- Standard Horizon Europe WP description table format
- Tables separated by an empty line (height of one table row)
- Only populated WPs shown (those with content from coordinator/admin/owner)

#### Table 3.1.f -- Person Months per Participant per WP
- Matrix: rows = participants, columns = WPs, cells = person months
- Data from `wp_draft_task_effort` table
- Total row and total column

#### Table 3.1.g -- Subcontracting Cost Justifications (conditional)
- Only shown when any participant has subcontracting costs in budget_items (category = subcontracting)
- Lists participant, subcontracting amount, justification

#### Table 3.1.h -- Equipment Purchase Costs (conditional)
- Only shown when equipment costs exceed 15% of a participant's personnel costs
- Lists participant, equipment description, amount, justification

### 4. Data Fetching

**New hook:** `src/hooks/useB31SectionData.ts`

Fetches all data needed for B3.1 in a single hook:
- Figures (PERT and Gantt) from `figures` table filtered by proposal + type
- WP drafts with tasks, deliverables, milestones, risks
- Participants with numbers
- Task effort data from `wp_draft_task_effort`
- Budget items for subcontracting and equipment categories
- Personnel cost rates from participants

### 5. Relabeling Existing Tables

The existing B31 table captions need updating:
- "Table 3.1c" becomes "Table 3.1.c" (add dot separator)
- "Table 3.1d" becomes "Table 3.1.d"
- "Table 3.1e" becomes "Table 3.1.e"

---

## Technical Details

### Files to Create
- `src/components/B31SectionContent.tsx` -- orchestrator component for all B3.1 structured content
- `src/components/B31WPListTable.tsx` -- Table 3.1.a
- `src/components/B31WPDescriptionTables.tsx` -- Table 3.1.b
- `src/components/B31EffortMatrix.tsx` -- Table 3.1.f
- `src/components/B31SubcontractingTable.tsx` -- Table 3.1.g (conditional)
- `src/components/B31EquipmentTable.tsx` -- Table 3.1.h (conditional)
- `src/hooks/useB31SectionData.ts` -- consolidated data hook

### Files to Modify
- `src/components/FigureManager.tsx` -- auto-fill title/section for PERT/Gantt, enforce one-per-proposal limit
- `src/components/DocumentEditor.tsx` -- replace inline B31 table block with `B31SectionContent`
- `src/components/B31TablesEditor.tsx` -- fix caption numbering format (add dots: 3.1.c, 3.1.d, 3.1.e)

### No Database Changes Required
All data already exists in the database. The new tables are read-only views computed from:
- `figures` (PERT/Gantt detection)
- `wp_drafts` + `wp_draft_tasks` + `wp_draft_task_effort` (WP list, descriptions, effort matrix)
- `participants` (lead partners, participant numbers)
- `budget_items` (subcontracting, equipment)

### Styling Approach
All auto-generated tables use the existing Times New Roman 11pt styling established in `B31TablesEditor.tsx` with black borders, matching the Horizon Europe formatting standards already in use.

### Figure Rendering in B3.1
- PERT and Gantt figures are rendered inline using their existing `GanttChartFigure` and `PERTChartFigure` components
- Caption format: "*Figure 3.1.a. PERT chart*" / "*Figure 3.1.b. Gantt chart*"
- If no PERT/Gantt figure exists, a subtle placeholder is shown: "PERT chart will appear here once created in Figures"

