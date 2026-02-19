

# Comprehensive Plan: Version History, Track Changes, and Code Cleanup

---

## Issue 1: Version History Not Saving New Versions

### Root Cause Analysis

The database confirms that section `b1-1` was last edited today (Feb 19) but the latest version snapshot is from Feb 9 (version 2). Content autosave works (via `section_content` table), but version snapshots (via `section_versions` table) are not being created.

**Critical Bug Found**: The `getAuthToken()` function in `useSectionContent.ts` reads from the wrong localStorage key:
- It reads: `sb-nfeoyxjstfehwrkgapho-auth-token` (the default Supabase key)
- The actual key is: `sitra-proposal-studio-auth` (custom `storageKey` set in the Supabase client config)

This means all synchronous XHR saves (on page unload/unmount) silently fail with no auth token, so versions are never created on navigation away.

**Additional Issues**:
1. The async `saveVersion()` has a 2-minute throttle (`VERSION_MIN_INTERVAL`), but it is only triggered after a successful content save. If the user makes one edit, saves happen, but subsequent edits within 2 minutes are throttled. The periodic interval (every 2 minutes) should catch this, but it checks `pendingContentRef.current ?? contentRef.current` -- if content was already saved (clearing `pendingContentRef`), it compares against `lastVersionContentRef.current` which may already match.
2. The equality check `contentToSave === lastVersionContentRef.current` can produce false matches because `saveContentImmediately` may renumber captions (producing `finalContent` different from the original `contentToSave`), but `saveVersion` receives `finalContent` while `lastVersionContentRef` was set on version save, not content save.

### Fix Plan

1. **Fix `getAuthToken()`**: Change the localStorage key from `sb-nfeoyxjstfehwrkgapho-auth-token` to `sitra-proposal-studio-auth` to match the Supabase client config.

2. **Ensure periodic version saving works reliably**: 
   - After every successful content save, update a ref (`lastSavedContentRef`) with the final content that was actually written to the database.
   - The periodic interval should compare against `lastVersionContentRef` using this ref, not `pendingContentRef` (which is null after save).
   - Reduce the throttle check in `saveVersion` to allow the periodic interval to always succeed if content differs from the last version.

3. **Force a version save on section navigation**: When the user navigates to a different section (component unmount), always attempt a version save if content differs from the last version -- using the fixed sync XHR.

---

## Issue 2: Track Changes Bugs (Make it Work Like Microsoft Word)

### Current Behavior Analysis

The track changes implementation has several issues compared to Word-style behavior:

1. **Deletion handling is fragile**: When tracking is on and text is deleted, the extension tries to re-insert the deleted text with a deletion mark. But this happens in `appendTransaction`, which operates on the already-modified `newState`. The re-insertion uses `schema.text(deletedText, [deletionMark])` which creates a flat text node, losing any formatting (bold, italic, etc.) the original text had.

2. **Mixed insertion+deletion (replacement) not handled**: When a user selects text and types over it (replace), both a deletion and insertion happen in the same step. The current code handles `oldEnd > oldStart && newEnd <= newStart` (pure deletion) and `newEnd > newStart && oldEnd <= oldStart` (pure insertion) separately, but a replacement where `oldEnd > oldStart && newEnd > newStart` falls through without proper handling -- the old text is simply replaced without being preserved as a deletion.

3. **Merge window for consecutive insertions**: The 10-second merge window (`MERGE_WINDOW_MS`) groups consecutive keystrokes into one change. This is reasonable but can create confusingly large change blocks if the user types continuously.

4. **Accept/reject all uses stale positions**: `acceptAllChanges` and `rejectAllChanges` scan the document for marks and collect ranges, then apply operations. But removing insertion marks and then deleting deletion ranges uses positions from the original doc scan, which may be invalidated after the first set of operations.

### Fix Plan

1. **Handle replacement operations**: Add a case in `appendTransaction` where `oldEnd > oldStart && newEnd > newStart` (text was replaced). In this case:
   - Re-insert the old text with a deletion mark before the new text
   - Mark the new text with an insertion mark

2. **Preserve formatting on tracked deletions**: Instead of creating a flat `schema.text()` node, use `deletedSlice.content` and apply the deletion mark to each text node within it, preserving existing formatting marks.

3. **Fix accept/reject all position invalidation**: Process all changes in a single pass using the transaction's mapping to adjust positions, or sort ranges in reverse order and process deletions before mark removals.

4. **Improve merge window behavior**: Reduce the merge window to 5 seconds and reset it when the user pauses (no keystroke for > 1 second), making change grouping more intuitive.

---

## Issue 3: Code Cleanup -- Remove Redundancies

### Identified Redundant/Unused Files

Based on import analysis, the following files are never imported anywhere:

1. **`src/components/VersionHistoryDialog.tsx`** -- Proposal-level version history dialog. Only `SectionVersionHistoryDialog.tsx` is actually used (imported in `DocumentEditor.tsx`). The proposal-level dialog queries a `versions` table that stores proposal-wide snapshots, which is a separate feature from section versions. However, it is **never imported or rendered**.

2. **`src/components/CollaborationPanel.tsx`** -- This component is never imported. The collaboration panel UI (comments + track changes tabs) is implemented directly inline in `DocumentEditor.tsx` (lines 1178-1259). The separate component file is dead code.

3. **`src/components/GrammarChecker.tsx`** -- Never imported. A comment in DocumentEditor.tsx (line 1264) confirms: "GrammarChecker removed - now integrated into WritingAssistantDialog".

4. **`src/components/WordCountBadge.tsx`** -- Never imported anywhere.

5. **`src/hooks/useTrackedChanges.ts`** -- This hook is trivial (just `useState` + `useCallback`). It adds no value over inline state in DocumentEditor. It was originally designed for database persistence of track changes but was simplified to just UI state. It can be inlined.

### Inline Code Redundancy in DocumentEditor.tsx

The collaboration panel code in `DocumentEditor.tsx` (lines 1178-1259) duplicates the structure of `CollaborationPanel.tsx`. Since the inline version is the one actually used, the standalone component should be deleted.

### Fix Plan

1. **Delete unused files**:
   - `src/components/VersionHistoryDialog.tsx`
   - `src/components/CollaborationPanel.tsx`
   - `src/components/GrammarChecker.tsx`
   - `src/components/WordCountBadge.tsx`

2. **Inline `useTrackedChanges`**: Replace the hook import in `DocumentEditor.tsx` with direct `useState`/`useCallback` (3 lines of code), then delete `src/hooks/useTrackedChanges.ts`.

3. **No changes to actively used components**: All other components identified in the codebase are imported and used somewhere.

---

## Implementation Order

1. Fix `getAuthToken()` in `useSectionContent.ts` (critical, immediate impact)
2. Improve version saving reliability in `useSectionContent.ts`
3. Fix track changes replacement handling and formatting preservation in `TrackChanges.ts`
4. Fix accept/reject all position bugs in `TrackChanges.ts`
5. Delete unused files and inline `useTrackedChanges`

## Risks and Mitigations

- **Version history fix**: Existing content that was edited but never versioned will not retroactively get versions. After the fix, new edits will create versions going forward.
- **Track changes formatting preservation**: The `deletedSlice.content` approach needs careful handling of inline nodes vs text nodes. Will test with bold, italic, and mixed formatting.
- **Accept/reject all**: The reverse-order processing is a well-known pattern for position-safe ProseMirror mutations and is already partially used in the current code.
- **Deleting files**: Each file has been verified to have zero imports across the entire `src/` directory.

