

# Fix Track Changes: Individual Accept/Reject and Anonymous Author

## Problems Identified

### 1. Author shows as "Anonymous"
The `authorId`, `authorName`, and `authorColor` are only set once during editor initialization via `TrackChanges.configure(...)` in the `useEditor` hook. The `useEffect` that syncs track changes state (line 1113-1128 of `RichTextEditor.tsx`) only syncs `enabled` and `onChangesUpdate` -- it never updates `authorId`, `authorName`, or `authorColor` on the extension options.

So if the user data hasn't fully loaded when the editor first mounts, the defaults (`'Anonymous'`, `''`, `'#3B82F6'`) are baked into the extension and every mark it creates uses those values permanently.

### 2. Individual accept/reject doesn't work
The `acceptChange` and `rejectChange` commands read `authorId`/`authorName`/`authorColor` from `extension.options`, which are stale for the same reason above. But more critically, the commands themselves appear structurally correct. The likely root cause is that the extension options (including `authorId`, `authorName`, `authorColor`) are stale references, meaning the `appendTransaction` plugin is also reading stale values. This doesn't directly explain the individual failure, but there could be a secondary issue where the tooltip click causes the editor to blur or the command fails silently.

To fix this robustly, I'll add `onMouseDown={e => e.preventDefault()}` on tooltip buttons to prevent focus steal, and add diagnostic logging.

## Changes

### File: `src/components/RichTextEditor.tsx`

**Sync all track change author options, not just `enabled`:**

Update the existing `useEffect` (lines 1113-1128) to also sync `authorId`, `authorName`, and `authorColor` on both `ext.options` and `ext.storage` whenever they change. This ensures the `appendTransaction` plugin always reads the current user's identity.

Add `trackChanges?.authorId`, `trackChanges?.authorName`, `trackChanges?.authorColor` to the dependency array.

### File: `src/components/TrackChangeTooltip.tsx`

**Prevent focus stealing and improve reliability:**

- Add `onMouseDown={e => e.preventDefault()}` to both accept/reject buttons so clicking them doesn't cause the editor to lose focus or trigger unwanted ProseMirror transactions.
- Read `authorName` directly from the DOM element's `data-author-name` attribute as a fallback, since the storage `changes` array might not always be in sync with the DOM.

### File: `src/components/DocumentEditor.tsx`

**No changes needed** -- it already passes the correct user metadata. The issue is downstream in `RichTextEditor.tsx` not syncing those values after initialization.

## Technical Details

The core fix is in `RichTextEditor.tsx`:

```typescript
useEffect(() => {
  if (!editor) return;
  trackChangesRef.current = trackChanges;
  const storage = (editor.storage as any).trackChanges;
  if (storage && storage.enabled !== trackChanges?.enabled) {
    storage.enabled = trackChanges?.enabled || false;
    editor.view.dispatch(editor.state.tr);
  }
  const ext = editor.extensionManager.extensions.find(e => e.name === 'trackChanges');
  if (ext) {
    ext.options.onChangesUpdate = trackChanges?.onChangesUpdate;
    ext.options.authorId = trackChanges?.authorId || '';
    ext.options.authorName = trackChanges?.authorName || 'Anonymous';
    ext.options.authorColor = trackChanges?.authorColor || '#3B82F6';
  }
}, [editor, trackChanges?.enabled, trackChanges?.onChangesUpdate,
    trackChanges?.authorId, trackChanges?.authorName, trackChanges?.authorColor]);
```

And in `TrackChangeTooltip.tsx`, adding `onMouseDown` prevention and reading author from DOM:

```typescript
// Read authorName from DOM attribute as primary source
let authorName = el.getAttribute('data-author-name') || 'Unknown';
```

