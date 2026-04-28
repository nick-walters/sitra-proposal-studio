# Make all Part B sections structurally equal

## Premise

Every Part B body editor (B1.1, B1.2, B2.1, B2.2, B3.1, B3.2) supports inserting tables via the toolbar, so they all carry the same editor complexity. The other sections are stable because the editor mounts directly inside `DocumentEditor` with nothing gating it.

Two sections currently get bespoke treatment:

- **B1.2** is wrapped in `B12SectionContent`, which defers mounting the editor behind two async queries and recomputes table indices on every editor update. This wrapper is what causes the cursor freezes and the iPhone‑app crash.
- **B3.1** has compulsory auto‑populated tables and figures (`B31IntroText`, `B31SectionContent`) appended after the editor. That part is fine and is the model to follow. What is *not* fine is the visual treatment that makes B3.1 look like a separate kind of page: `b31-document-page` and `b31-editor-container` classes, removal of the editor's `min-h-[400px]`, and a tighter top margin. These create the "divider" feel the user has consistently rejected.

The fix: B1.2 stops being wrapped, B3.1 stops looking different. All Part B sections render the editor identically, with any section‑specific siblings simply appended after it — no wrapper, no gating, no special page styling.

## What changes

### 1. B1.2: remove the wrapper entirely

In `DocumentEditor.tsx` (around line 1630), drop the `isB12 ? <B12SectionContent …> : editorBlock` branch. The editor renders directly, identical to B1.1/B2.1/B2.2/B3.2.

Right after the editor block, when `section.id === 'b1-2'`, render two sibling components:

- `<B12OngoingProjectsTable />`
- `<B12CaseStudyTables />` (rendered conditionally on `hasCases`, queried inside the component itself)

Both already self‑load their data and need no wrapper.

Drop the drag‑to‑reorder feature for B1.2 blocks (no other Part B section offers it; user's stated requirement is parity). Order becomes fixed: editor → ongoing projects → case studies. This removes:

- The `b12-block-order` row read/write in `table_captions`
- The `blockOrder` / `draggedBlock` / `dragOverBlock` state
- The drag handle column
- The `b12-table-offset` event and `b12TableOffset` plumbing in `DocumentEditor`
- The `countEditorTableCaptions(editor)` call that ran on every render

Caption renumbering keeps working because `renumberCaptionsInEditor` already accepts an offset (now a constant 0, since companion tables come after the editor).

Delete `src/components/B12SectionContent.tsx`.

Keep the `b12-table-focus` event as is — it's how `DocumentEditor` knows which contextual toolbar to show, symmetric with `b31-table-focus`, and not part of the bug.

### 2. B3.1: remove the visual "divider" treatment

In `DocumentEditor.tsx`:

- Remove the `b31-document-page` conditional class on the document page wrapper (line ~1577).
- Remove the `b31-editor-container` conditional class on the editor container (line ~1600).
- Remove the `mb-2` vs `mb-6` H1 branch (line ~1585) — use `mb-6` like every other section.
- Remove the `isB31 ? '' : 'min-h-[400px]'` branch (line ~1603) — keep `min-h-[400px]` for B3.1 as well so the body editor has the same generous click target as everywhere else.
- Drop the `isB31` local variable.

In `src/index.css` (or wherever they live), the `.b31-document-page` and `.b31-editor-container` rules become unused; remove them so they cannot be reapplied accidentally. Anything inside `B31SectionContent` itself (the auto‑populated tables/figures) keeps its own styling — only the *page* and *editor container* get normalised.

`B31IntroText` and `B31SectionContent` continue to render as siblings after the editor, exactly as today. They are not behind a divider; they sit immediately after the body content with the same vertical rhythm as any other sibling block.

### 3. Result: one Part B layout

```text
┌───────────────────── document-page ─────────────────────┐
│  H1 (section number + title) — mb-6                     │
│                                                         │
│  ┌─── tiptap-editor-container (min-h-[400px]) ────┐    │
│  │  body editor (tables, figures, captions, etc.) │    │
│  └────────────────────────────────────────────────┘    │
│                                                         │
│  Section‑specific siblings (only if any):               │
│   • B1.2 → ongoing projects, case studies               │
│   • B3.1 → intro text, auto‑populated tables/figures    │
│   (others have none)                                    │
│                                                         │
│  Footnotes                                              │
└─────────────────────────────────────────────────────────┘
```

## Why this is safe

- The editor mounts the same way for every Part B section, so the cursor‑freeze / iPhone‑crash root cause is removed.
- B3.1's compulsory content still renders — only its *visual* differentiation goes away. No data, queries, or population logic change.
- No database schema changes. Orphaned `b12-block-order` rows in `table_captions` are harmless.
- "User can add a table to any Part B editor" is preserved everywhere.

## Files touched

- `src/components/DocumentEditor.tsx` — remove `isB12` branch, remove `isB31` page/editor styling branches, mount B1.2 sibling components after the editor, remove `b12-table-offset` listener and `b12TableOffset` state.
- `src/components/B12SectionContent.tsx` — deleted.
- `src/index.css` (and any related stylesheet) — remove now‑unused `.b31-document-page` and `.b31-editor-container` rules.
- `src/components/B12OngoingProjectsTable.tsx`, `src/components/B12CaseStudyTables.tsx` — verify they work with a fixed table offset (no behavioural change expected).

## Verification

- Open B1.1 → place cursor in body → works (regression check).
- Open B1.2 → place cursor in body → works, no remount, no freeze.
- Insert a table into B1.2 body → caption numbering correct relative to ongoing‑projects / case‑study tables.
- Navigate B1.1 → B1.2 → B2.1 repeatedly on the iPhone app → no crash.
- B1.2 companion tables (ongoing projects, case studies) still render and edit correctly.
- Open B3.1 → page header spacing and editor container look identical to B1.1/B2.1/B3.2; auto‑populated tables and figures still render after the body, no visual divider.
