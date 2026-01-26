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
 * all block-level content (paragraphs, figures, tables, lists, etc.)
 * EXCEPT H1 and H2 headings which are locked/uneditable.
 * Drag handles appear in the left margin for proper accessibility.
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
            mousedown(view, event) {
              const target = event.target as HTMLElement;
              const dragHandle = target.closest('.block-drag-handle');
              if (!dragHandle) return false;

              // Prevent text selection when clicking drag handle
              event.preventDefault();
              
              // Find the parent block element (the one with the drag handle)
              const block = dragHandle.parentElement;
              if (!block) return false;

              const pos = view.posAtDOM(block, 0);
              if (pos === undefined || pos < 0) return false;

              // Find the block range to move
              const blockRange = findBlockRange(view.state.doc, pos);
              if (!blockRange) return false;

              // Set up drag data on the element
              block.setAttribute('draggable', 'true');
              block.classList.add('draggable-content-block');
              (block as any).__dragData = {
                startPos: blockRange.startPos,
                endPos: blockRange.endPos,
              };

              return false;
            },
            dragstart(view, event) {
              const target = event.target as HTMLElement;
              // Find block that has drag data
              let block = target;
              while (block && !(block as any).__dragData) {
                block = block.parentElement as HTMLElement;
              }
              if (!block) return false;

              const dragData = (block as any).__dragData;
              if (!dragData) return false;

              // Set dragging state
              view.dispatch(
                view.state.tr.setMeta(DRAGGABLE_BLOCK_KEY, { 
                  draggedNodePos: dragData.startPos, 
                  isDragging: true 
                })
              );

              // Set drag data
              event.dataTransfer?.setData('application/json', JSON.stringify(dragData));
              event.dataTransfer!.effectAllowed = 'move';

              // Add visual feedback
              block.style.opacity = '0.5';

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
              // Reset opacity, draggable, and class on any elements
              const dragging = view.dom.querySelectorAll('[style*="opacity"], [draggable="true"], .draggable-content-block');
              dragging.forEach((el) => {
                if (el instanceof HTMLElement) {
                  el.style.opacity = '';
                  el.removeAttribute('draggable');
                  el.classList.remove('draggable-content-block');
                  delete (el as any).__dragData;
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
        view(editorView) {
          // Add drag handles to the DOM
          const updateDragHandles = () => {
            const existingHandles = editorView.dom.querySelectorAll('.block-drag-handle');
            existingHandles.forEach(el => el.remove());

            editorView.state.doc.descendants((node, pos) => {
              // Skip child nodes
              const $pos = editorView.state.doc.resolve(pos);
              if ($pos.depth > 1) return false;

              if (isDraggableBlock(node)) {
                try {
                  const domNode = editorView.nodeDOM(pos);
                  if (domNode && domNode instanceof HTMLElement) {
                    // Check if handle already exists
                    if (!domNode.querySelector('.block-drag-handle')) {
                      const handle = document.createElement('div');
                      handle.className = 'block-drag-handle';
                      handle.innerHTML = `
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                          <circle cx="9" cy="6" r="1.5"/>
                          <circle cx="15" cy="6" r="1.5"/>
                          <circle cx="9" cy="12" r="1.5"/>
                          <circle cx="15" cy="12" r="1.5"/>
                          <circle cx="9" cy="18" r="1.5"/>
                          <circle cx="15" cy="18" r="1.5"/>
                        </svg>
                      `;
                      handle.setAttribute('draggable', 'true');
                      domNode.style.position = 'relative';
                      domNode.insertBefore(handle, domNode.firstChild);
                    }
                  }
                } catch (e) {
                  // Node might not be rendered yet
                }
              }
            });
          };

          // Initial update
          setTimeout(updateDragHandles, 100);

          return {
            update(view, prevState) {
              if (!view.state.doc.eq(prevState.doc)) {
                setTimeout(updateDragHandles, 50);
              }
            },
            destroy() {
              const handles = editorView.dom.querySelectorAll('.block-drag-handle');
              handles.forEach(el => el.remove());
            },
          };
        },
      }),
    ];
  },
});

/**
 * Finds the range of a block element, including associated captions for figures/tables.
 */
function findBlockRange(
  doc: ProseMirrorNode,
  pos: number
): { startPos: number; endPos: number } | null {
  if (pos < 0 || pos >= doc.content.size) return null;
  
  const $pos = doc.resolve(pos);
  const node = $pos.nodeAfter;
  if (!node) return null;

  let startPos = pos;
  let endPos = pos + node.nodeSize;

  // For images, include caption after
  if (node.type.name === 'image') {
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

  // For tables, include caption before
  if (node.type.name === 'table') {
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

  // For caption paragraphs, include associated content
  if (node.type.name === 'paragraph') {
    const textContent = node.textContent.toLowerCase();
    const hasClass = node.attrs?.class || '';
    
    // Figure caption - look for image before it
    if (textContent.startsWith('figure ') || hasClass.includes('figure-caption')) {
      if (pos > 0) {
        const beforePos = pos - 1;
        const $beforePos = doc.resolve(beforePos);
        const beforeNode = $beforePos.nodeBefore;
        
        if (beforeNode && beforeNode.type.name === 'image') {
          return {
            startPos: pos - beforeNode.nodeSize,
            endPos: pos + node.nodeSize,
          };
        }
      }
    }
    
    // Table caption - look for table after it
    if (textContent.startsWith('table ') || hasClass.includes('table-caption')) {
      const afterPos = pos + node.nodeSize;
      if (afterPos < doc.content.size) {
        const $afterPos = doc.resolve(afterPos);
        const afterNode = $afterPos.nodeAfter;
        
        if (afterNode && afterNode.type.name === 'table') {
          return {
            startPos: pos,
            endPos: afterPos + afterNode.nodeSize,
          };
        }
      }
    }
  }

  return { startPos, endPos };
}

/**
 * Checks if a node is a draggable block.
 * All blocks are draggable EXCEPT H1 and H2 headings.
 */
export function isDraggableBlock(node: ProseMirrorNode): boolean {
  // H1 and H2 are locked - not draggable
  if (node.type.name === 'heading') {
    const level = node.attrs?.level;
    if (level === 1 || level === 2) {
      return false;
    }
    // H3+ are draggable
    return true;
  }
  
  // These block types are draggable
  const draggableTypes = [
    'paragraph',
    'image',
    'table',
    'bulletList',
    'orderedList',
    'blockquote',
    'codeBlock',
    'horizontalRule',
  ];
  
  return draggableTypes.includes(node.type.name);
}
