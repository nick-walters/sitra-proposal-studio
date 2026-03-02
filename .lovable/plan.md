

## Plan: Fix tooltip dot + remaining issues

### Issue analysis

The tooltip dot reads `data-author-color` from the DOM element (line 161), which stores whatever color was assigned at mark creation time -- this is the old hash-based color, not the proposal-scoped color. The tooltip component has no access to `proposalId` or the `useProposalUserColors` hook, so it can never show the correct color. Additionally, the dot is inside a tightly packed `text-[10px]` span with no breathing room.

### Changes

**1. `TrackChangeTooltip.tsx` -- use proposal-scoped colors**
- Add `proposalId` to props
- Import and call `useProposalUserColors(proposalId)`
- Store `authorId` in the tooltip state (read from `data-author-id` DOM attribute)
- Use `getUserColor(authorId)` for the dot color instead of reading `data-author-color`
- Add a small `gap-1.5` and slight padding so the dot has visual space

**2. `DocumentEditor.tsx` -- pass proposalId to tooltip**
- Pass `proposalId` prop to `<TrackChangeTooltip>` where it's rendered

**3. Remaining issues from previous plan (still pending)**
- **Strikethrough after toggle off**: In `TrackChanges.ts`, clear stored marks containing `trackDeletion`/`trackInsertion` when tracking is toggled off
- **Smaller badges/buttons**: Reduce badge and button sizes in review panel cards (`DocumentEditor.tsx`) and toolbar popover cards (`TrackChangesToolbar.tsx`) to prevent timestamp wrapping
- **Avatar photos in cards**: Expand `useProposalUserColors` to also return `getUserAvatar(userId)` and `getUserName(userId)`, use `AvatarImage` with actual photo URLs in comment and track change cards
- **Show change counts when tracking off**: Move counts + popover outside the `enabled` conditional in `TrackChangesToolbar.tsx`
- **Remove Link2 icon**: Remove from `CommentsSidebar.tsx` line 139

### Files
- `src/components/TrackChangeTooltip.tsx`
- `src/components/DocumentEditor.tsx`
- `src/extensions/TrackChanges.ts`
- `src/hooks/useProposalUserColors.ts`
- `src/components/TrackChangesToolbar.tsx`
- `src/components/CommentsSidebar.tsx`

