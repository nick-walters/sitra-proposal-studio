# WP & case drafts on the block/module presentation

Presentation and services only. `wp_drafts`, `wp_draft_tasks`, `wp_draft_deliverables`, `case_drafts` and their join tables stay the source of truth. Blocks are projections over those rows, exactly as `SourceFedBlock` and the B3.1 milestones/risks blocks already are.

## Proposed block structure — WP drafts

| # | Block | Kind | Backing rows | Notes |
|---|-------|------|--------------|-------|
| 1 | Work package header | Source-fed, fixed | `wp_drafts` (number, short name, title, lead participant, participants, start/end, colour) | Not deletable, not draggable. Chips and colour inheritance unchanged. |
| 2 | Objectives | Authored rich text | `wp_drafts.objectives` | Page-styled, locked/streamed (already proven). |
| 3 | Description of work — intro | Authored rich text, optional | the existing pre-task field | Hidden when empty, addable via the add control. |
| 4..n | Task *n* | Authored rich text + relational header | one `wp_draft_tasks` row each | Header carries the T-chip, participants, months; body is the description field. Reorder = server resequencing, delete = recycle bin. |
| n+1 | Deliverables | Relational document table | `wp_draft_deliverables` | Real 18cm Times 11pt table, shared spec, server-derived numbering. |
| n+2 | Effort | Source-fed table | `wp_draft_effort` / `wp_draft_task_effort` | Read-only projection of the existing matrices; not deletable. |

Things that do not fit the Part B pattern and stay as exceptions:
- Blocks 1 and n+2 have no visibility toggle (they are structural, and B3.1 already mirrors WP visibility through the WP draft's own hide flag).
- Task blocks cannot be freely reordered against non-task blocks — drag is constrained to the task run, because ordering is the server-side task number.
- The WP draft lock (whole-draft, distinct from field locking) stays on the page header, not on blocks.

## Proposed block structure — case drafts (second pass, after WP report)

One block per row of `case_subsection_templates`, ordered by `order_index`, plus a fixed case header block. Case-type-driven subsection sets stay as they are; adding/removing a subsection maps to the template rows and the recycle bin via `bin_target_row`.

## Work in the WP pass

1. **Layout** — page container to `max-w-[calc(21cm+3rem)]`, every editable field wrapped in the page surface used by objectives today.
2. **Block chrome** — extract the Part B control row (collapse, grip, visibility, add, restore, delete) into a shared component and use it in both places, so spacing and order are identical by construction.
3. **Services** — locking/streaming on every rich field via `LockedWPRichField`; version history through `save_target_version` with targets `wp:<id>:objectives`, `wp:<id>:intro`, `wp_task:<id>:description`; recycle bin through `bin_target_row` / `restore_binned_target` for tasks and deliverables; the unified three-tier toolbar with capability gating replacing the old WP toolbar path.
4. **Deliverables table** — re-render on the shared document-table spec (18cm, Times 11pt), numbering untouched.
5. **Guidelines** — retire the `BLOCK_GUIDELINE_KEYS` map that borrows `b31.table_b` / `b31.table_c`. Introduce own keys (`wp.header`, `wp.objectives`, `wp.intro`, `wp.task`, `wp.deliverables`, `wp.effort`) seeded with the current borrowed text so nothing reads blank on day one, then authorable in Template Management.
6. **Preview and export** — per-draft Typst preview/export rendering the same content the B3.1 mirror produces for that work package (header table, objectives, tasks, deliverables, effort), reusing `b31Tables.ts` emitters.

## Preserved

Conflict rejection, server renumbering, task–deliverable link dialog, move-between-WPs, colour inheritance, participant/leader chips, case-type subsections, the pilots mirror into B1.2, Gantt/Pert, effort matrices, WP draft locking, undo/redo, WP visibility filtering, find and replace, snapshot scope, edge functions. Any of these that must change will be reported in the WP pass report.
