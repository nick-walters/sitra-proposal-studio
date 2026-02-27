

## Track Change Tooltips -- Alternative Solution Plan

### Root Cause Analysis

The current hover-based tooltip approach has multiple fragile points:
1. **DOM event race conditions** -- `mouseover`/`mouseout` on document level must correctly match `data-track-insertion`/`data-track-deletion` spans, but TipTap re-renders the DOM frequently, causing elements to appear/disappear under the cursor without firing proper mouse events
2. **containerRef null guard** -- even with the fallback to `.tiptap`/`.ProseMirror`, the ref can be stale after section switches
3. **Fixed positioning drift** -- `getBoundingClientRect()` is captured at hover time but the editor scrolls, causing the tooltip to float in the wrong place
4. **Text node normalization** -- multiple layers of `parentElement` traversal are brittle when TipTap nests marks

### Proposed Alternative: TipTap BubbleMenu

Replace the custom hover tooltip with a **TipTap `BubbleMenu`** that appears when the cursor/selection is inside a tracked change mark. This is the idiomatic TipTap approach and eliminates all DOM event listener issues.

### Implementation Steps

1. **Replace `TrackChangeTooltip` with a `TrackChangeBubbleMenu` component**
   - Use `BubbleMenu` from `@tiptap/react` (already installed)
   - Configure `shouldShow` to return `true` when the current selection has a `trackInsertion` or `trackDeletion` mark
   - Display the same UI: author name, type, timestamp, accept/reject buttons
   - `BubbleMenu` handles positioning, scroll tracking, and lifecycle automatically

2. **Add click-to-show behavior**
   - TipTap's BubbleMenu shows on selection by default; configure `tippyOptions` to also show on click (single cursor position) by checking marks at the resolved position
   - Use `shouldShow({ editor })` to inspect `editor.isActive('trackInsertion') || editor.isActive('trackDeletion')`

3. **Update `DocumentEditor.tsx`**
   - Remove `<TrackChangeTooltip>` import and usage
   - Add `<TrackChangeBubbleMenu editor={editor} />` alongside the `EditorContent`

4. **Extract change metadata from editor state**
   - In `shouldShow`, read the active mark's attributes (`changeId`, `authorName`, `timestamp`, etc.) directly from `editor.state` rather than querying the DOM
   - This eliminates all DOM attribute lookup issues

### Key Code Sketch

```tsx
import { BubbleMenu } from '@tiptap/react';

function TrackChangeBubbleMenu({ editor }) {
  const shouldShow = ({ editor }) => {
    return editor.isActive('trackInsertion') || editor.isActive('trackDeletion');
  };

  // Read mark attrs from current selection
  const mark = editor.state.selection.$from.marks()
    .find(m => m.type.name === 'trackInsertion' || m.type.name === 'trackDeletion');

  return (
    <BubbleMenu editor={editor} shouldShow={shouldShow} tippyOptions={{ placement: 'top' }}>
      {/* author · type · timestamp · accept/reject buttons */}
    </BubbleMenu>
  );
}
```

### Benefits
- No manual DOM event listeners, no `containerRef` dependency
- Positioning handled by Tippy.js (scroll-aware, flip-aware)
- Works immediately on cursor placement -- no hover required
- Survives editor re-renders and section switches

