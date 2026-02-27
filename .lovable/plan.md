

## Plan: Fix Track Changes, Tooltip, Comments, and B3.1 Commenting

### 1. Author name persists as "Anonymous" after refresh

**Root cause**: `DocumentEditor.tsx` line 312 uses `user?.user_metadata?.full_name`, but after refresh the cached user from `sessionStorage` only has `{ id, email }` — no `user_metadata`. So the author name falls back to email prefix or "Anonymous".

**Fix**: Query the `profiles` table for the current user's `full_name` and use that as the authorName. Add a `useQuery` or `useEffect` that fetches the profile once on mount, then use that name in the track changes config.

**File**: `src/components/DocumentEditor.tsx`
- Add a query: `supabase.from('profiles').select('full_name').eq('id', user.id).single()`
- Use the profile's `full_name` as the primary source, falling back to `user_metadata`, then email prefix

### 2. Changes merge across tracking gaps

**Root cause**: `toggleTrackChanges` (line 206) doesn't reset the merge window state. When tracking is toggled off then on, `lastInsertionId` persists and new changes merge with old ones.

**Fix**: Reset merge state in `toggleTrackChanges` command.

**File**: `src/extensions/TrackChanges.ts` (line ~206)
```typescript
this.storage.lastInsertionId = null;
this.storage.lastInsertionTime = 0;
```

### 3. Review panel change cards overflow

**Root cause**: The change cards in the review panel (lines 1290-1346) don't constrain content width. Long author names or content text can overflow the fixed `w-80` panel.

**Fix**: Add `min-w-0 overflow-hidden` to the card container and ensure the header row uses `min-w-0` with truncation.

**File**: `src/components/DocumentEditor.tsx` (lines ~1291-1346)
- Add `min-w-0 overflow-hidden` to the outer card div
- Add `min-w-0` and `overflow-hidden` to the flex row containing author name and badge
- Add `max-w-[120px]` to the author name span

### 4. Track change hover tooltip not appearing

**Root cause**: The tooltip is rendered as `absolute` inside `editorContainerRef`, but the parent wrapper at line 1082 has `overflow-hidden`. When the tooltip positions itself above the first line of text (negative `top` value relative to container), it gets clipped by the parent's overflow.

**Fix**: Two changes:
1. Change the tooltip to use `fixed` positioning (viewport-relative) instead of `absolute`, using `getBoundingClientRect()` directly without subtracting the container rect
2. This eliminates clipping by any parent overflow

**File**: `src/components/TrackChangeTooltip.tsx`
- Change position calculation to use `rect` directly (viewport coords)
- Change CSS from `absolute` to `fixed`
- Add `pointer-events: auto` to ensure hover interaction works

### 5. Comments not ordered by document position

**Root cause**: `CommentsSidebar.tsx` line 369 filters comments but doesn't sort them. They appear in creation order, not document order.

**Fix**: Sort `filteredComments` by `selection_start` position, with nulls last.

**File**: `src/components/CommentsSidebar.tsx` (line ~369)
```typescript
const filteredComments = comments
  .filter(c => activeTab === 'resolved' ? c.status === 'resolved' : c.status === 'open')
  .sort((a, b) => {
    const aPos = a.selection_start ?? Infinity;
    const bPos = b.selection_start ?? Infinity;
    if (aPos !== bPos) return aPos - bPos;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
```

### 6. Cannot comment on B3.1 task titles, participants, duration

**Root cause**: These elements are outside the Tiptap editor, so the editor-based selection/commenting mechanism doesn't apply.

**Fix**: Add `data-commentable` attributes to task title, participant, and duration elements in `B31WPDescriptionTables.tsx`. Add a `mouseup` listener in `DocumentEditor.tsx` on the B3.1 container that checks `window.getSelection()` for text within `[data-commentable]` elements, and pipes the selected text + a synthetic position identifier into the existing `selectedText`/`selectionRange` state used by `CommentsSidebar`.

**Files**:
- `src/components/B31WPDescriptionTables.tsx` — add `data-commentable="task-title"` etc. to task title, leader, and duration elements
- `src/components/DocumentEditor.tsx` — add mouseup handler on the B3.1 section area that detects selection in commentable elements and sets `selectedText`/`selectionRange`

---

### Summary

| # | File | Change |
|---|------|--------|
| 1 | `DocumentEditor.tsx` | Fetch profile `full_name` for track changes author |
| 2 | `TrackChanges.ts` | Reset merge state on toggle |
| 3 | `DocumentEditor.tsx` | Fix overflow on review panel cards |
| 4 | `TrackChangeTooltip.tsx` | Use fixed positioning to avoid parent clipping |
| 5 | `CommentsSidebar.tsx` | Sort comments by document position |
| 6 | `B31WPDescriptionTables.tsx` + `DocumentEditor.tsx` | Enable commenting on B3.1 task fields |

6 changes across 4 files.

