

## Plan: Comprehensive Track Changes Fix

### Issue 1: Strikethrough persists after toggle off

**Root cause**: The `handleTextInput` interception (line 501) correctly strips marks before insertion, BUT there is a deeper problem. When the cursor is positioned inside a `trackDeletion` span, ProseMirror resolves marks from `$from.marks()` which includes the deletion mark. The `handleTextInput` handler strips it and dispatches a custom transaction. However, `handleTextInput` only fires for **typed characters** -- it does NOT fire for:
- Paste operations
- Autocomplete/spellcheck insertions (browser IME)
- `insertContent` commands from toolbar buttons

The `appendTransaction` fallback (line 560) does strip marks from new ranges, but it runs **after** the DOM update, so the browser's contentEditable briefly renders the inherited `line-through` style. On fast typing, this creates a visible flicker that sometimes sticks.

**Fix**: Instead of relying on `handleTextInput` + `appendTransaction`, use a **`filterTransaction`** approach. Add a `filterTransaction` method to the plugin that intercepts ALL transactions (not just text input) when tracking is disabled. For any transaction that inserts content, it will rewrite the transaction to exclude track marks from the inserted range. This fires **before** the state update reaches the DOM.

Specifically in `TrackChanges.ts`:
- Add `filterTransaction(tr, state)` to the Plugin that, when tracking is OFF, removes track marks from the `storedMarks` on the transaction itself (via `tr.setStoredMarks`) before it is applied. This catches every input path.
- Keep `appendTransaction` as a secondary safety net to strip marks from any content that slipped through.
- Keep `handleTextInput` for the proactive clean insertion path.

### Issue 2: Deleting text while tracking ON does not work properly

**Root cause**: When a user deletes text that already has a `trackDeletion` mark, the deletion handler at line 734 intercepts it and re-inserts the deleted text with a new deletion mark. But the original text already had a deletion mark, so the result is text with TWO deletion marks stacked. This confuses the change list and makes the text appear stuck.

**Fix**: In the PURE DELETION handler (line 734), check each deleted node: if it already has a `trackDeletion` mark from another author, treat the second deletion as **rejecting** the original deletion (per user preference). This means:
- Remove the `trackDeletion` mark from the text (restore it as normal text)
- Do NOT re-insert with a new deletion mark
- If the deleted text has a `trackDeletion` from the **same** author, silently remove it (same as own-insertion deletion behavior)

### Issue 3: Stale tracked changes in review panel

**Root cause**: When someone edits without tracking enabled and deletes text that contained track marks, the marks are removed from the document. However, the `trackedChanges` state array in `DocumentEditor.tsx` is only updated via `onChangesUpdate` which fires from `appendTransaction`. When tracking is OFF, the tracking-enabled branch of `appendTransaction` never runs, so `collectChangesFromDoc` is never called, and the panel retains stale entries.

**Fix**: In `appendTransaction`, after the tracking-OFF cleanup branch (line 582-624), always re-scan and call `onChangesUpdate`. This ensures that whenever content changes with tracking off (e.g., someone deletes tracked text), the changes list is reconciled with the actual document state.

### Issue 4: Timestamp consistency (minor, still pending)

- `TrackChangeBubbleMenu.tsx` uses `format(d, 'dd.MM.yyyy, HH:mm')` (lines 68, 117) instead of `smartTimestamp`. Change to use `smartTimestamp` for consistency.
- `CommentsSidebar.tsx` reply timestamps (line 232) use raw `formatDistanceToNow` instead of `smartTimestamp`. Change to use `smartTimestamp`.

### Files to edit

1. **`src/extensions/TrackChanges.ts`**
   - Add `filterTransaction` to strip stored track marks from ALL transactions when disabled
   - Modify PURE DELETION handler to detect already-deleted text and treat as rejection
   - Add `collectChangesFromDoc` + `onChangesUpdate` call in the tracking-OFF branch of `appendTransaction`

2. **`src/components/TrackChangeBubbleMenu.tsx`**
   - Replace `format(d, 'dd.MM.yyyy, HH:mm')` with `smartTimestamp(d)` (two locations)

3. **`src/components/CommentsSidebar.tsx`**
   - Replace `formatDistanceToNow` on reply timestamps (line 232) with `smartTimestamp`

