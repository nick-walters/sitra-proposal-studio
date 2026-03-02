

## Plan: Consistent User Colour Dots + Style Alignment

### What changes

**1. New hook: `src/hooks/useProposalUserColors.ts`**
- Fetches `user_roles` for the proposal ordered by `created_at ASC`
- Assigns each unique `user_id` a stable index into the `COLLABORATOR_COLORS` palette
- Returns `getUserColor(userId): string` — deterministic, identical for all viewers
- Cached via `useMemo` on the fetched data

**2. Review panel cards in `DocumentEditor.tsx` (lines ~1643-1726)**
- Change card style from green/red backgrounds to **white background with blue border on hover** (matching comment cards: `border rounded-lg p-3`, `hover:border-primary hover:shadow-sm`)
- Keep the coloured dot but source its colour from the new `useProposalUserColors` hook instead of `change.authorColor`
- Move timestamp below the user name (same layout as comment cards: name on first line, timestamp on second line in `text-xs text-muted-foreground`)
- Change "Added" label to "Inserted"
- Keep "Deleted" as-is

**3. Toolbar popover cards in `TrackChangesToolbar.tsx` (lines ~261-330)**
- Same style changes: white background, blue hover border, consistent dot colour from proposal-scoped hook
- Change "Added" to "Inserted"
- Pass `proposalId` as a new prop and use `useProposalUserColors` inside

**4. Tooltip in `TrackChangeTooltip.tsx` (line ~153)**
- Add a coloured dot before the author name, using colour from `data-author-color` attribute (already on DOM)
- Change "inserted" label — already says "inserted", keep as-is
- Change "deleted" — already says "deleted", keep as-is

**5. Comment cards in `CommentsSidebar.tsx` (lines ~115-128)**
- Add a coloured dot next to the user's name/avatar, sourced from `useProposalUserColors`
- Pass `proposalId` (already available) into the hook

**6. Wire proposal-scoped colours into `DocumentEditor.tsx` for `authorColor`**
- Replace `getColorForUser(user.id)` (hash-based) with `getUserColor(user.id)` from the new hook
- This ensures the `authorColor` stored in marks is proposal-stable

### What stays the same
- Green/red highlights in the editor for insertions/deletions
- Jump-to-position on click in review panel
- Accept/reject buttons on cards and tooltips
- Multi-select in toolbar popover

### Files
- **New**: `src/hooks/useProposalUserColors.ts`
- **Edit**: `src/components/DocumentEditor.tsx`
- **Edit**: `src/components/TrackChangesToolbar.tsx`
- **Edit**: `src/components/TrackChangeTooltip.tsx`
- **Edit**: `src/components/CommentsSidebar.tsx`

