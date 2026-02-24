

## Plan: Fix Track Changes Review Panel, Comment Delete, and Mention Bugs

### Issue 1: Track Changes Not Showing in Review Panel

**Problem**: When clicking the "Track Changes" tab in the collaboration panel, only the toggle switch and toolbar appear. The actual list of tracked changes is not displayed below it -- the panel content area is empty after the toolbar.

**Root Cause**: In `DocumentEditor.tsx` (lines 1262-1272), the "changes" tab renders `TrackChangesToolbar` inside a `div` with a bottom border, but there is no scrollable list of changes below it. The `TrackChangesToolbar` component does have a popover with changes, but it requires clicking a button to open it. The changes should be displayed inline in the panel, not hidden behind a popover.

**Fix**: Create an inline changes list that renders directly in the panel below the toolbar controls (toggle + accept/reject all buttons). Each change card will show the author, timestamp, type (insertion/deletion), content preview, and individual accept/reject buttons -- essentially the same content currently in the `TrackChangesToolbar` popover, but rendered directly in a scrollable area within the panel.

**Files to modify**:
- `src/components/DocumentEditor.tsx` -- Add a scrollable changes list below the `TrackChangesToolbar` in the "changes" tab

---

### Issue 2: Comment Delete Button Not Working

**Problem**: The delete button for comments does not work properly.

**Root Cause**: The RLS policies are correctly configured (owner or admin can delete). The likely issue is that when deleting a parent comment that has replies, the `deleteComment` function in `useSectionComments.ts` calls `.delete().eq('id', commentId)` which should cascade (the FK has `ON DELETE CASCADE`). However, the real-time subscription refetches after delete, and if the delete silently fails due to RLS, the UI won't update. The coordinator role check uses `is_proposal_admin` which checks for `coordinator`, `admin`, or `owner` roles.

**Investigation needed**: The delete itself should work for own comments. The issue is more likely that the `isCoordinator` check in `CommentsSidebar` only matches `roleTier === 'coordinator'`, but the RLS policy uses `is_proposal_admin` which also includes `admin` and `owner`. If the user's role is `owner` or `admin` but not `coordinator`, the delete button won't even appear in the UI even though the DB would allow it.

**Fix**:
- In `CommentsSidebar.tsx`, change the `isCoordinator` prop logic to include `admin` and `owner` roles too (i.e., check `roleTier === 'coordinator' || roleTier === 'admin' || roleTier === 'owner'`), or pass a broader `isAdmin` flag.
- Add error feedback: if `deleteComment` fails, the toast already shows but ensure the UI doesn't optimistically remove the comment.

**Files to modify**:
- `src/components/CommentsSidebar.tsx` -- Broaden the admin check from `roleTier === 'coordinator'` to include `admin` and `owner`

---

### Issue 3: Mention Tagging Cursor and Extra Characters

**Problem**: When selecting a user from the mention dropdown:
1. The cursor jumps to the beginning of the mention text instead of after it
2. Extra characters (the raw `@[Name](id)` markup) appear in the textarea, which disappear after submitting

**Root Cause**: In the `insertMention` function (lines 305-323 of `CommentsSidebar.tsx`):
- The cursor position used is from `textareaRef.current?.selectionStart` which may be stale after React re-renders the controlled textarea with the new value
- After `onChange(newValue)`, the cursor position is not explicitly set, so React's controlled input resets the cursor to position 0 or the start
- The raw `@[Name](id)` format is visible while typing because `renderContent` only applies in submitted comment display, not in the textarea

**Fix**:
- After inserting the mention text and calling `onChange(newValue)`, use `setTimeout` to set `selectionStart` and `selectionEnd` on the textarea to the position right after the inserted mention text
- This ensures the cursor lands after `@[Name](id) ` rather than jumping to the start
- The raw mention syntax showing in the textarea is expected behavior (it's a plain textarea, not a rich editor), but it's confusing. Consider displaying a cleaner `@Name ` in the textarea by using a display-only format and storing the ID mapping separately, OR accept the raw format and just fix the cursor position

**Recommended approach**: Fix the cursor positioning. The raw format in the textarea is a minor cosmetic issue that would require significant refactoring (custom contenteditable or a mention library) to solve properly.

**Files to modify**:
- `src/components/CommentsSidebar.tsx` -- Fix `insertMention` to set cursor position after the mention, for both the main comment and reply textareas

---

### Technical Details

#### Track Changes Panel (DocumentEditor.tsx, ~lines 1262-1272)

Replace the empty panel body with a scrollable list:

```text
+---------------------------------------------+
| [Toggle] Track Changes  [Accept All] [Reject All] |
+---------------------------------------------+
| ScrollArea with inline change cards:         |
|  [green] "inserted text" - Author, time     |
|       [Accept] [Reject]                      |
|  [red] "deleted text" - Author, time         |
|       [Accept] [Reject]                      |
|  ...                                         |
| "No tracked changes" (empty state)           |
+---------------------------------------------+
```

#### Comment Delete (CommentsSidebar.tsx, ~line 541)

Current:
```typescript
isCoordinator={roleTier === 'coordinator'}
```

Change to:
```typescript
isCoordinator={roleTier === 'coordinator' || roleTier === 'admin' || roleTier === 'owner'}
```

#### Mention Cursor Fix (CommentsSidebar.tsx, ~lines 305-323)

Current `insertMention`:
```typescript
const insertMention = (member: TeamMember) => {
  const cursorPos = textareaRef.current?.selectionStart || 0;
  // ... builds newValue ...
  onChange(newValue);
  setShowMentions(false);
  setTimeout(() => { textareaRef.current?.focus(); }, 0);
};
```

Fixed version adds cursor repositioning:
```typescript
const insertMention = (member: TeamMember) => {
  const cursorPos = textareaRef.current?.selectionStart || 0;
  const textBeforeCursor = value.slice(0, cursorPos);
  const atIndex = textBeforeCursor.lastIndexOf('@');
  const beforeMention = value.slice(0, atIndex);
  const afterCursor = value.slice(cursorPos);
  const mentionText = `@[${member.full_name}](${member.id})`;
  const newValue = beforeMention + mentionText + ' ' + afterCursor;
  const newCursorPos = atIndex + mentionText.length + 1; // +1 for space
  onChange(newValue);
  setShowMentions(false);
  setTimeout(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = newCursorPos;
      textareaRef.current.selectionEnd = newCursorPos;
    }
  }, 0);
};
```

---

### Summary of Changes

| File | Change |
|---|---|
| `DocumentEditor.tsx` | Add inline scrollable changes list in the "Track Changes" panel tab with per-change accept/reject buttons |
| `CommentsSidebar.tsx` | Broaden admin role check to include `owner` and `admin` alongside `coordinator` |
| `CommentsSidebar.tsx` | Fix `insertMention` to set cursor position after the mention text |
