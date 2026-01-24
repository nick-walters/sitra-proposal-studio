import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';

const DRAGGABLE_BLOCK_KEY = new PluginKey('draggableBlock');

interface DraggableBlockState {
  draggedNodePos: number | null;
  dropTargetPos: number | null;
  isDragging: boolean;
}

/**
 * Creates a TipTap extension that enables drag-and-drop reordering for
 * figures (images with captions) and tables (with their captions).
 * When a block is dropped, captions are automatically moved with their
 * associated content and renumbered based on new positions.
 */
export const DraggableBlock = Extension.create({
  name: 'draggableBlock',

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: DRAGGABLE_BLOCK_KEY,
        state: {
          init(): DraggableBlockState {
            return { draggedNodePos: null, dropTargetPos: null, isDragging: false };
          },
          apply(tr, state): DraggableBlockState {
            const meta = tr.getMeta(DRAGGABLE_BLOCK_KEY);
            if (meta) {
              return { ...state, ...meta };
            }
            return state;
          },
        },
        props: {
          decorations(state) {
            const { doc } = state;
            const decorations: Decoration[] = [];

            // Add drag handles to images and tables
            doc.descendants((node, pos) => {
              if (node.type.name === 'table') {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: 'draggable-table-node',
                  })
                );
              }
            });

            // Add drop indicator if dragging
            const pluginState = DRAGGABLE_BLOCK_KEY.getState(state);
            if (pluginState?.dropTargetPos !== null && pluginState?.isDragging) {
              const dropPos = pluginState.dropTargetPos;
              const draggedPos = pluginState.draggedNodePos;
              
              // Don't show indicator at the dragged element's position
              if (draggedPos !== null && dropPos !== draggedPos) {
                if (dropPos >= 0 && dropPos <= doc.content.size) {
                  // Create a widget decoration as a drop line indicator
                  decorations.push(
                    Decoration.widget(dropPos, () => {
                      const indicator = document.createElement('div');
                      indicator.className = 'drop-position-indicator';
                      return indicator;
                    }, { side: -1 })
                  );
                }
              }
            }

            return DecorationSet.create(doc, decorations);
          },
          handleDOMEvents: {
            dragstart(view, event) {
              const target = event.target as HTMLElement;
              const dragHandle = target.closest('.drag-handle');
              if (!dragHandle) return false;

              const block = dragHandle.closest('.draggable-block, .draggable-table-node');
              if (!block) return false;

              const pos = view.posAtDOM(block, 0);
              if (pos === undefined || pos < 0) return false;

              // Find the block range to move
              const blockRange = findBlockWithCaption(view.state.doc, pos);
              if (!blockRange) return false;

              // Set dragging state
              view.dispatch(
                view.state.tr.setMeta(DRAGGABLE_BLOCK_KEY, { 
                  draggedNodePos: blockRange.startPos, 
                  isDragging: true 
                })
              );

              // Set drag data with block range info
              event.dataTransfer?.setData('application/json', JSON.stringify({
                startPos: blockRange.startPos,
                endPos: blockRange.endPos,
              }));
              event.dataTransfer!.effectAllowed = 'move';

              // Add visual feedback
              if (block instanceof HTMLElement) {
                block.style.opacity = '0.5';
              }

              return false;
            },
            dragover(view, event) {
              event.preventDefault();
              event.dataTransfer!.dropEffect = 'move';

              const coords = { left: event.clientX, top: event.clientY };
              const pos = view.posAtCoords(coords);
              if (!pos) return false;

              // Find block-level position
              const $pos = view.state.doc.resolve(pos.pos);
              let blockPos = pos.pos;
              
              // Find the nearest block boundary
              if ($pos.depth > 0) {
                blockPos = $pos.before($pos.depth);
              }

              const pluginState = DRAGGABLE_BLOCK_KEY.getState(view.state);
              if (pluginState?.dropTargetPos !== blockPos) {
                view.dispatch(
                  view.state.tr.setMeta(DRAGGABLE_BLOCK_KEY, { dropTargetPos: blockPos })
                );
              }

              return false;
            },
            dragleave(view, event) {
              const relatedTarget = event.relatedTarget as HTMLElement | null;
              if (!relatedTarget || !view.dom.contains(relatedTarget)) {
                view.dispatch(
                  view.state.tr.setMeta(DRAGGABLE_BLOCK_KEY, { dropTargetPos: null })
                );
              }
              return false;
            },
            drop(view, event) {
              event.preventDefault();
              
              const dataStr = event.dataTransfer?.getData('application/json');
              if (!dataStr) return false;

              let dragData: { startPos: number; endPos: number };
              try {
                dragData = JSON.parse(dataStr);
              } catch {
                return false;
              }

              const pluginState = DRAGGABLE_BLOCK_KEY.getState(view.state);
              const dropPos = pluginState?.dropTargetPos;

              if (dropPos === undefined || dropPos === null) {
                return false;
              }

              const { startPos, endPos } = dragData;

              // Prevent dropping onto self
              if (dropPos >= startPos && dropPos <= endPos) {
                view.dispatch(
                  view.state.tr.setMeta(DRAGGABLE_BLOCK_KEY, { 
                    draggedNodePos: null, 
                    dropTargetPos: null, 
                    isDragging: false 
                  })
                );
                return false;
              }

              const { doc, tr } = view.state;

              // Get the content to move
              const slice = doc.slice(startPos, endPos);
              
              // Calculate where to insert after deletion
              let insertPos = dropPos;
              if (dropPos > endPos) {
                // Dropping after the original position
                insertPos = dropPos - (endPos - startPos);
              }

              // Delete original content
              tr.delete(startPos, endPos);
              
              // Map the insert position through the deletion
              const mappedPos = tr.mapping.map(insertPos < startPos ? insertPos : dropPos);
              
              // Insert at new position
              tr.insert(mappedPos, slice.content);

              // Clear drag state
              tr.setMeta(DRAGGABLE_BLOCK_KEY, { 
                draggedNodePos: null, 
                dropTargetPos: null, 
                isDragging: false 
              });

              view.dispatch(tr);

              // Trigger content update which will renumber captions
              setTimeout(() => {
                editor.commands.focus();
              }, 10);

              return true;
            },
            dragend(view, event) {
              // Reset opacity on any elements
              const dragging = view.dom.querySelectorAll('[style*="opacity"]');
              dragging.forEach((el) => {
                if (el instanceof HTMLElement) {
                  el.style.opacity = '';
                }
              });

              view.dispatch(
                view.state.tr.setMeta(DRAGGABLE_BLOCK_KEY, { 
                  draggedNodePos: null, 
                  dropTargetPos: null, 
                  isDragging: false 
                })
              );
              return false;
            },
          },
        },
      }),
    ];
  },
});

/**
 * Finds a block element (figure or table) along with its associated caption.
 * Returns the position range that should be moved together.
 */
function findBlockWithCaption(
  doc: ProseMirrorNode,
  pos: number
): { startPos: number; endPos: number } | null {
  if (pos < 0 || pos >= doc.content.size) return null;
  
  const $pos = doc.resolve(pos);
  const node = $pos.nodeAfter;
  if (!node) return null;

  // Check if this is an image (figure)
  if (node.type.name === 'image') {
    let startPos = pos;
    let endPos = pos + node.nodeSize;

    // Look for caption after the image (figure caption)
    const afterPos = pos + node.nodeSize;
    if (afterPos < doc.content.size) {
      const $afterPos = doc.resolve(afterPos);
      const afterNode = $afterPos.nodeAfter;
      if (afterNode && afterNode.type.name === 'paragraph') {
        const textContent = afterNode.textContent.toLowerCase();
        if (textContent.startsWith('figure ') || afterNode.attrs?.class?.includes('figure-caption')) {
          endPos = afterPos + afterNode.nodeSize;
        }
      }
    }

    return { startPos, endPos };
  }

  // Check if this is a table
  if (node.type.name === 'table') {
    let startPos = pos;
    let endPos = pos + node.nodeSize;

    // Look for caption before the table (table caption)
    if (pos > 0) {
      const beforePos = pos - 1;
      const $beforePos = doc.resolve(beforePos);
      const beforeNode = $beforePos.nodeBefore;
      
      if (beforeNode && beforeNode.type.name === 'paragraph') {
        const textContent = beforeNode.textContent.toLowerCase();
        if (textContent.startsWith('table ') || beforeNode.attrs?.class?.includes('table-caption')) {
          startPos = pos - beforeNode.nodeSize;
        }
      }
    }

    return { startPos, endPos };
  }

  // Check if this is a caption paragraph
  if (node.type.name === 'paragraph') {
    const textContent = node.textContent.toLowerCase();
    const hasClass = node.attrs?.class || '';
    
    // Figure caption - look for image before it
    if (textContent.startsWith('figure ') || hasClass.includes('figure-caption')) {
      const captionEnd = pos + node.nodeSize;
      
      // Look for image before caption
      if (pos > 0) {
        const beforePos = pos - 1;
        const $beforePos = doc.resolve(beforePos);
        const beforeNode = $beforePos.nodeBefore;
        
        if (beforeNode && beforeNode.type.name === 'image') {
          return {
            startPos: pos - beforeNode.nodeSize,
            endPos: captionEnd,
          };
        }
      }
      
      return { startPos: pos, endPos: captionEnd };
    }
    
    // Table caption - look for table after it
    if (textContent.startsWith('table ') || hasClass.includes('table-caption')) {
      const captionStart = pos;
      
      // Look for table after caption
      const afterPos = pos + node.nodeSize;
      if (afterPos < doc.content.size) {
        const $afterPos = doc.resolve(afterPos);
        const afterNode = $afterPos.nodeAfter;
        
        if (afterNode && afterNode.type.name === 'table') {
          return {
            startPos: captionStart,
            endPos: afterPos + afterNode.nodeSize,
          };
        }
      }
      
      return { startPos: captionStart, endPos: pos + node.nodeSize };
    }
  }

  return null;
}

/**
 * Checks if a node is a draggable block (image, table, or their captions)
 */
export function isDraggableBlock(node: ProseMirrorNode): boolean {
  if (node.type.name === 'image' || node.type.name === 'table') {
    return true;
  }
  
  if (node.type.name === 'paragraph') {
    const text = node.textContent.toLowerCase();
    const hasClass = node.attrs?.class || '';
    return text.startsWith('figure ') || text.startsWith('table ') || 
           hasClass.includes('figure-caption') || hasClass.includes('table-caption');
  }
  
  return false;
}
