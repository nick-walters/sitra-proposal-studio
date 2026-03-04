
Goal: Rebuild tracked-deletion behavior so editing is deterministic and never leaks deletion styling into normal typing, especially when tracking is OFF.

1) Confirmed root cause (from current code)
- Deletion cursor placement is explicitly set to `newStart` in cross-block handling, which places caret at the left/start side of deleted span instead of after it.
- Tracking-OFF cleanup still mutates marks reactively in `appendTransaction` via mapped ranges; this can accidentally touch existing deletion-marked content and “erase” deletion highlighting/review entries.
- Change collection merges by `changeId` only, so split deletion segments can collapse into one logical change unexpectedly.

2) Overhaul architecture (single, predictable policy)
- Introduce a strict invariant:
  - Tracking OFF: existing tracked marks are immutable; only newly typed content is sanitized (no track marks).
  - Tracking ON: deletion tracking can mutate marks/text as expected.
- Move all typing behavior (including typing inside/after deletions) to proactive input handlers; stop relying on broad reactive stripping for this path.
- Keep reactive logic only for true fallback/programmatic cases, with narrower scope.

3) Behavioral rules to implement
- Rule A: After creating a tracked deletion, caret lands after the deleted span (right boundary), not at the start/inside it.
- Rule B: With tracking OFF, typing after/inside deletion never inherits strikethrough/highlight.
- Rule C: With tracking OFF, typing in the middle of a deletion splits it into two tracked deletions that remain visible in review.

4) Concrete implementation plan

A. `src/extensions/TrackChanges.ts`
- Add deletion-boundary helpers:
  - `findDeletionSegmentAtPos(doc, pos)` (returns segment + attrs)
  - `sanitizeInsertedRange(tr, from, to, insertionType, deletionType)` (remove track marks only from newly inserted text)
  - `setCursorAfterRange(tr, from, to)` (stable right-edge placement)
- Update tracking-ON deletion path:
  - In both same-block and cross-block deletion handlers, set selection to right edge of tracked deletion span.
- Replace tracking-OFF typing path:
  - `handleTextInput` becomes authoritative for keyboard typing.
  - If cursor is inside deletion mark, insert plain text and sanitize only inserted range.
  - Preserve left/right deletion segments.
  - Reassign one side (typically right segment) to a new `changeId` so review shows two deletions (not merged).
- Add `handlePaste` parity:
  - Sanitize pasted content insertion ranges similarly when tracking OFF.
- Narrow tracking-OFF `appendTransaction`:
  - Remove broad “strip marks from mapped inserted content” behavior that can mutate existing deletions.
  - Keep only safe storedMarks cleanup and review-panel recompute.
  - Use targeted cleanup only when a transaction is explicitly tagged as “new insertion sanitation”.

B. `collectChangesFromDoc` (same file)
- Stop merging solely by `changeId`.
- Represent each contiguous marked run as its own change item (or key by `changeId + contiguous range`) so split deletions appear as separate review entries.

C. `src/components/RichTextEditor.tsx`
- Keep toggle-off stored mark cleanup, but ensure it never removes document marks—stored marks only.
- No additional reactive stripping logic in component-level effects.

5) Regression test expansion (`src/test/TrackChanges.test.ts`)
Add focused tests for the exact bug contract:
- Cursor lands after tracked deletion boundary (not inside/start).
- Tracking OFF + typing at end of deletion: inserted text has no deletion mark; existing deletion remains tracked.
- Tracking OFF + typing in middle of deletion: deletion becomes two tracked segments; both remain in review list.
- Tracking OFF + paste inside deletion: pasted content plain, surrounding deletions preserved.
- No disappearance from review panel after off-mode typing near deletion.

6) Safety/rollout
- Implement behind existing extension behavior (no schema migration).
- Validate with current tests + new targeted cases.
- Manual end-to-end sanity pass in proposal editor:
  - create deletion with tracking ON
  - toggle OFF
  - type after deletion
  - type inside deletion
  - verify styling + review panel consistency.

Technical details
- Data-flow model:
```text
Keyboard input
  -> handleTextInput/handleKeyDown (authoritative)
     -> precise tr mutation (only inserted span sanitized)
     -> optional split-id reassignment for right segment
     -> dispatch trackChangesInternal
appendTransaction
  -> fallback only (no broad mark stripping when OFF)
```
- Key invariant checks:
```text
OFF mode:
- Existing [trackDeletion|trackInsertion] marks are never removed implicitly.
- New inserted text always ends with mark set excluding track marks.
```
