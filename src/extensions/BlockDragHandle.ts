import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, EditorView } from '@tiptap/pm/view';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { findBlockRange, isReorderableBlock } from './BlockReordering';

/**
 * Interface for block locking
 */
export interface BlockLockForDrag {
  userId: string;
  blockId: string;
}

export interface BlockDragHandleOptions {
  getLockedBlocks: () => BlockLockForDrag[];
  getCurrentUserId: () => string | null;
}

const dragHandlePluginKey = new PluginKey('blockDragHandle');

/**
 * Creates a drag handle DOM element
 */
function createDragHandleElement(): HTMLElement {
  const handle = document.createElement('div');
  handle.className = 'block-drag-handle';
  handle.setAttribute('draggable', 'true');
  handle.setAttribute('contenteditable', 'false');
  handle.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/>
      <circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>
    </svg>
  `;
  return handle;
}

/**
 * Creates a drop indicator DOM element
 */
function createDropIndicator(): HTMLElement {
  const indicator = document.createElement('div');
  indicator.className = 'block-drop-indicator';
  return indicator;
}

/**
 * Gets block ID from position (matching block locking logic)
 */
function getBlockIdFromPos(doc: ProseMirrorNode, pos: number): string | null {
  try {
    const $pos = doc.resolve(pos);
    let depth = $pos.depth;
    while (depth > 1) {
      depth--;
    }
    if (depth < 1) return null;
    const node = $pos.node(depth);
    const start = $pos.start(depth);
    return `${start}-${node.type.name}`;
  } catch {
    return null;
  }
}

/**
 * Block Drag Handle Extension
 * 
 * Adds a floating drag handle to blocks that enables drag-and-drop reordering.
 * Works with the existing findBlockRange logic to move figures/tables with their captions.
 */
export const BlockDragHandle = Extension.create<BlockDragHandleOptions>({
  name: 'blockDragHandle',

  addOptions() {
    return {
      getLockedBlocks: () => [],
      getCurrentUserId: () => null,
    };
  },

  addProseMirrorPlugins() {
    const { getLockedBlocks, getCurrentUserId } = this.options;
    
    let draggedBlockRange: { startPos: number; endPos: number } | null = null;
    let dropIndicator: HTMLElement | null = null;
    let dragHandle: HTMLElement | null = null;
    let currentHoveredBlockPos: number | null = null;

    return [
      new Plugin({
        key: dragHandlePluginKey,

        view(editorView) {
          // Create the drag handle element
          dragHandle = createDragHandleElement();
          dragHandle.style.display = 'none';
          editorView.dom.parentElement?.appendChild(dragHandle);

          // Create drop indicator
          dropIndicator = createDropIndicator();
          dropIndicator.style.display = 'none';
          editorView.dom.parentElement?.appendChild(dropIndicator);

          // Handle drag start on the drag handle
          dragHandle.addEventListener('dragstart', (e: DragEvent) => {
            if (currentHoveredBlockPos === null) return;

            const blockRange = findBlockRange(editorView.state.doc, currentHoveredBlockPos);
            if (!blockRange || !isReorderableBlock(blockRange.node)) {
              e.preventDefault();
              return;
            }

            // Check if block is locked by another user
            const blockId = getBlockIdFromPos(editorView.state.doc, blockRange.startPos);
            const lockedBlocks = getLockedBlocks();
            const userId = getCurrentUserId();
            const isLockedByOther = lockedBlocks.some(
              lock => lock.blockId === blockId && lock.userId !== userId
            );

            if (isLockedByOther) {
              e.preventDefault();
              return;
            }

            draggedBlockRange = { startPos: blockRange.startPos, endPos: blockRange.endPos };

            // Set drag data
            e.dataTransfer?.setData('text/plain', 'block-drag');
            e.dataTransfer!.effectAllowed = 'move';

            // Add dragging class
            dragHandle?.classList.add('dragging');
            
            // Mark the block being dragged
            requestAnimationFrame(() => {
              const blockDom = editorView.nodeDOM(blockRange.startPos);
              if (blockDom && blockDom instanceof HTMLElement) {
                blockDom.classList.add('dragging-block');
              }
            });
          });

          dragHandle.addEventListener('dragend', () => {
            // Remove all dragging classes
            dragHandle?.classList.remove('dragging');
            dropIndicator!.style.display = 'none';
            document.querySelectorAll('.dragging-block').forEach(el => {
              el.classList.remove('dragging-block');
            });
            draggedBlockRange = null;
          });

          return {
            update(view) {
              // Position is handled by mousemove
            },
            destroy() {
              dragHandle?.remove();
              dropIndicator?.remove();
            },
          };
        },

        props: {
          handleDOMEvents: {
            mousemove(view, event) {
              const { clientX, clientY } = event;
              const pos = view.posAtCoords({ left: clientX, top: clientY });
              
              if (!pos || !dragHandle) {
                dragHandle!.style.display = 'none';
                currentHoveredBlockPos = null;
                return false;
              }

              // Find the block at this position
              try {
                const $pos = view.state.doc.resolve(pos.pos);
                let blockPos = $pos.before($pos.depth === 0 ? 1 : $pos.depth);
                
                const blockRange = findBlockRange(view.state.doc, blockPos);
                if (!blockRange) {
                  dragHandle!.style.display = 'none';
                  currentHoveredBlockPos = null;
                  return false;
                }

                // Don't show handle for non-reorderable blocks (H1/H2)
                if (!isReorderableBlock(blockRange.node)) {
                  dragHandle!.style.display = 'none';
                  currentHoveredBlockPos = null;
                  return false;
                }

                // Check if block is locked by another user
                const blockId = getBlockIdFromPos(view.state.doc, blockRange.startPos);
                const lockedBlocks = getLockedBlocks();
                const userId = getCurrentUserId();
                const isLockedByOther = lockedBlocks.some(
                  lock => lock.blockId === blockId && lock.userId !== userId
                );

                if (isLockedByOther) {
                  dragHandle!.style.display = 'none';
                  currentHoveredBlockPos = null;
                  return false;
                }

                currentHoveredBlockPos = blockRange.startPos;

                // Position the drag handle
                const blockDom = view.nodeDOM(blockRange.startPos);
                if (blockDom && blockDom instanceof HTMLElement) {
                  const rect = blockDom.getBoundingClientRect();
                  const editorRect = view.dom.parentElement?.getBoundingClientRect();
                  
                  if (editorRect) {
                    dragHandle!.style.display = 'flex';
                    dragHandle!.style.top = `${rect.top - editorRect.top}px`;
                    dragHandle!.style.left = '-28px';
                  }
                }
              } catch {
                dragHandle!.style.display = 'none';
                currentHoveredBlockPos = null;
              }

              return false;
            },

            dragover(view, event) {
              if (!draggedBlockRange || !dropIndicator) return false;
              
              event.preventDefault();
              event.dataTransfer!.dropEffect = 'move';

              const { clientX, clientY } = event;
              const pos = view.posAtCoords({ left: clientX, top: clientY });
              
              if (!pos) {
                dropIndicator.style.display = 'none';
                return true;
              }

              try {
                const $pos = view.state.doc.resolve(pos.pos);
                let blockPos = $pos.before($pos.depth === 0 ? 1 : $pos.depth);
                
                const targetBlock = findBlockRange(view.state.doc, blockPos);
                if (!targetBlock) {
                  dropIndicator.style.display = 'none';
                  return true;
                }

                // Don't allow dropping before/after H1/H2
                if (!isReorderableBlock(targetBlock.node)) {
                  dropIndicator.style.display = 'none';
                  return true;
                }

                // Show drop indicator
                const blockDom = view.nodeDOM(targetBlock.startPos);
                if (blockDom && blockDom instanceof HTMLElement) {
                  const rect = blockDom.getBoundingClientRect();
                  const editorRect = view.dom.parentElement?.getBoundingClientRect();
                  const midY = rect.top + rect.height / 2;
                  
                  if (editorRect) {
                    dropIndicator.style.display = 'block';
                    
                    // Position above or below based on mouse position
                    if (clientY < midY) {
                      dropIndicator.style.top = `${rect.top - editorRect.top - 1}px`;
                    } else {
                      dropIndicator.style.top = `${rect.bottom - editorRect.top - 1}px`;
                    }
                    dropIndicator.style.left = '0';
                    dropIndicator.style.right = '0';
                  }
                }
              } catch {
                dropIndicator.style.display = 'none';
              }

              return true;
            },

            dragleave(view, event) {
              // Only hide if we're leaving the editor area completely
              const relatedTarget = event.relatedTarget as HTMLElement;
              if (!view.dom.contains(relatedTarget)) {
                if (dropIndicator) {
                  dropIndicator.style.display = 'none';
                }
              }
              return false;
            },

            drop(view, event) {
              if (!draggedBlockRange) return false;
              
              event.preventDefault();
              
              if (dropIndicator) {
                dropIndicator.style.display = 'none';
              }

              const { clientX, clientY } = event;
              const pos = view.posAtCoords({ left: clientX, top: clientY });
              
              if (!pos) {
                draggedBlockRange = null;
                return true;
              }

              try {
                const { state } = view;
                const $pos = state.doc.resolve(pos.pos);
                let targetBlockPos = $pos.before($pos.depth === 0 ? 1 : $pos.depth);
                
                const targetBlock = findBlockRange(state.doc, targetBlockPos);
                if (!targetBlock || !isReorderableBlock(targetBlock.node)) {
                  draggedBlockRange = null;
                  return true;
                }

                // Check if target is locked
                const targetBlockId = getBlockIdFromPos(state.doc, targetBlock.startPos);
                const lockedBlocks = getLockedBlocks();
                const userId = getCurrentUserId();
                const isTargetLocked = lockedBlocks.some(
                  lock => lock.blockId === targetBlockId && lock.userId !== userId
                );

                if (isTargetLocked) {
                  draggedBlockRange = null;
                  return true;
                }

                // Don't do anything if dropping on self
                if (draggedBlockRange.startPos === targetBlock.startPos) {
                  draggedBlockRange = null;
                  return true;
                }

                // Determine if dropping before or after target
                const blockDom = view.nodeDOM(targetBlock.startPos);
                let insertBefore = true;
                if (blockDom && blockDom instanceof HTMLElement) {
                  const rect = blockDom.getBoundingClientRect();
                  const midY = rect.top + rect.height / 2;
                  insertBefore = clientY < midY;
                }

                // Get the slice to move
                const slice = state.doc.slice(draggedBlockRange.startPos, draggedBlockRange.endPos);
                
                // Calculate positions
                const sourceStart = draggedBlockRange.startPos;
                const sourceEnd = draggedBlockRange.endPos;
                const sourceSize = sourceEnd - sourceStart;
                
                let insertPos = insertBefore ? targetBlock.startPos : targetBlock.endPos;
                
                // Create transaction
                const tr = state.tr;
                
                // If moving down, we need to insert first then delete
                // If moving up, we need to delete first then insert
                if (sourceStart < insertPos) {
                  // Moving down: adjust insert position for upcoming deletion
                  insertPos = insertPos - sourceSize;
                  tr.delete(sourceStart, sourceEnd);
                  tr.insert(insertPos, slice.content);
                } else {
                  // Moving up: insert first, then delete (positions shift)
                  tr.insert(insertPos, slice.content);
                  tr.delete(sourceStart + sourceSize, sourceEnd + sourceSize);
                }

                view.dispatch(tr);
              } catch (e) {
                console.error('Drop error:', e);
              }

              draggedBlockRange = null;
              
              // Remove dragging classes
              document.querySelectorAll('.dragging-block').forEach(el => {
                el.classList.remove('dragging-block');
              });

              return true;
            },
          },
        },
      }),
    ];
  },
});
