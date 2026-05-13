# Make all tables (except B3.1) plain editor tables

## Goal

Every Part B section except B3.1 behaves identically: one TipTap editor, plain editor tables inserted from the toolbar, no bespoke row controls or dropdowns inside cells. Cross-references continue to work inside any table cell (they already do — the cross-reference marks are part of the editor schema and aren't tied to section type).

## What changes for the user

- Section B1.2 becomes a single editor — exactly like B1.1, B2.1, B2.2, B3.2.
- The two specialised tables (1.2.a "Ongoing & recently completed projects…" and the 1.2.b case-study tables) disappear from the section. The user can recreate them as ordinary editor tables by clicking the toolbar's "Insert table" button, just like in any other section.
- The participant-bubble dropdown in 1.2.a and the case-study selector are removed.
- The toolbar's table dropdown (Add row, Delete row, Add column, Auto-resize columns, Delete table, Insert formula, Update caption) works in B1.2 exactly as it does in B1.1, B2.1, etc.
- Cross-references (to participants, WPs, tables, figures, etc.) continue to work inside any table cell, in any section.

## Data handling

The existing `b12_ongoing_projects` and `b12_ongoing_project_participants` rows store structured data that has no equivalent in plain editor tables. Two safe options:

1. **Leave the database tables in place** (recommended). The data stays untouched — no destructive migration. The frontend simply stops reading from them. If a user previously filled in 1.2.a, that data isn't lost, just no longer rendered. Storage cost is negligible.
2. Drop the tables in a follow-up migration once you've confirmed nothing important is stored there.

This plan does **option 1** — no DB migration in this pass.

## Files removed

- `src/components/B12OngoingProjectsTable.tsx`
- `src/components/B12CaseStudyTables.tsx`

## Files edited

- **`src/components/DocumentEditor.tsx`** — remove the B1.2 sibling render block (lines ~1624–1625), remove all `b12TableFocus` / `b12FocusedRowId` / `b12FocusedCaseId` state, remove the `b12-table-focus` and `b12-table-autoresize` event listeners, remove the `handleB12*` handlers (Add/Delete row, Delete table, Auto-resize, Update caption), remove the `b12*` props passed into `RichTextEditor`. B1.2 mounts the same plain `EditorContent` it does today (parity already in place from earlier work).
- **`src/components/RichTextEditor.tsx`** — remove the `b12TableFocus`, `onB12AddRow`, `onB12DeleteRow`, `onB12DeleteTable`, `onB12AutoResize`, `onB12UpdateCaption` props from the interface, the `isB12TableActive` branch, and the entire "B12-active" half of the table dropdown menu. Only the standard table dropdown remains, used for every section.
- **`src/index.css`** — remove any leftover `[data-b12-table]`, `b12-…` selectors no longer referenced.
- Remove the now-orphaned `b12-table-autoresize` and `b12-table-focus` custom event names from any other listeners.

## Verification

- Open B1.2 in the preview: section is a plain editor, no inline tables rendered below.
- Toolbar "Insert table" works in B1.2; the resulting table behaves identically to one in B1.1.
- Toolbar table dropdown shows the same items in B1.2 as in B1.1 (no "Add case", no "Delete case").
- Cross-reference dropdown opens inside a cell of a table in B1.2 and inserts a working reference mark.
- Navigating away from B1.2 no longer freezes (was already fixed; stays fixed).
- Build passes; no remaining imports of `B12OngoingProjectsTable` or `B12CaseStudyTables`.

## Out of scope (for this pass)

- Dropping `b12_ongoing_projects` / `b12_ongoing_project_participants` tables from the database.
- Any change to B3.1 — its compulsory tables and bespoke components stay exactly as they are.
- Any change to A3 portal, budget tables, Gantt, PERT, or other non-Part-B structured tables.
