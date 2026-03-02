

## Root Cause Analysis

I traced through the entire `filterTransaction` → `queueMicrotask` → `view.dispatch` flow and the `appendTransaction` tracking-OFF cleanup. There are **two distinct root causes**.

---

### Bug 1: Cursor jumps and fragmented changes — `queueMicrotask` race condition

The current same-block deletion handler at line 576 uses `queueMicrotask(() => { view.dispatch(...) })`. This is architecturally broken:

1. `filterTransaction` blocks the original deletion (`return false`)
2. The replacement transaction is scheduled **asynchronously** via `queueMicrotask`
3. Between blocking and dispatching, the user may press another key — now `view.state` has changed
4. The guard `if (currentState.doc !== state.doc) return` silently drops the deletion
5. Multiple rapid keystrokes queue separate microtasks that read stale/modified `view.state`
6. Result: some deletions are dropped, some apply to wrong positions, cursor lands unpredictably

**Why `queueMicrotask` was used**: ProseMirror's `filterTransaction` doesn't allow calling `view.dispatch()` synchronously (it's re-entrant and corrupts view state).

**Fix**: Move same-block deletion interception to `handleKeyDown` in the plugin's `props`. This fires **before** ProseMirror creates any transaction, so we can dispatch our own custom transaction synchronously and return `true` to prevent the default behavior. No async, no race.

For programmatic deletions (`deleteSelection` from toolbar/commands), keep the existing `appendTransaction` cross-block handler but add explicit cursor positioning.

### Bug 2: Strikethrough persists — `setStoredMarks(null)` vs `setStoredMarks([])`

Every location that clears track marks from stored marks uses this pattern:
```typescript
tr.setStoredMarks(clean.length > 0 ? clean : null);
```

In ProseMirror:
- `setStoredMarks(null)` = "no override, use marks from document content at cursor" → `$from.marks()` returns the track marks from adjacent nodes
- `setStoredMarks([])` = "explicitly no marks" → prevents all mark inheritance

When the cursor is inside or adjacent to tracked text, setting `null` causes ProseMirror to re-inherit the deletion/insertion marks from the content. This is why strikethrough persists after toggling off.

This pattern appears in **7 locations** across `TrackChanges.ts` and `RichTextEditor.tsx`.

---

## Fix Plan

### File: `src/extensions/TrackChanges.ts`

**1. Replace `filterTransaction` tracking-ON block with `handleKeyDown` Backspace/Delete interception**

Remove lines 517-735 (the `filterTransaction` tracking-ON block with `queueMicrotask`).

Add to the existing `handleKeyDown` handler in `props`:
- When tracking is ON and key is `Backspace` or `Delete`:
  - Compute the range to be deleted from current selection (for range selections, use selection bounds; for cursor, resolve one character in the appropriate direction)
  - Check if deletion crosses block boundaries → if so, return `false` (let `appendTransaction` handle)
  - For each text node in the deletion range, categorize:
    - Own tracked insertion → actually delete (remove text)
    - Existing deletion mark → reject (remove mark, restore text)
    - Normal text → add `trackDeletion` mark in-place (text stays)
  - Use deletion merge window (5s, same as current)
  - Set cursor position explicitly
  - Dispatch custom transaction with `trackChangesInternal` meta
  - Return `true` to prevent default

**2. Fix all `setStoredMarks` calls** — replace `clean.length > 0 ? clean : null` with just `clean`

Locations in TrackChanges.ts:
- Line 218 (toggleTrackChanges command)
- Line 511 (filterTransaction tracking-OFF)
- Line 766 (handleTextInput)
- Line 796 (handleKeyDown Enter)
- Line 896 (appendTransaction tracking-OFF)

**3. Add explicit cursor positioning to `appendTransaction` cross-block deletion handler**

After re-inserting deleted text at line 1032, add:
```typescript
try {
  newTr.setSelection(TextSelection.create(newTr.doc, newStart));
} catch { /* let PM handle */ }
```

### File: `src/components/RichTextEditor.tsx`

**4. Fix `setStoredMarks` call at line 1282**

Change `tr.setStoredMarks(cleaned.length > 0 ? cleaned : null)` to `tr.setStoredMarks(cleaned)`.

### What stays the same

- Mark definitions, all commands, `collectChangesFromDoc`, all UI components
- `appendTransaction` cross-block deletion handler (just add cursor fix)
- `appendTransaction` pure insertion handler
- `appendTransaction` tracking-OFF cleanup (just fix `setStoredMarks`)
- All existing tests should still pass

### Files to edit

1. **`src/extensions/TrackChanges.ts`** — Replace queueMicrotask with handleKeyDown, fix 5 setStoredMarks calls, add cursor positioning
2. **`src/components/RichTextEditor.tsx`** — Fix 1 setStoredMarks call

