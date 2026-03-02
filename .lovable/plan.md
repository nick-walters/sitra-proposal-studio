

## Plan: Comprehensive Strikethrough Fix

### Root cause

The current approach uses `appendTransaction` to strip track marks from newly typed text when tracking is disabled. This runs **after** the transaction is applied to create `newState` — meaning the character is first inserted *with* the inherited deletion mark, then a follow-up transaction removes it. This creates two problems:

1. **Browser rendering race**: The contentEditable engine sees the inherited `text-decoration: line-through` inline style and applies it to the new character before ProseMirror's cleanup transaction updates the DOM.
2. **Position mapping fragility**: If another plugin's `appendTransaction` also fires (e.g. `preventTableAtStart`), the cleanup positions can shift, leaving some characters uncleaned.

### Fix strategy: intercept input *before* the transaction

Add `handleTextInput` to the TrackChanges plugin's `props`. This fires **before** ProseMirror creates the insertion transaction, letting us strip track marks from stored marks proactively:

```typescript
props: {
  handleTextInput(view, from, to, text) {
    if (extension.storage.enabled) return false;
    const { state } = view;
    const currentMarks = state.storedMarks || state.selection.$from.marks();
    const hasTrackMarks = currentMarks.some(
      m => m.type.name === 'trackInsertion' || m.type.name === 'trackDeletion'
    );
    if (!hasTrackMarks) return false;
    const clean = currentMarks.filter(
      m => m.type.name !== 'trackInsertion' && m.type.name !== 'trackDeletion'
    );
    const tr = state.tr
      .insertText(text, from, to)
      .setStoredMarks(clean.length > 0 ? clean : null);
    tr.setMeta('trackChangesInternal', true);
    view.dispatch(tr);
    return true; // handled
  },
}
```

Keep the existing `appendTransaction` cleanup as a safety net for paste, drag-drop, and other non-`handleTextInput` paths.

### Also handle `handleKeyDown` for Enter

When pressing Enter next to a tracked deletion, the new paragraph can inherit track marks. Add a `handleKeyDown` check for Enter that clears stored marks before the default handler runs (by dispatching `setStoredMarks` without consuming the event).

### Files

- **Edit**: `src/extensions/TrackChanges.ts` — add `props.handleTextInput` and `props.handleKeyDown` to the Plugin inside `addProseMirrorPlugins()`

### What stays the same

- The `appendTransaction` cleanup (belt-and-suspenders)
- The `toggleTrackChanges` command cleanup
- All other track change functionality

