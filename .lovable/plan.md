

## Track Changes — Strikethrough Inheritance & Split Deletion Fix

### Important Context for the Other LLM's Advice

The suggestions from Claude (DOM-level fixes like `document.createTextNode`, CSS rules for `<del>` elements) **do not apply to this codebase**. This editor uses **ProseMirror/Tiptap**, which operates on an abstract document model, not the DOM directly. The marks (`trackDeletion`, `trackInsertion`) exist in ProseMirror's data layer, and ProseMirror renders them to the DOM. All fixes must happen at the ProseMirror transaction level.

---

### Root Cause Analysis

The code has three layers that handle text input:
1. `handleTextInput` — intercepts keyboard typing (lines 685–759)
2. `appendTransaction` — reacts to all transactions after they commit (lines 975–1280)
3. `filterTransaction` — strips storedMarks when tracking is OFF (lines 647–675)

**Bug 1 (Strikethrough inheritance):** When tracking is OFF and `insertContent` (or any programmatic insertion) runs near a deletion boundary, it bypasses `handleTextInput` entirely. The tracking-OFF branch of `appendTransaction` (lines 999–1031) only cleans `storedMarks` — it never strips inherited deletion marks from newly inserted text nodes. So if ProseMirror resolves marks from surrounding context, the deletion mark sticks.

**Bug 2 (No split):** The inside-deletion detection in `appendTransaction` (lines 1218–1230) uses `findDeletionSegmentAtPos`, which has an overly complex multi-pass search with fragile boundary math (lines 103–131). It can return incorrect `from`/`to` ranges, causing the `insideDeletion` check to fail. When it fails, the inserted text keeps the inherited deletion mark and no split occurs.

---

### Fix Plan

#### 1. Fix `appendTransaction` tracking-OFF branch (lines 999–1031)

When `hasUserChange` is true, iterate the transaction steps to find newly inserted ranges. For each inserted range in `newState.doc`, strip any `trackDeletion` and `trackInsertion` marks. This is the defensive catch-all that prevents any mark inheritance regardless of how the insertion was triggered.

```text
TRACKING OFF + hasUserChange:
  for each step in transactions:
    for each range (oldStart, oldEnd, newStart, newEnd):
      if newEnd > newStart (insertion happened):
        cleanTr.removeMark(newStart, newEnd, deletionType)
        cleanTr.removeMark(newStart, newEnd, insertionType)
        needsTr = true
```

#### 2. Simplify `findDeletionSegmentAtPos` (lines 54–132)

Replace the current three-pass approach with a single `doc.nodesBetween` call scoped to the parent block. Walk all text nodes, collect contiguous deletion runs, return the one containing `pos`. This eliminates the fragile boundary math.

```text
findDeletionSegmentAtPos(doc, pos, deletionType):
  resolve pos → $pos
  blockStart = pos - $pos.parentOffset
  blockEnd = blockStart + $pos.parent.content.size
  
  collect contiguous deletion runs in [blockStart, blockEnd]
  return the run where from < pos < to (or from <= pos <= to)
```

#### 3. Harden the inside-deletion branch in appendTransaction (lines 1209–1230)

After the `removeMark` calls, also set `storedMarks` to clean marks so the cursor doesn't inherit tracked marks for subsequent keystrokes.

#### 4. Ensure `handleTextInput` inside-deletion path (lines 710–733) also works for tracking ON

Currently this path fires with `trackChangesInternal: true`, which means `appendTransaction` skips it. This is correct — but verify that when tracking is ON and typing inside a deletion, the text gets an insertion mark (not just plain). Add the insertion mark explicitly in this branch when tracking is ON.

---

### Files to Change

- **`src/extensions/TrackChanges.ts`** — all four fixes above
- **`src/test/TrackChangesTypingBoundary.test.ts`** — verify existing tests pass
- **`src/test/TrackChangesDeletion.test.ts`** — verify existing tests pass

### Risks

- The `appendTransaction` mark-stripping for tracking OFF must only target genuinely new insertions (ranges where `newEnd > newStart && oldEnd === oldStart`), not pre-existing content
- Cursor placement after splitting must land between the two deletion halves, not inside one of them

