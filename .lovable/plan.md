

## Plan: Comprehensive Track Changes Fix

### Root Cause Analysis

There are three fundamental problems in the current implementation, all stemming from the architecture of the deletion tracking in `appendTransaction`.

---

#### Problem 1: Cursor jumps and fragmented changes during deletion

The PURE DELETION handler (lines 770-834) works like this:
1. ProseMirror applies the user's Backspace/Delete, removing text from the document (step: `oldStart..oldEnd` → `newStart..newStart`)
2. `appendTransaction` fires with `newState` where the text is **already gone**
3. The handler reads the deleted content from `oldState.doc` and **re-inserts** it at `newStart` with a deletion mark

This is fundamentally broken because:
- **Re-insertion shifts all positions** in the document, causing ProseMirror's selection mapping to land the cursor in unpredictable locations
- **Each keystroke creates a new `changeId`** — there is no merge window for deletions (unlike the 5-second window for insertions at line 676), so pressing Backspace 5 times creates 5 separate tracked changes
- **Mixed `nodesToReject` + `nodesToReinsert`** inserts at two different positions within the same transaction, compounding the position errors
- The same pattern affects the REPLACEMENT handler (lines 690-767), which also re-inserts deleted content

#### Problem 2: Strikethrough persists after toggle off

The `appendTransaction` cleanup (lines 614-633) uses raw `stepMap.forEach` coordinates (`newStart`, `newEnd`) to call `cleanTr.removeMark()`. But these coordinates are in the step's local coordinate space, **not** in `newState`'s coordinate space. When multiple steps exist, or when other plugins also append transactions, the positions are wrong — marks are removed from incorrect ranges or skipped entirely.

Additionally, `$from.marks()` resolves marks from the document content at the cursor position. Even after `storedMarks` are cleared, ProseMirror's text node joining logic can cause newly typed characters to inherit marks from adjacent tracked-change nodes. The `handleTextInput` interceptor handles this for typed characters, but `filterTransaction` only clears `storedMarks` — it doesn't prevent content-level mark inheritance.

#### Problem 3: Stale review panel entries

The current reconciliation (lines 648-658) uses `setTimeout(() => collectChangesFromDoc(...), 10)` which reads from `extension.editor.state` — but at that point the state may not have fully settled (other plugins may still be appending). This causes the panel to show stale or duplicated entries.

---

### Fix Strategy

**The core architectural change**: Move deletion tracking from `appendTransaction` (reactive, after deletion) to `filterTransaction` (proactive, before deletion). Instead of letting ProseMirror delete text and then re-inserting it, **prevent the deletion transaction entirely** and dispatch a replacement transaction that adds a deletion mark to the text **in place** (without removing it).

This eliminates all cursor-jump issues because the text never moves — only a mark is toggled.

### Detailed Changes

#### File: `src/extensions/TrackChanges.ts`

**1. Rewrite `filterTransaction` to intercept deletions when tracking is ON**

When tracking is enabled and the transaction contains a deletion step:
- Reject the original transaction (`return false`)
- Dispatch a new transaction that adds `trackDeletion` marks to the text ranges that would have been deleted, without removing any content
- Handle the "own insertion" case: if deleted text has a `trackInsertion` from the same author, silently remove both the text and the insertion mark
- Handle the "already deleted" case: if deleted text already has a `trackDeletion`, remove the mark (treat as reject)
- Implement a **deletion merge window** (5 seconds, matching insertions) so consecutive Backspace presses share the same `changeId`

```text
filterTransaction flow when tracking ON:
  ┌─────────────────────────────┐
  │ Transaction has deletions?  │
  └──────────┬──────────────────┘
             │ yes
  ┌──────────▼──────────────────┐
  │ For each deleted range:     │
  │ - Own insertion? → remove   │
  │ - Already deleted? → reject │
  │ - Normal text? → add mark   │
  └──────────┬──────────────────┘
             │
  ┌──────────▼──────────────────┐
  │ Dispatch replacement tr     │
  │ return false (block orig)   │
  └─────────────────────────────┘
```

**2. Rewrite `filterTransaction` when tracking is OFF**

In addition to clearing `storedMarks`, also strip track marks from **any newly inserted content ranges** in the transaction. This handles the mark-inheritance issue by cleaning up at the transaction level before the state is committed. Use `tr.mapping` to correctly map step coordinates.

**3. Simplify `appendTransaction`**

With deletions handled in `filterTransaction`:
- Remove the entire PURE DELETION block (lines 770-834)
- Remove the deletion part of REPLACEMENT block (lines 690-745) — handle in `filterTransaction` instead
- Keep only the PURE INSERTION marking logic (lines 837-867)
- Keep the tracking-OFF cleanup as a safety net, but fix the coordinate mapping to use `tr.mapping.map()` for correct positions
- Move the `collectChangesFromDoc` call to be synchronous (no `setTimeout`) by reading from the transaction's resulting doc directly

**4. Add deletion merge window**

Add `lastDeletionId` and `lastDeletionTime` to storage (parallel to `lastInsertionId`/`lastInsertionTime`). Consecutive deletions within 5 seconds share the same `changeId`.

**5. Fix the `handleTextInput` handler**

After stripping track marks from `storedMarks`, also explicitly call `tr.removeMark(from, from, insertionType)` and `tr.removeMark(from, from, deletionType)` on the insertion point to prevent content-level mark inheritance from adjacent nodes.

#### File: `src/components/RichTextEditor.tsx`

**6. Fix track changes sync effect (lines 1255-1277)**

The current code uses `toggleTrackChanges()` which toggles the storage boolean and potentially double-toggles. Replace with direct storage assignment:
```typescript
storage.enabled = trackChanges?.enabled || false;
```
This avoids the toggle race condition and the unnecessary stored-mark cleanup transaction that fires during sync.

### What stays the same

- Mark definitions (`TrackInsertionMark`, `TrackDeletionMark`)
- All commands (`acceptChange`, `rejectChange`, `acceptAll`, `rejectAll`, navigation, cursor commands)
- `collectChangesFromDoc` function
- `handleKeyDown` for Enter key
- All UI components (`TrackChangesToolbar`, `TrackChangeBubbleMenu`, `CommentsSidebar`)
- Backfill logic in `DocumentEditor.tsx`

### Files to edit

1. **`src/extensions/TrackChanges.ts`** — Major rewrite of `filterTransaction` and simplification of `appendTransaction`
2. **`src/components/RichTextEditor.tsx`** — Fix track changes sync effect (lines 1255-1277)

