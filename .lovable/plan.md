
# Fix Cross-Reference Syncing and Add Task Drag-and-Drop

## Problem Summary

Three issues identified during testing:

1. **WP cross-refs don't update** when WPs are reordered in the WP manager -- the sync function exists and is correct, but it only runs once when the DocumentEditor mounts or changes section. It never re-runs after WP reordering happens elsewhere.

2. **Case cross-refs don't update** when cases are reordered -- same root cause as WPs.

3. **No way to reorder tasks** in the B3.1 WP description tables -- drag-and-drop with handles and delete buttons are needed to test task cross-ref linking.

---

## Root Cause Analysis

The `syncCrossReferences` function in `src/lib/syncCrossReferences.ts` correctly fetches current data and updates marks. However, it is only called in a `useEffect` in `DocumentEditor.tsx` that depends on `[editor, proposalId, section?.id, loading]`. When a user reorders WPs or cases from the management panel, none of these dependencies change, so the sync never re-fires.

The fix requires a mechanism to trigger re-sync when the underlying data changes.

---

## Implementation Plan

### Part 1: Trigger cross-ref sync when WP/case data changes

**File: `src/components/DocumentEditor.tsx`**

- Add a `syncTrigger` counter state variable.
- Listen to React Query cache invalidations for WP and case data via `useEffect` watching relevant query keys, or more simply: subscribe to a `window` custom event.
- **Chosen approach**: Use a custom event pattern. When WPs or cases are reordered, dispatch a `CustomEvent('cross-ref-data-changed')` on `window`. The DocumentEditor listens for this event and increments `syncTrigger`, which is added to the existing `useEffect` dependency array, causing `syncCrossReferences` to re-run.

**File: `src/components/WPManagementCard.tsx`**

- After the WP reorder mutation succeeds, dispatch `window.dispatchEvent(new CustomEvent('cross-ref-data-changed'))`.

**File: `src/components/CaseManagementCard.tsx`**

- After the case reorder mutation succeeds, dispatch the same `cross-ref-data-changed` event.

This is a lightweight, decoupled approach that doesn't require prop drilling or context providers.

### Part 2: Add task drag-and-drop to B3.1 WP description tables

**File: `src/components/B31WPDescriptionTables.tsx`**

- Import `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities` (already installed).
- Wrap each WP's task list in a `DndContext` + `SortableContext`.
- Create a `SortableTaskGroup` wrapper component that wraps the three task rows (header, metadata, description) in a single sortable item with:
  - A drag handle (GripVertical icon) prepended to the task header row.
  - A red delete button (Trash2 icon) appended to the task header row, with an `AlertDialog` confirmation before deletion.
- On drag end, compute the new order, update `order_index` and `number` for all tasks in that WP via Supabase, and invalidate the `b31-wp-data` query.
- The sortable item uses `useSortable` with `CSS.Transform.toString(transform)` applied to a wrapping `<tbody>` or `<div>` around the three `<tr>` elements. Since HTML tables don't allow arbitrary wrappers around `<tr>` groups easily, the approach will wrap each task's rows in a mini `<table>` within a sortable `<div>`, or alternatively use a `display: contents` wrapper. The cleanest approach: wrap each task group in a `<tbody>` element (multiple `<tbody>` elements are valid HTML within a single `<table>`), making each `<tbody>` the sortable unit.

### Part 3: Sync cross-refs in section content stored in the database

The current sync only updates the live editor instance. For B3.1 content that's stored as HTML in `section_content`, the cross-references embedded there also need updating. This is a larger scope item -- for now, the immediate fix ensures that when a user is viewing/editing a section, the live editor content updates. The B3.1 compulsory tables render from live data (not stored HTML), so they already reflect current numbering.

---

## Technical Details

### Custom event approach for sync triggering

```text
WPManagementCard (reorder)
    |
    v
window.dispatchEvent('cross-ref-data-changed')
    |
    v
DocumentEditor useEffect listener
    |
    v
syncCrossReferences(editor, proposalId)
```

### B3.1 task drag-and-drop structure

```text
<table>
  <!-- WP header rows -->
  <tbody data-sortable-task="task-1">  <-- sortable unit
    <tr> Task header (drag handle + number + title + delete btn) </tr>
    <tr> Leader + partners + timing </tr>
    <tr> Description </tr>
  </tbody>
  <tbody data-sortable-task="task-2">
    ...
  </tbody>
</table>
```

### Files to modify

| File | Change |
|------|--------|
| `src/components/DocumentEditor.tsx` | Add `cross-ref-data-changed` event listener that re-triggers `syncCrossReferences` |
| `src/components/WPManagementCard.tsx` | Dispatch `cross-ref-data-changed` after WP reorder/delete mutations |
| `src/components/CaseManagementCard.tsx` | Dispatch `cross-ref-data-changed` after case reorder/delete mutations |
| `src/components/B31WPDescriptionTables.tsx` | Add drag-and-drop task reordering with handles and delete buttons with confirmation |

### No new dependencies required

All drag-and-drop libraries (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`) are already installed.
