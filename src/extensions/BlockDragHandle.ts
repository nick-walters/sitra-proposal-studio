import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, EditorView } from '@tiptap/pm/view';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { TextSelection, NodeSelection } from '@tiptap/pm/state';
import { findBlockRange, isReorderableBlock } from './BlockReordering';
import { autoFitEditorTableAtPos } from '@/lib/editorTableAutoFit';

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

const AUTORESIZE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>`;

function createDragHandleContainer(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'block-drag-container';

  const grid = document.createElement('div');
  grid.className = 'block-controls-grid';

  const dragHandle = document.createElement('div');
  dragHandle.className = 'block-ctrl-btn block-drag-handle';
  dragHandle.setAttribute('draggable', 'true');
  dragHandle.setAttribute('contenteditable', 'false');
  dragHandle.setAttribute('title', 'Click to select block, drag to reorder');
  dragHandle.innerHTML = GRIP_SVG;

  const deleteBtn = document.createElement('div');
  deleteBtn.className = 'block-ctrl-btn block-delete-btn';
  deleteBtn.setAttribute('contenteditable', 'false');
  deleteBtn.setAttribute('title', 'Delete block');
  deleteBtn.innerHTML = DELETE_SVG;

  const autoresizeBtn = document.createElement('div');
  autoresizeBtn.className = 'block-ctrl-btn block-autoresize-btn';
  autoresizeBtn.setAttribute('contenteditable', 'false');
  autoresizeBtn.setAttribute('title', 'Auto-resize columns');
  autoresizeBtn.innerHTML = AUTORESIZE_SVG;
  autoresizeBtn.style.display = 'none';

  grid.appendChild(dragHandle);
  grid.appendChild(deleteBtn);
  grid.appendChild(autoresizeBtn);

  container.appendChild(grid);
  return container;
}

function createDropIndicator(): HTMLElement {
  const indicator = document.createElement('div');
  indicator.className = 'block-drop-indicator';
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

function blockContainsTable(doc: ProseMirrorNode, startPos: number, endPos: number): boolean {
  let found = false;
  doc.nodesBetween(startPos, endPos, (node) => {
    if (node.type.name === 'table') found = true;
    return !found;
  });
  return found;
}

function findTableInBlock(
  view: EditorView,
  startPos: number,
  endPos: number,
): { tableEl: HTMLTableElement; tablePos: number } | null {
  const doc = view.state.doc;
  let match: { tableEl: HTMLTableElement; tablePos: number } | null = null;
  doc.nodesBetween(startPos, endPos, (node, pos) => {
    if (match) return false;
    if (node.type.name === 'table') {
      const dom = view.nodeDOM(pos);
      if (dom instanceof HTMLTableElement) {
        match = { tableEl: dom, tablePos: pos };
      } else if (dom instanceof HTMLElement) {
        const inner = dom.querySelector('table');
        if (inner) match = { tableEl: inner, tablePos: pos };
      }
      return false;
    }
  });
  return match;
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
    let lastDropTarget: { startPos: number; endPos: number; insertBefore: boolean } | null = null;

    return [
      new Plugin({
        key: dragHandlePluginKey,

        view(editorView) {
          dragContainer = createDragHandleContainer();
          dragContainer.style.display = 'none';
          editorView.dom.parentElement?.appendChild(dragContainer);

          const dragHandle = dragContainer.querySelector('.block-drag-handle') as HTMLElement;
          const deleteBtn = dragContainer.querySelector('.block-delete-btn') as HTMLElement;
          const autoresizeBtn = dragContainer.querySelector('.block-autoresize-btn') as HTMLElement;

          dropIndicator = createDropIndicator();
          dropIndicator.style.display = 'none';
          editorView.dom.parentElement?.appendChild(dropIndicator);

          // Grip click: select entire block (including caption)
          dragHandle?.addEventListener('mousedown', (e: MouseEvent) => {
            // Don't interfere with drag
            if (e.button !== 0) return;
          });

          dragHandle?.addEventListener('click', (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (!currentHoveredBlockRange) return;

            const { startPos, endPos } = currentHoveredBlockRange;
            try {
              const { state } = editorView;
              const $start = state.doc.resolve(startPos);
              const blockNode = $start.nodeAfter;

              // Use NodeSelection for table nodes (standard & special tables)
              // TextSelection can't properly span table boundaries
              if (blockNode && blockNode.type.name === 'table') {
                const selection = NodeSelection.create(state.doc, startPos);
                editorView.dispatch(state.tr.setSelection(selection));
              } else {
                const $end = state.doc.resolve(endPos);
                const selection = TextSelection.create(state.doc, $start.pos, $end.pos);
                editorView.dispatch(state.tr.setSelection(selection));
              }
              editorView.focus();
            } catch (err) {
              console.error('Block select error:', err);
            }
          });

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

          // Autoresize button
          autoresizeBtn?.addEventListener('click', (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (!currentHoveredBlockRange) return;
            const tableMatch = findTableInBlock(editorView, currentHoveredBlockRange.startPos, currentHoveredBlockRange.endPos);
            if (tableMatch) {
              autoFitEditorTableAtPos(editorView, tableMatch.tablePos, tableMatch.tableEl);
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
            update() {},
            destroy() {
              dragContainer?.remove();
              dropIndicator?.remove();
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

                // Show/hide autoresize button
                const hasTable = blockContainsTable(view.state.doc, blockRange.startPos, blockRange.endPos);
                const autoresizeBtn = dragContainer!.querySelector('.block-autoresize-btn') as HTMLElement;
                if (autoresizeBtn) {
                  autoresizeBtn.style.display = hasTable ? 'flex' : 'none';
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
