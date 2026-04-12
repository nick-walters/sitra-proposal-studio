import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, EditorView } from '@tiptap/pm/view';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { findBlockRange, isReorderableBlock } from './BlockReordering';
import { computeAutoFitSmart } from '@/lib/autoFitColumns';

export interface BlockLockForDrag {
  userId: string;
  blockId: string;
}

export interface BlockDragHandleOptions {
  getLockedBlocks: () => BlockLockForDrag[];
  getCurrentUserId: () => string | null;
  onDeleteRequest?: (callback: () => void) => void;
}

const dragHandlePluginKey = new PluginKey('blockDragHandle');

const GRIP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>`;

const DELETE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;

const CUT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/></svg>`;

const AUTORESIZE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>`;

function createDragHandleContainer(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'block-drag-container';

  const grid = document.createElement('div');
  grid.className = 'block-controls-grid';

  // Row 1: grip + delete
  const dragHandle = document.createElement('div');
  dragHandle.className = 'block-ctrl-btn block-drag-handle';
  dragHandle.setAttribute('draggable', 'true');
  dragHandle.setAttribute('contenteditable', 'false');
  dragHandle.setAttribute('title', 'Drag to reorder');
  dragHandle.innerHTML = GRIP_SVG;

  const deleteBtn = document.createElement('div');
  deleteBtn.className = 'block-ctrl-btn block-delete-btn';
  deleteBtn.setAttribute('contenteditable', 'false');
  deleteBtn.setAttribute('title', 'Delete block');
  deleteBtn.innerHTML = DELETE_SVG;

  // Row 2: autoresize (below grip) + cut (below delete)
  const autoresizeBtn = document.createElement('div');
  autoresizeBtn.className = 'block-ctrl-btn block-autoresize-btn';
  autoresizeBtn.setAttribute('contenteditable', 'false');
  autoresizeBtn.setAttribute('title', 'Auto-resize columns');
  autoresizeBtn.innerHTML = AUTORESIZE_SVG;
  autoresizeBtn.style.display = 'none';

  const cutBtn = document.createElement('div');
  cutBtn.className = 'block-ctrl-btn block-cut-btn';
  cutBtn.setAttribute('contenteditable', 'false');
  cutBtn.setAttribute('title', 'Cut block');
  cutBtn.innerHTML = CUT_SVG;

  grid.appendChild(dragHandle);
  grid.appendChild(deleteBtn);
  grid.appendChild(autoresizeBtn);
  grid.appendChild(cutBtn);

  container.appendChild(grid);
  return container;
}

function createDropIndicator(): HTMLElement {
  const indicator = document.createElement('div');
  indicator.className = 'block-drop-indicator';
  return indicator;
}

function createPasteIndicator(): HTMLElement {
  const indicator = document.createElement('div');
  indicator.className = 'block-paste-indicator';
  indicator.innerHTML = '<span class="block-paste-label">Paste here</span>';
  return indicator;
}

function getBlockIdFromPos(doc: ProseMirrorNode, pos: number): string | null {
  try {
    const $pos = doc.resolve(pos);
    let depth = $pos.depth;
    while (depth > 1) depth--;
    if (depth < 1) return null;
    const node = $pos.node(depth);
    const start = $pos.start(depth);
    return `${start}-${node.type.name}`;
  } catch {
    return null;
  }
}

/** Check if block at position contains or is a table */
function blockContainsTable(doc: ProseMirrorNode, startPos: number, endPos: number): boolean {
  let found = false;
  doc.nodesBetween(startPos, endPos, (node) => {
    if (node.type.name === 'table') found = true;
    return !found;
  });
  return found;
}

/** Find the table DOM element inside a block range */
function findTableDomInBlock(view: EditorView, startPos: number, endPos: number): HTMLTableElement | null {
  const blockDom = view.nodeDOM(startPos);
  if (!blockDom || !(blockDom instanceof HTMLElement)) return null;
  if (blockDom instanceof HTMLTableElement) return blockDom;
  return blockDom.querySelector('table');
}

export const BlockDragHandle = Extension.create<BlockDragHandleOptions>({
  name: 'blockDragHandle',

  addOptions() {
    return {
      getLockedBlocks: () => [],
      getCurrentUserId: () => null,
    };
  },

  addProseMirrorPlugins() {
    const { getLockedBlocks, getCurrentUserId, onDeleteRequest } = this.options;

    let draggedBlockRange: { startPos: number; endPos: number } | null = null;
    let dropIndicator: HTMLElement | null = null;
    let dragContainer: HTMLElement | null = null;
    let currentHoveredBlockPos: number | null = null;
    let currentHoveredBlockRange: { startPos: number; endPos: number } | null = null;

    // Cut state
    let cutBlockRange: { startPos: number; endPos: number } | null = null;
    let pasteIndicators: HTMLElement[] = [];
    let cutOverlay: HTMLElement | null = null;

    const removeCutOverlay = () => {
      cutOverlay?.remove();
      cutOverlay = null;
    };

    const positionCutOverlay = (view: EditorView) => {
      if (!cutBlockRange || !cutOverlay) return;
      const editorParent = view.dom.parentElement;
      if (!editorParent) return;
      const editorRect = editorParent.getBoundingClientRect();

      // Find all DOM nodes in the block range and compute bounding box
      let top = Infinity, bottom = -Infinity;
      const doc = view.state.doc;
      doc.nodesBetween(cutBlockRange.startPos, cutBlockRange.endPos, (node, pos) => {
        if (pos >= cutBlockRange!.startPos && pos < cutBlockRange!.endPos) {
          const dom = view.nodeDOM(pos);
          if (dom && dom instanceof HTMLElement) {
            const rect = dom.getBoundingClientRect();
            if (rect.top < top) top = rect.top;
            if (rect.bottom > bottom) bottom = rect.bottom;
          }
        }
        return true;
      });

      if (top !== Infinity && bottom !== -Infinity) {
        cutOverlay.style.top = `${top - editorRect.top - 2}px`;
        cutOverlay.style.height = `${bottom - top + 4}px`;
        cutOverlay.style.left = '-4px';
        cutOverlay.style.right = '-4px';
        cutOverlay.style.display = 'block';
      }
    };

    const createCutOverlay = (view: EditorView) => {
      removeCutOverlay();
      const editorParent = view.dom.parentElement;
      if (!editorParent) return;
      cutOverlay = document.createElement('div');
      cutOverlay.className = 'block-cut-overlay';
      editorParent.appendChild(cutOverlay);
      positionCutOverlay(view);
    };

    const clearCutState = (view?: EditorView) => {
      cutBlockRange = null;
      removeCutOverlay();
      pasteIndicators.forEach(el => el.remove());
      pasteIndicators = [];
      const cutBtn = dragContainer?.querySelector('.block-cut-btn');
      cutBtn?.classList.remove('active');
    };

    const showPasteIndicators = (view: EditorView) => {
      pasteIndicators.forEach(el => el.remove());
      pasteIndicators = [];
      if (!cutBlockRange) return;

      const editorParent = view.dom.parentElement;
      if (!editorParent) return;
      const editorRect = editorParent.getBoundingClientRect();

      // Collect top-level block positions
      const blocks: { startPos: number; endPos: number }[] = [];
      const doc = view.state.doc;
      doc.forEach((node, offset) => {
        blocks.push({ startPos: offset, endPos: offset + node.nodeSize });
      });

      // Insert paste indicators between blocks (except around the cut block)
      for (let i = 0; i <= blocks.length; i++) {
        // Skip positions adjacent to cut block
        const prevBlock = i > 0 ? blocks[i - 1] : null;
        const nextBlock = i < blocks.length ? blocks[i] : null;
        
        if (prevBlock && prevBlock.startPos === cutBlockRange.startPos) continue;
        if (nextBlock && nextBlock.startPos === cutBlockRange.startPos) continue;

        const indicator = createPasteIndicator();
        
        // Position
        let topPx: number;
        if (nextBlock) {
          const dom = view.nodeDOM(nextBlock.startPos);
          if (dom && dom instanceof HTMLElement) {
            const rect = dom.getBoundingClientRect();
            topPx = rect.top - editorRect.top - 2;
          } else continue;
        } else if (prevBlock) {
          const dom = view.nodeDOM(prevBlock.startPos);
          if (dom && dom instanceof HTMLElement) {
            const rect = dom.getBoundingClientRect();
            topPx = rect.bottom - editorRect.top;
          } else continue;
        } else continue;

        indicator.style.top = `${topPx}px`;
        
        const targetIdx = i;
        indicator.addEventListener('click', () => {
          if (!cutBlockRange) return;
          try {
            const { state } = view;
            const slice = state.doc.slice(cutBlockRange.startPos, cutBlockRange.endPos);
            const sourceStart = cutBlockRange.startPos;
            const sourceEnd = cutBlockRange.endPos;
            const sourceSize = sourceEnd - sourceStart;

            // Calculate insert position
            const currentBlocks: { startPos: number; endPos: number }[] = [];
            state.doc.forEach((node, offset) => {
              currentBlocks.push({ startPos: offset, endPos: offset + node.nodeSize });
            });
            let insertPos = targetIdx < currentBlocks.length ? currentBlocks[targetIdx].startPos : state.doc.content.size;

            const tr = state.tr;
            tr.setMeta('blockReorder', true);

            if (sourceStart < insertPos) {
              insertPos = insertPos - sourceSize;
              tr.delete(sourceStart, sourceEnd);
              tr.insert(insertPos, slice.content);
            } else {
              tr.insert(insertPos, slice.content);
              tr.delete(sourceStart + sourceSize, sourceEnd + sourceSize);
            }

            view.dispatch(tr);
            clearCutState(view);
            
            setTimeout(() => {
              window.dispatchEvent(new Event('block-reordered'));
            }, 50);
          } catch (e) {
            console.error('Paste error:', e);
          }
        });

        editorParent.appendChild(indicator);
        pasteIndicators.push(indicator);
      }
    };

    return [
      new Plugin({
        key: dragHandlePluginKey,

        view(editorView) {
          dragContainer = createDragHandleContainer();
          dragContainer.style.display = 'none';
          editorView.dom.parentElement?.appendChild(dragContainer);

          const dragHandle = dragContainer.querySelector('.block-drag-handle') as HTMLElement;
          const deleteBtn = dragContainer.querySelector('.block-delete-btn') as HTMLElement;
          const cutBtn = dragContainer.querySelector('.block-cut-btn') as HTMLElement;
          const autoresizeBtn = dragContainer.querySelector('.block-autoresize-btn') as HTMLElement;

          dropIndicator = createDropIndicator();
          dropIndicator.style.display = 'none';
          editorView.dom.parentElement?.appendChild(dropIndicator);

          // Escape key cancels cut
          const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && cutBlockRange) {
              clearCutState(editorView);
            }
          };
          document.addEventListener('keydown', handleKeyDown);

          // Delete button
          deleteBtn?.addEventListener('click', (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (!currentHoveredBlockRange) return;
            const blockRange = { ...currentHoveredBlockRange };
            const executeDelete = () => {
              try {
                const { state } = editorView;
                const tr = state.tr.delete(blockRange.startPos, blockRange.endPos);
                editorView.dispatch(tr);
                editorView.focus();
              } catch (err) {
                console.error('Delete error:', err);
              }
            };
            if (onDeleteRequest) {
              onDeleteRequest(executeDelete);
            } else {
              executeDelete();
            }
          });

          // Cut button
          cutBtn?.addEventListener('click', (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (!currentHoveredBlockRange) return;

            // If already cut, toggle off (cancel)
            if (cutBlockRange && cutBlockRange.startPos === currentHoveredBlockRange.startPos) {
              clearCutState(editorView);
              return;
            }

            // Clear previous cut
            clearCutState(editorView);

            cutBlockRange = { ...currentHoveredBlockRange };
            cutBtn.classList.add('active');

            // Grey out the cut block with overlay
            createCutOverlay(editorView);

            showPasteIndicators(editorView);
          });

          // Autoresize button
          autoresizeBtn?.addEventListener('click', (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (!currentHoveredBlockRange) return;
            const tableDom = findTableDomInBlock(editorView, currentHoveredBlockRange.startPos, currentHoveredBlockRange.endPos);
            if (tableDom) {
              const widths = computeAutoFitSmart(tableDom);
              if (widths) {
                const colgroup = tableDom.querySelector('colgroup');
                if (colgroup) {
                  const cols = colgroup.querySelectorAll('col');
                  cols.forEach((col, i) => {
                    if (i < widths.length) {
                      (col as HTMLElement).style.width = `${widths[i]}px`;
                      (col as HTMLElement).style.minWidth = `${widths[i]}px`;
                    }
                  });
                }
              }
            }
          });

          // Drag start
          dragHandle?.addEventListener('dragstart', (e: DragEvent) => {
            if (currentHoveredBlockPos === null) return;
            const blockRange = findBlockRange(editorView.state.doc, currentHoveredBlockPos);
            if (!blockRange || !isReorderableBlock(blockRange.node)) {
              e.preventDefault();
              return;
            }
            const blockId = getBlockIdFromPos(editorView.state.doc, blockRange.startPos);
            const lockedBlocks = getLockedBlocks();
            const userId = getCurrentUserId();
            const isLockedByOther = lockedBlocks.some(lock => lock.blockId === blockId && lock.userId !== userId);
            if (isLockedByOther) { e.preventDefault(); return; }

            draggedBlockRange = { startPos: blockRange.startPos, endPos: blockRange.endPos };
            e.dataTransfer?.setData('text/plain', 'block-drag');
            e.dataTransfer!.effectAllowed = 'move';
            dragContainer?.classList.add('dragging');
            requestAnimationFrame(() => {
              const blockDom = editorView.nodeDOM(blockRange.startPos);
              if (blockDom && blockDom instanceof HTMLElement) blockDom.classList.add('dragging-block');
            });
          });

          dragHandle?.addEventListener('dragend', () => {
            dragContainer?.classList.remove('dragging');
            dropIndicator!.style.display = 'none';
            document.querySelectorAll('.dragging-block').forEach(el => el.classList.remove('dragging-block'));
            draggedBlockRange = null;
          });

          return {
            update(view) {
              // Reposition cut overlay on editor updates (content changes may shift positions)
              if (cutBlockRange && cutOverlay) {
                positionCutOverlay(view);
              }
            },
            destroy() {
              dragContainer?.remove();
              dropIndicator?.remove();
              removeCutOverlay();
              document.removeEventListener('keydown', handleKeyDown);
              clearCutState();
            },
          };
        },

        props: {
          handleDOMEvents: {
            mousemove(view, event) {
              const { clientX, clientY } = event;
              const pos = view.posAtCoords({ left: clientX, top: clientY });
              if (!pos || !dragContainer) {
                dragContainer!.style.display = 'none';
                currentHoveredBlockPos = null;
                currentHoveredBlockRange = null;
                return false;
              }

              try {
                const $pos = view.state.doc.resolve(pos.pos);
                let blockPos: number;
                if ($pos.depth >= 1) {
                  blockPos = $pos.before(1);
                } else {
                  blockPos = $pos.before($pos.depth === 0 ? 1 : $pos.depth);
                }
                const blockRange = findBlockRange(view.state.doc, blockPos);
                if (!blockRange || !isReorderableBlock(blockRange.node)) {
                  dragContainer!.style.display = 'none';
                  currentHoveredBlockPos = null;
                  currentHoveredBlockRange = null;
                  return false;
                }

                const blockId = getBlockIdFromPos(view.state.doc, blockRange.startPos);
                const lockedBlocks = getLockedBlocks();
                const userId = getCurrentUserId();
                const isLockedByOther = lockedBlocks.some(lock => lock.blockId === blockId && lock.userId !== userId);
                if (isLockedByOther) {
                  dragContainer!.style.display = 'none';
                  currentHoveredBlockPos = null;
                  currentHoveredBlockRange = null;
                  return false;
                }

                currentHoveredBlockPos = blockRange.startPos;
                currentHoveredBlockRange = { startPos: blockRange.startPos, endPos: blockRange.endPos };

                // Show/hide autoresize button based on whether block contains a table
                const hasTable = blockContainsTable(view.state.doc, blockRange.startPos, blockRange.endPos);
                const autoresizeBtn = dragContainer!.querySelector('.block-autoresize-btn') as HTMLElement;
                if (autoresizeBtn) {
                  autoresizeBtn.style.display = hasTable ? 'flex' : 'none';
                }

                // Update cut button active state
                const cutBtn = dragContainer!.querySelector('.block-cut-btn') as HTMLElement;
                if (cutBtn) {
                  const isCutBlock = cutBlockRange && cutBlockRange.startPos === blockRange.startPos;
                  cutBtn.classList.toggle('active', !!isCutBlock);
                }

                // Position
                const blockDom = view.nodeDOM(blockRange.startPos);
                if (blockDom && blockDom instanceof HTMLElement) {
                  const rect = blockDom.getBoundingClientRect();
                  const editorRect = view.dom.parentElement?.getBoundingClientRect();
                  if (editorRect) {
                    dragContainer!.style.display = 'flex';
                    dragContainer!.style.top = `${rect.top - editorRect.top}px`;
                    dragContainer!.style.left = '-52px';
                  }
                }
              } catch {
                dragContainer!.style.display = 'none';
                currentHoveredBlockPos = null;
                currentHoveredBlockRange = null;
              }

              return false;
            },

            dragover(view, event) {
              if (!draggedBlockRange || !dropIndicator) return false;
              event.preventDefault();
              event.dataTransfer!.dropEffect = 'move';

              const { clientX, clientY } = event;
              const pos = view.posAtCoords({ left: clientX, top: clientY });
              if (!pos) { dropIndicator.style.display = 'none'; return true; }

              try {
                const $pos = view.state.doc.resolve(pos.pos);
                let blockPos = $pos.depth >= 1 ? $pos.before(1) : $pos.before($pos.depth === 0 ? 1 : $pos.depth);
                const targetBlock = findBlockRange(view.state.doc, blockPos);
                if (!targetBlock || !isReorderableBlock(targetBlock.node)) {
                  dropIndicator.style.display = 'none';
                  return true;
                }

                const blockDom = view.nodeDOM(targetBlock.startPos);
                if (blockDom && blockDom instanceof HTMLElement) {
                  const rect = blockDom.getBoundingClientRect();
                  const editorRect = view.dom.parentElement?.getBoundingClientRect();
                  const midY = rect.top + rect.height / 2;
                  if (editorRect) {
                    dropIndicator.style.display = 'block';
                    dropIndicator.style.top = clientY < midY
                      ? `${rect.top - editorRect.top - 1}px`
                      : `${rect.bottom - editorRect.top - 1}px`;
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
              const relatedTarget = event.relatedTarget as HTMLElement;
              if (!view.dom.contains(relatedTarget) && dropIndicator) {
                dropIndicator.style.display = 'none';
              }
              return false;
            },

            drop(view, event) {
              if (!draggedBlockRange) return false;
              event.preventDefault();
              if (dropIndicator) dropIndicator.style.display = 'none';

              const { clientX, clientY } = event;
              const pos = view.posAtCoords({ left: clientX, top: clientY });
              if (!pos) { draggedBlockRange = null; return true; }

              try {
                const { state } = view;
                const $pos = state.doc.resolve(pos.pos);
                let targetBlockPos = $pos.depth >= 1 ? $pos.before(1) : $pos.before($pos.depth === 0 ? 1 : $pos.depth);
                const targetBlock = findBlockRange(state.doc, targetBlockPos);
                if (!targetBlock || !isReorderableBlock(targetBlock.node)) { draggedBlockRange = null; return true; }

                const targetBlockId = getBlockIdFromPos(state.doc, targetBlock.startPos);
                const lockedBlocks = getLockedBlocks();
                const userId = getCurrentUserId();
                const isTargetLocked = lockedBlocks.some(lock => lock.blockId === targetBlockId && lock.userId !== userId);
                if (isTargetLocked) { draggedBlockRange = null; return true; }
                if (draggedBlockRange.startPos === targetBlock.startPos) { draggedBlockRange = null; return true; }

                const blockDom = view.nodeDOM(targetBlock.startPos);
                let insertBefore = true;
                if (blockDom && blockDom instanceof HTMLElement) {
                  const rect = blockDom.getBoundingClientRect();
                  insertBefore = clientY < rect.top + rect.height / 2;
                }

                const slice = state.doc.slice(draggedBlockRange.startPos, draggedBlockRange.endPos);
                const sourceStart = draggedBlockRange.startPos;
                const sourceEnd = draggedBlockRange.endPos;
                const sourceSize = sourceEnd - sourceStart;
                let insertPos = insertBefore ? targetBlock.startPos : targetBlock.endPos;

                const tr = state.tr;
                tr.setMeta('blockReorder', true);
                if (sourceStart < insertPos) {
                  insertPos -= sourceSize;
                  tr.delete(sourceStart, sourceEnd);
                  tr.insert(insertPos, slice.content);
                } else {
                  tr.insert(insertPos, slice.content);
                  tr.delete(sourceStart + sourceSize, sourceEnd + sourceSize);
                }
                view.dispatch(tr);
                setTimeout(() => { window.dispatchEvent(new Event('block-reordered')); }, 50);
              } catch (e) {
                console.error('Drop error:', e);
              }

              draggedBlockRange = null;
              document.querySelectorAll('.dragging-block').forEach(el => el.classList.remove('dragging-block'));
              return true;
            },
          },
        },
      }),
    ];
  },
});
