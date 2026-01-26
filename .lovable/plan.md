
# Plan: Implement Block Drag-and-Drop in TipTap Editor

## Goal
Enable drag-and-drop reordering for all block-level content (paragraphs, figures, tables, lists) in the Part B editor, while:
- Keeping figures bundled with their captions
- Keeping tables bundled with their captions
- Respecting H1/H2 as immovable structural anchors
- Integrating with existing block locking system

---

## Proposed Approach: ProseMirror Plugin with Custom Drag Handle

Rather than relying on TipTap's node-level `draggable` property (which conflicts with ReactNodeViewRenderer), we'll implement a **ProseMirror plugin** that:
1. Renders a floating drag handle on block hover
2. Manually initiates ProseMirror-aware drag operations
3. Handles the drop using the existing `findBlockRange` logic

This approach works **with** ProseMirror rather than against it, and reuses the proven block-bundling logic from keyboard reordering.

---

## Implementation Steps

### Phase 1: Create Block Drag Extension

Create a new TipTap extension `BlockDragHandle` that:

1. **Adds a ProseMirror Plugin** with:
   - `decorations`: Shows a drag handle on the left side of the currently hovered block
   - `handleDOMEvents`: Captures `dragstart`, `dragover`, and `drop` events
   - `props.handleDrop`: Intercepts drops and uses existing block logic to move content

2. **Reuses existing logic** from `BlockReordering.ts`:
   - `findBlockRange()` - identifies blocks with their captions
   - `isReorderableBlock()` - prevents moving H1/H2

### Phase 2: Add Visual Feedback

1. **Drag Handle Styling**:
   - Floating handle appears on block hover (left gutter)
   - Uses `cursor-grab` / `cursor-grabbing`
   - Hides when over H1/H2 (non-reorderable)

2. **Drop Zone Indicators**:
   - Blue line appears between blocks to show insertion point
   - Invalid drop zones (before H1) show disabled state

3. **Drag Ghost**:
   - Semi-transparent preview of the block being dragged

### Phase 3: Remove Conflicting Code

1. **ResizableImage.tsx**:
   - Remove the non-functional drag handle div
   - Remove `data-drag-handle` attribute
   - The new global drag handle will work for all blocks including images

2. **CSS Cleanup**:
   - Add proper `.block-drag-handle` styles
   - Add `.drop-indicator` styles

### Phase 4: Integration

1. **Register Extension** in `RichTextEditor.tsx`:
   - Add `BlockDragHandle` to the extensions array
   - Ensure it loads after `BlockReordering` (keyboard still works)

2. **Block Locking Integration**:
   - Check locked blocks before allowing drop
   - Prevent dragging locked content

---

## Technical Details

### New Extension Structure

```text
src/extensions/BlockDragHandle.ts
├── Extension.create()
│   ├── addProseMirrorPlugins()
│   │   └── DragHandlePlugin
│   │       ├── state: { hoveredBlockPos, isDragging, draggedSlice }
│   │       ├── view: { update(), destroy() }
│   │       └── props: { decorations(), handleDOMEvents, handleDrop() }
│   └── addGlobalAttributes() - optional for marking draggable blocks
└── Reuse: findBlockRange(), isReorderableBlock()
```

### Drop Handling Logic (Pseudocode)

```text
handleDrop(view, event, slice, moved):
  1. If moved === false, return false (external drop, use default)
  2. Get drop position from event coordinates
  3. Resolve drop position to a block boundary
  4. Check if target is reorderable (not H1/H2)
  5. Get source block range using findBlockRange()
  6. Create transaction:
     - Delete source slice
     - Insert at drop position (adjusted for deletion)
  7. Dispatch transaction
  8. Trigger caption renumbering
```

### CSS for Drag Handle & Drop Indicator

```text
.block-drag-handle:
  - position: absolute, left: -24px
  - width: 18px, height: 18px
  - opacity: 0 → 1 on parent hover
  - cursor: grab / grabbing

.drop-indicator:
  - height: 2px, background: primary color
  - position between blocks
  - animate: pulse on valid drop

.dragging-block:
  - opacity: 0.5
  - box-shadow: elevated
```

---

## Alternative Considered: @dnd-kit

Using `@dnd-kit` (already in the project) was considered but rejected because:
- It requires wrapping each block in a `useSortable` hook
- Breaks TipTap's content model which expects a single contenteditable container
- Would require extracting blocks from the editor, managing them externally, and re-serializing—extremely complex and error-prone

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/extensions/BlockDragHandle.ts` | **NEW** - Main drag-and-drop extension |
| `src/extensions/BlockReordering.ts` | Export `findBlockRange` and `isReorderableBlock` for reuse |
| `src/components/RichTextEditor.tsx` | Register `BlockDragHandle` extension |
| `src/components/ResizableImage.tsx` | Remove non-functional drag handle UI |
| `src/index.css` | Add drag handle and drop indicator styles |

---

## Success Criteria

1. Hovering any block shows a drag handle in the left gutter
2. Dragging a block shows visual feedback (opacity, cursor)
3. Dropping shows a blue insertion line at valid positions
4. Figures move with their captions
5. Tables move with their captions
6. H1/H2 blocks cannot be moved or reordered past
7. Caption renumbering triggers after drag operations
8. Block locking prevents dragging locked content
