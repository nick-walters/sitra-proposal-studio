

# WP Drafts Feature - Final Implementation Plan

## Overview

This feature adds a comprehensive "WP Drafts" section to the proposal editor with structured templates for planning work packages. The system includes color-coded WPs, inline bubble references, methodology questions, effort matrices, risk tables, and auto-generated PERT/Gantt charts for full proposals.

---

## Key Features Summary

| Feature | Description |
|---------|-------------|
| WP Drafts Section | Collapsible navigation section between Part B and Figures |
| Structured Template | Methodology, objectives+tasks table, deliverables, risks, effort matrix |
| WP Progress Tracker | Dashboard showing per-WP completion and proposal totals |
| Color System | Editable palette (admin), per-WP colors, inline WP bubbles |
| PERT Chart | Auto-generated figure 3.1.a with WP dependencies |
| Gantt Chart | Auto-generated figure 3.1.b with compact single-page format |
| B3.1 Population | Copy WP content to Part B with consolidated tables |
| Template Library | Built-in DEC and Coordination templates |

---

## Navigation Structure

```text
Contents
├── Proposal overview
├── WP Progress Tracker    ← NEW (replaces "Assignments" position concept)
├── Part A: Administrative forms
│   └── ...
├── Part B: Technical description
│   └── ...
├── WP Drafts              ← NEW (collapsible, bold)
│   ├── WP1: [Short Name]
│   ├── WP2: [Short Name]
│   └── ... (9 by default)
└── Figures
    ├── Figure 3.1.a: PERT Chart  ← Auto-generated (full proposals)
    └── Figure 3.1.b: Gantt Chart ← Auto-generated (full proposals)
```

---

## Database Schema

### Table: `wp_drafts`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `proposal_id` | uuid | FK to proposals |
| `number` | integer | WP sequence (1, 2, 3...) |
| `short_name` | text | Short name (e.g., "COORD", "DEC") |
| `title` | text | Full WP title |
| `lead_participant_id` | uuid | FK to participants (WP Leader) |
| `methodology` | text | Rich text for methodology question |
| `objectives` | text | Rich text for objectives (part of WP table) |
| `color` | text | Hex color code |
| `inputs_question` | text | Planning: What inputs needed? |
| `outputs_question` | text | Planning: What outputs produced? |
| `bottlenecks_question` | text | Planning: What bottlenecks? |
| `order_index` | integer | Display order for reordering |
| `created_at` | timestamp | Auto timestamp |
| `updated_at` | timestamp | Auto timestamp |

### Table: `wp_draft_tasks`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `wp_draft_id` | uuid | FK to wp_drafts |
| `number` | integer | Task number within WP |
| `title` | text | Task title |
| `description` | text | Task description |
| `lead_participant_id` | uuid | FK to participants (Task Leader) |
| `start_month` | integer | Start month |
| `end_month` | integer | End month |
| `order_index` | integer | Display order |
| `created_at` | timestamp | Auto timestamp |
| `updated_at` | timestamp | Auto timestamp |

### Table: `wp_draft_task_participants`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `task_id` | uuid | FK to wp_draft_tasks |
| `participant_id` | uuid | FK to participants |
| `created_at` | timestamp | Auto timestamp |

### Table: `wp_draft_task_effort`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `task_id` | uuid | FK to wp_draft_tasks |
| `participant_id` | uuid | FK to participants |
| `person_months` | decimal | Effort in person-months |
| `created_at` | timestamp | Auto timestamp |
| `updated_at` | timestamp | Auto timestamp |

### Table: `wp_draft_deliverables`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `wp_draft_id` | uuid | FK to wp_drafts |
| `number` | integer | Deliverable number within WP |
| `title` | text | Deliverable title |
| `type` | text | HE type code (R, DEM, DEC, etc.) |
| `dissemination_level` | text | PU, SEN, CO |
| `responsible_participant_id` | uuid | FK to participants |
| `due_month` | integer | Delivery month |
| `description` | text | Brief description |
| `order_index` | integer | Display order |
| `created_at` | timestamp | Auto timestamp |
| `updated_at` | timestamp | Auto timestamp |

### Table: `wp_draft_risks`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `wp_draft_id` | uuid | FK to wp_drafts |
| `number` | integer | Risk number within WP |
| `title` | text | Risk title/description |
| `likelihood` | text | H, M, or L |
| `severity` | text | H, M, or L |
| `mitigation` | text | Mitigation strategy |
| `order_index` | integer | Display order |
| `created_at` | timestamp | Auto timestamp |
| `updated_at` | timestamp | Auto timestamp |

### Table: `wp_dependencies`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `proposal_id` | uuid | FK to proposals |
| `from_wp_id` | uuid | Source WP |
| `to_wp_id` | uuid | Target WP |
| `created_at` | timestamp | Auto timestamp |

### Table: `wp_draft_templates`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `name` | text | Template name |
| `short_name` | text | Default short name |
| `title` | text | Default title |
| `methodology_template` | text | Pre-filled methodology |
| `objectives_template` | text | Pre-filled objectives |
| `default_tasks` | jsonb | Array of default tasks |
| `default_deliverables` | jsonb | Array of default deliverables |
| `is_system` | boolean | True for built-in templates |
| `created_at` | timestamp | Auto timestamp |

### Table: `wp_color_palette`

Proposal-level color palette (admin-editable):

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `proposal_id` | uuid | FK to proposals |
| `colors` | jsonb | Array of 12 hex colors |
| `created_at` | timestamp | Auto timestamp |
| `updated_at` | timestamp | Auto timestamp |

---

## WP Draft Editor Template Structure

```text
┌─────────────────────────────────────────────────────────────────┐
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ [🎨]           │  ← Color header
│  WP1: [Short Name]  •  Lead: [Partner dropdown]                 │
│  [Full Title input field]                                       │
├─────────────────────────────────────────────────────────────────┤
│  📝 Writing Guidelines  (collapsible)                           │
│  └── Tips for methodology, objectives, tasks, deliverables      │
│  [DEC or Coordination specific guidelines for WP8/WP9]          │
├─────────────────────────────────────────────────────────────────┤
│  Methodology                                                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Describe and explain the methodologies used in this WP,    │ │
│  │ including the concepts, models and assumptions that        │ │
│  │ underpin your work. Explain how they will enable you to    │ │
│  │ deliver your project's objectives. Refer to any important  │ │
│  │ challenges you may have identified in the chosen           │ │
│  │ methodologies and how you intend to overcome them.         │ │
│  └────────────────────────────────────────────────────────────┘ │
│  💡 Sitra's Tips (collapsible)                                  │
│  • Be specific about WHY you chose these methods               │
│  • Reference state-of-the-art and explain improvements         │
│  • Acknowledge limitations and explain mitigation              │
│  • Link methods directly to objectives they support            │
│  [Rich text area for methodology response]                      │
├─────────────────────────────────────────────────────────────────┤
│  WP Table (Objectives & Tasks)                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Objectives                                                 │ │
│  │ [Rich text area - bullet points recommended]               │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │ Tasks                                                      │ │
│  │ ┌──────┬──────────┬────────┬──────────────┬──────────────┐ │ │
│  │ │ Task │ Title    │ Leader │ Participants │ M start-end  │ │ │
│  │ ├──────┼──────────┼────────┼──────────────┼──────────────┤ │ │
│  │ │T1.1  │ [input]  │ [drop] │ [multiselect]│ [1] - [12]   │ │ │
│  │ │T1.2  │ [input]  │ [drop] │ [multiselect]│ [6] - [24]   │ │ │
│  │ │T1.3  │ [input]  │ [drop] │ [multiselect]│ [12] - [36]  │ │ │
│  │ └──────┴──────────┴────────┴──────────────┴──────────────┘ │ │
│  │ [+ Add Task]                                               │ │
│  └────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│  Planning Questions                                             │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ What are the main inputs this WP needs from other WPs or   │ │
│  │ external sources?                                          │ │
│  │ [Text area]                                                │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │ What are the main outputs this WP will produce that feed   │ │
│  │ other WPs?                                                 │ │
│  │ [Text area]                                                │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │ What major bottlenecks could slow progress of the          │ │
│  │ project's implementation if not completed on time?         │ │
│  │ [Text area]                                                │ │
│  └────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│  Staff Effort (Person-Months)                                   │
│  ┌────────────┬────────┬────────┬────────┬─────────┐           │
│  │ Partner    │ T1.1   │ T1.2   │ T1.3   │ Total   │           │
│  ├────────────┼────────┼────────┼────────┼─────────┤           │
│  │ Partner A  │ [2.0]  │ [1.5]  │ [3.0]  │ 6.5     │           │
│  │ Partner B  │ [0.5]  │ [2.0]  │ [1.0]  │ 3.5     │           │
│  │ Partner C  │ [1.0]  │ [0.0]  │ [2.0]  │ 3.0     │           │
│  ├────────────┼────────┼────────┼────────┼─────────┤           │
│  │ Task Total │ 3.5    │ 3.5    │ 6.0    │ 13.0    │           │
│  └────────────┴────────┴────────┴────────┴─────────┘           │
│  Caption: Staff effort distribution across WP1 tasks           │
│  → Feeds into Budget Spreadsheet                               │
├─────────────────────────────────────────────────────────────────┤
│  Deliverables                                                   │
│  ┌──────┬───────────┬────────┬─────────────┬──────┬───────────┐ │
│  │ D#   │ Title     │ Type   │ Responsible │ Diss.│ Due Month │ │
│  ├──────┼───────────┼────────┼─────────────┼──────┼───────────┤ │
│  │D1.1  │ [input]   │ [drop] │ [dropdown]  │ [PU] │ [6]       │ │
│  │D1.2  │ [input]   │ [drop] │ [dropdown]  │ [CO] │ [18]      │ │
│  │D1.3  │ [input]   │ [drop] │ [dropdown]  │ [PU] │ [36]      │ │
│  └──────┴───────────┴────────┴─────────────┴──────┴───────────┘ │
│  [+ Add Deliverable]                                            │
├─────────────────────────────────────────────────────────────────┤
│  Risks                                                          │
│  ┌────────┬────────────────┬──────────┬──────────┬────────────┐ │
│  │ Risk # │ Description    │ Likelih. │ Severity │ Mitigation │ │
│  ├────────┼────────────────┼──────────┼──────────┼────────────┤ │
│  │ R1.1   │ [input]        │ [H/M/L]  │ [H/M/L]  │ [textarea] │ │
│  │ R1.2   │ [input]        │ [H/M/L]  │ [H/M/L]  │ [textarea] │ │
│  └────────┴────────────────┴──────────┴──────────┴────────────┘ │
│  [+ Add Risk]                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Proposal Overview Page - WP Management Card

Centralized WP management on Proposal Overview (Admin/Owner only for editing):

```text
┌─────────────────────────────────────────────────────────────────┐
│  Work Package Drafts                                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌───┬─────┬────────────┬──────────────────────────┬──────────┬─────────┐
│  │ ⋮ │ WP# │ Short Name │ Title                    │ WP Lead  │ Color   │
│  ├───┼─────┼────────────┼──────────────────────────┼──────────┼─────────┤
│  │ ⋮ │ 1   │ [INIT]     │ [Initialization]         │ [Part A] │ ▓ [🎨]  │
│  │ ⋮ │ 2   │ [DESIGN]   │ [System Design]          │ [Part B] │ ▓ [🎨]  │
│  │ ⋮ │ ... │            │                          │          │         │
│  │ ⋮ │ 8   │ [DEC]      │ Dissemination, Exploit...│ [Part C] │ ▓ [🎨]  │
│  │ ⋮ │ 9   │ [COORD]    │ Project Coordination...  │ [Part A] │ ▓ [🎨]  │
│  └───┴─────┴────────────┴──────────────────────────┴──────────┴─────────┘
│  ⋮ = drag handle for reordering (admin/owner only)              │
│                                                                 │
│  [+ Add WP] 👤  [Edit Color Palette] 👤                         │
├─────────────────────────────────────────────────────────────────┤
│  Populate Part B3.1  (Full Proposals Only)                      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Select WPs to populate:                                     ││
│  │ ☑ WP1  ☑ WP2  ☑ WP3  ☐ WP4  ☐ WP5  ☑ WP6  ☐ WP7  ☑ WP8  ☑ WP9││
│  │                                                             ││
│  │ [Populate Selected WPs] 👤   [Populate All WPs] 👤          ││
│  │                                                             ││
│  │ ⚠ This will copy WP content, deliverables, and risks to    ││
│  │   Part B3.1. Existing content may be updated.               ││
│  └─────────────────────────────────────────────────────────────┘│
│  👤 = Admin/Owner only                                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## WP Progress Tracker

New dashboard for tracking proposal writing progress (distinct from the proposals list dashboard):

```text
┌─────────────────────────────────────────────────────────────────┐
│  WP Progress Tracker                                            │
│  Track completion status of work package drafts                 │
├─────────────────────────────────────────────────────────────────┤
│  Overall Progress                                               │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ ████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  45%     ││
│  │ 4 of 9 WPs complete                                         ││
│  └─────────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│  Per-WP Completion                                              │
│  ┌──────────────────┬──────┬──────┬──────┬──────┬──────┬──────┐│
│  │ Work Package     │Method│ Obj  │Tasks │Deliv │Risks │Status││
│  ├──────────────────┼──────┼──────┼──────┼──────┼──────┼──────┤│
│  │ WP1: INIT        │  ✓   │  ✓   │  ✓   │  ✓   │  ✓   │  ✓   ││
│  │ WP2: DESIGN      │  ✓   │  ✓   │  ✓   │  ○   │  ○   │  ○   ││
│  │ WP3: (untitled)  │  ○   │  ○   │  ○   │  ○   │  ○   │  ○   ││
│  │ ...              │      │      │      │      │      │      ││
│  │ WP8: DEC         │  ✓   │  ✓   │  ✓   │  ✓   │  ○   │  ○   ││
│  │ WP9: COORD       │  ✓   │  ✓   │  ✓   │  ✓   │  ✓   │  ✓   ││
│  └──────────────────┴──────┴──────┴──────┴──────┴──────┴──────┘│
│  ✓ = Has content   ○ = Empty/incomplete                        │
│  Click any WP to navigate directly to its editor               │
├─────────────────────────────────────────────────────────────────┤
│  Proposal Totals                                                │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Total Tasks:        27      │  Total Deliverables:    18   │ │
│  │ Total Risks:        12      │  Total Person-Months:  156   │ │
│  │ WPs with Lead:     7/9      │  Tasks with Timing:   24/27  │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Completion Criteria

| Section | Considered Complete When |
|---------|-------------------------|
| Methodology | Has > 50 words of content |
| Objectives | Has > 30 words of content |
| Tasks | Has at least 1 task with title |
| Deliverables | Has at least 1 deliverable with title |
| Risks | Has at least 1 risk with description |
| Status (overall) | All above sections complete |

---

## Auto-Generated Figures (Full Proposals Only)

When a full proposal is created, auto-generate:

### Figure 3.1.a: PERT Chart

- Nodes show WP short names with WP colors
- Dependencies added via selector tool in Proposal Overview
- AI assistant available for graphical/styling edits only
- Editable positions and arrow styles

```text
┌─────────────────────────────────────────────────────────────────┐
│  Figure 3.1.a: PERT Chart                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│      ┌──────────┐                                               │
│      │   WP1    │                                               │
│      │  INIT    │─────────┐                                     │
│      └──────────┘         │                                     │
│            │              ▼                                     │
│            │        ┌──────────┐      ┌──────────┐              │
│            │        │   WP3    │─────▶│   WP5    │              │
│            │        │  PILOT   │      │  VALID   │──┐           │
│            ▼        └──────────┘      └──────────┘  │           │
│      ┌──────────┐         │                         ▼           │
│      │   WP2    │         │                   ┌──────────┐      │
│      │  DESIGN  │─────────┼──────────────────▶│   WP8    │      │
│      └──────────┘         │                   │   DEC    │      │
│                           │                   └──────────┘      │
│                           ▼                         │           │
│                     ┌──────────┐                    ▼           │
│                     │   WP9    │◀───────────────────┘           │
│                     │  COORD   │                                │
│                     └──────────┘                                │
│                                                                 │
│  Dependency Management: Proposal Overview → WP Drafts card      │
│  [AI: Style Assistance] [Edit Layout]                           │
└─────────────────────────────────────────────────────────────────┘
```

### Figure 3.1.b: Gantt Chart

- 9pt font, single-page format
- Task titles abbreviated with "..." when needed
- Color-coded WP bars (calculated from earliest/latest task dates)
- Individual task bars within each WP
- Deliverable markers (D#.#) on task bars
- Milestones: Skip for now (added later from B3.1 milestones table)

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  Figure 3.1.b: Gantt Chart                                                            [36 months ▼]│
├──────────────────┬──────────────────────────────────────────────────────────────────────────────────┤
│ Reporting Period │                    1                    │                    2                  │
│ Year             │         1         │         2          │         3                              │
│ Month            │ 1 2 3 4 5 6 7 8 9 │10 11 12 1 2 3 4 5 6│ 7 8 9 10 11 12 1 2 3 4 5 6 7 8 9 10 ...│
├──────────────────┼──────────────────────────────────────────────────────────────────────────────────┤
│ WP1: INIT        │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│                    │                                        │
│  T1.1 Project... │▓▓▓▓▓▓▓▓▓D1.1      │                    │                                        │
│  T1.2 Requir...  │    ▓▓▓▓▓▓▓▓▓▓     │                    │                                        │
├──────────────────┼──────────────────────────────────────────────────────────────────────────────────┤
│ WP2: DESIGN      │    ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│▓▓▓▓▓▓▓▓▓           │                                        │
│  T2.1 System...  │    ▓▓▓▓▓▓▓▓▓▓D2.1 │                    │                                        │
│  T2.2 Integ...   │         ▓▓▓▓▓▓▓▓▓▓│▓▓▓D2.2             │                                        │
└──────────────────┴──────────────────────────────────────────────────────────────────────────────────┘
```

**WP Duration Calculation**: Each WP's bar spans from its earliest task start_month to its latest task end_month.

---

## B3.1 Population Logic

Triggered from Proposal Overview WP management card:

### Population Options
1. **Populate Selected**: Checkbox selection of specific WPs to copy
2. **Populate All**: Copy all WP content in one action

### Content Copied Per WP
- WP header (number, title, lead partner)
- Methodology section
- Objectives + Tasks table (matching HE format)

### Consolidated Tables
- **Deliverables Table**: Merged from all populated WPs, sorted D1.1, D1.2, D2.1...
- **Risks Register**: Merged from all populated WPs, sorted R1.1, R1.2, R2.1...
  - Likelihood/Severity color-coded: H=red, M=amber, L=green

### Update Behavior
- If WP already exists in B3.1: prompt to update or skip
- Sequential ordering maintained in B3.1

---

## WP Template Library

### Built-in System Templates

**DEC Standard** (WP8):
- Short Name: "DEC"
- Title: "Dissemination, Exploitation & Communication"
- Methodology template with DEC-specific guidance
- Default tasks: T8.1 Dissemination strategy, T8.2 Exploitation planning, T8.3 Communication activities
- Default deliverables: D8.1 DEP Plan, D8.2 Project website, D8.3 Final report

**Coordination** (WP9):
- Short Name: "COORD"
- Title: "Project Coordination & Administration"
- Methodology template with management-specific guidance
- Default tasks: T9.1 Project management, T9.2 Quality assurance, T9.3 Financial management
- Default deliverables: D9.1 Management Handbook, D9.2 Progress reports, D9.3 Final report

### Backend Template Management
- Templates stored in `wp_draft_templates` table
- System templates (`is_system = true`) are read-only
- Admins can create additional templates via backend (future: admin UI)
- "Apply Template" option when adding new WPs

---

## Default WP Initialization

New proposals create 9 WPs with default palette colors:

| # | Short Name | Title | Template | Color |
|---|------------|-------|----------|-------|
| 1 | (empty) | (untitled) | None | #2563EB |
| 2 | (empty) | (untitled) | None | #059669 |
| 3 | (empty) | (untitled) | None | #D97706 |
| 4 | (empty) | (untitled) | None | #E11D48 |
| 5 | (empty) | (untitled) | None | #7C3AED |
| 6 | (empty) | (untitled) | None | #0891B2 |
| 7 | (empty) | (untitled) | None | #EA580C |
| 8 | DEC | Dissemination, Exploitation & Communication | DEC Standard | #DB2777 |
| 9 | COORD | Project Coordination & Administration | Coordination | #475569 |

Each WP initialized with:
- 3 empty tasks (T{wp}.1, T{wp}.2, T{wp}.3) with no timing set
- 3 empty deliverables (D{wp}.1, D{wp}.2, D{wp}.3)
- 0 risks
- Empty effort matrix

---

## Color System

### Default Palette (12 colors, proposal-level)

| Index | Name | Hex |
|-------|------|-----|
| 0 | Royal Blue | #2563EB |
| 1 | Emerald | #059669 |
| 2 | Amber | #D97706 |
| 3 | Rose | #E11D48 |
| 4 | Violet | #7C3AED |
| 5 | Cyan | #0891B2 |
| 6 | Orange | #EA580C |
| 7 | Pink | #DB2777 |
| 8 | Slate | #475569 |
| 9 | Lime | #65A30D |
| 10 | Indigo | #4F46E5 |
| 11 | Teal | #0D9488 |

### Color Management
- **Palette editing**: Admin/Owner only, via "Edit Color Palette" button on Proposal Overview
- **Individual WP color**: Editor+ can change via color picker in WP editor or overview table
- **WP bubbles**: Inline references use the WP's stored color

---

## Implementation Phases

### Phase 1: Database Setup
1. Create all tables with proper foreign keys and RLS
2. Create initialization trigger for new proposals (9 WPs + templates)
3. Insert system templates (DEC, Coordination)

### Phase 2: Core WP Editor
1. Create `useWPDrafts` hook with CRUD operations
2. Build `WPDraftEditor` component
3. Implement methodology question with Sitra's tips
4. Build WP table (objectives + tasks) component
5. Build planning questions section
6. Build effort matrix component
7. Build deliverables table
8. Build risks table

### Phase 3: Proposal Overview WP Card
1. Add WP management card to ProposalSummaryPage
2. Implement inline editing (short name, title, lead partner)
3. Add drag-and-drop reordering
4. Create color picker and palette editor
5. Implement B3.1 population controls

### Phase 4: WP Progress Tracker
1. Create progress calculation logic
2. Build dashboard component with per-WP completion
3. Add proposal totals section
4. Integrate into navigation

### Phase 5: Navigation & Color System
1. Inject WP Drafts into useProposalSections
2. Update SectionNavigator for WP entries with colors
3. Implement WP reference bubbles (TipTap mark)

### Phase 6: PERT & Gantt Charts
1. Create PERTChartFigure component
2. Add dependency selector to overview card
3. Enhance GanttChartFigure for compact format
4. Implement auto-generation on full proposal creation

### Phase 7: B3.1 Integration
1. Build population logic for individual WPs
2. Build "Populate All" functionality
3. Create deliverables consolidation
4. Create risks consolidation

### Phase 8: Template Library
1. Seed DEC and Coordination templates
2. Apply templates on WP initialization
3. Backend template management (database only for now)

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/lib/wpColors.ts` | Color palette utilities |
| `src/hooks/useWPDrafts.ts` | WP draft data management |
| `src/hooks/useWPDependencies.ts` | PERT dependencies |
| `src/hooks/useWPProgress.ts` | Progress calculation |
| `src/extensions/WPReferenceMark.ts` | TipTap WP bubble mark |
| `src/components/WPDraftEditor.tsx` | Main editor |
| `src/components/WPMethodologySection.tsx` | Methodology question |
| `src/components/WPTableSection.tsx` | Objectives + Tasks table |
| `src/components/WPTasksTable.tsx` | Tasks within WP table |
| `src/components/WPEffortMatrix.tsx` | Person-months matrix |
| `src/components/WPPlanningQuestions.tsx` | Input/output/bottleneck |
| `src/components/WPDeliverablesTable.tsx` | Deliverables |
| `src/components/WPRisksTable.tsx` | Risks |
| `src/components/WPColorPicker.tsx` | Color selection |
| `src/components/WPColorPaletteEditor.tsx` | Admin palette editor |
| `src/components/WPManagementCard.tsx` | Overview page card |
| `src/components/WPProgressTracker.tsx` | Progress dashboard |
| `src/components/ParticipantMultiSelect.tsx` | Multi-select |
| `src/components/PERTChartFigure.tsx` | PERT visualization |
| `src/components/WPDependencySelector.tsx` | Add dependencies |

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useProposalSections.ts` | Inject WP Drafts + Progress Tracker |
| `src/components/SectionNavigator.tsx` | WP color indicators |
| `src/components/RichTextEditor.tsx` | WP reference mark |
| `src/components/GanttChartFigure.tsx` | Compact 9pt format |
| `src/pages/ProposalEditor.tsx` | Render new components |
| `src/components/ProposalSummaryPage.tsx` | WP management card |
| `supabase/functions/duplicate-proposal/index.ts` | Copy WP data |

---

## Access Control Summary

| Action | Viewer | Editor | Admin | Owner |
|--------|--------|--------|-------|-------|
| View WP drafts | Yes | Yes | Yes | Yes |
| Edit WP content (methodology, objectives, etc.) | No | Yes | Yes | Yes |
| Change individual WP color | No | Yes | Yes | Yes |
| Add/edit tasks, deliverables, risks | No | Yes | Yes | Yes |
| Edit WP title/short name/lead (overview) | No | No | Yes | Yes |
| Edit color palette | No | No | Yes | Yes |
| Add/remove/reorder WPs | No | No | Yes | Yes |
| Populate B3.1 | No | No | Yes | Yes |
| Add WP dependencies | No | No | Yes | Yes |

---

## Success Criteria

1. New proposals have 9 WP drafts with WP8/WP9 using templates
2. Each WP has methodology question with Sitra's tips
3. WP table contains objectives and tasks together
4. Planning questions capture inputs, outputs, bottlenecks
5. Effort matrix shows PMs per task per participant (feeds budget)
6. WP Progress Tracker shows per-WP completion and proposal totals
7. WP management card on overview allows editing order/title/short name/lead/color
8. Populate B3.1 buttons work for individual and all WPs
9. Deliverables and risks consolidate into merged tables in B3.1
10. PERT chart (3.1.a) auto-generated with WP short names and colors
11. Gantt chart (3.1.b) auto-generated with compact single-page format
12. WP timing calculated from earliest/latest task dates
13. Color palette editable by admin/owner from overview
14. WP bubbles appear inline with stored WP colors

