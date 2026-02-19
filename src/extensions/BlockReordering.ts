import { Extension } from '@tiptap/core';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';

/**
 * Finds the range of a block element, including associated captions for figures/tables.
 * Exported for use by BlockDragHandle extension.
 */
export function findBlockRange(
  doc: ProseMirrorNode,
  pos: number
): { startPos: number; endPos: number; node: ProseMirrorNode } | null {
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
    return { startPos, endPos, node };
  }

  // For tables, include caption before
  if (node.type.name === 'table') {
    if (pos > 0) {
      const $atPos = doc.resolve(pos);
      const beforeNode = $atPos.nodeBefore;
      
      if (beforeNode && beforeNode.type.name === 'paragraph') {
        const textContent = beforeNode.textContent.toLowerCase();
        if (textContent.startsWith('table ') || beforeNode.attrs?.class?.includes('table-caption')) {
          startPos = pos - beforeNode.nodeSize;
        }
      }
    }
    return { startPos, endPos, node };
  }

  // For caption paragraphs, include associated content
  if (node.type.name === 'paragraph') {
    const textContent = node.textContent.toLowerCase();
    const hasClass = node.attrs?.class || '';
    
    // Figure caption - look for image before it
    if (textContent.startsWith('figure ') || hasClass.includes('figure-caption')) {
      if (pos > 0) {
        const $atPos = doc.resolve(pos);
        const beforeNode = $atPos.nodeBefore;
        
        if (beforeNode && beforeNode.type.name === 'image') {
          return {
            startPos: pos - beforeNode.nodeSize,
            endPos: pos + node.nodeSize,
            node,
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
            node,
          };
        }
      }
    }
  }

  return { startPos, endPos, node };
}

/**
 * Checks if a node can be reordered (all blocks except H1 and H2).
 * Exported for use by BlockDragHandle extension.
 */
export function isReorderableBlock(node: ProseMirrorNode): boolean {
  // H1 and H2 are locked - not reorderable
  if (node.type.name === 'heading') {
    const level = node.attrs?.level;
    if (level === 1 || level === 2) {
      return false;
    }
  }
  return true;
}

/**
 * Block Reordering Extension
 * 
 * Enables keyboard-based reordering of blocks using Ctrl+Shift+↑/↓.
 * Works for all block types except H1 and H2 headings.
 * Automatically moves associated captions with figures and tables.
 */
export const BlockReordering = Extension.create({
  name: 'blockReordering',

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-ArrowUp': () => {
        const { state, view } = this.editor;
        const { doc, selection, tr } = state;
        
        // Get current block position
        const $from = selection.$from;
        let blockPos = $from.depth >= 1 ? $from.before(1) : $from.before($from.depth === 0 ? 1 : $from.depth);
        
        // Find the block at current position
        const currentBlock = findBlockRange(doc, blockPos);
        if (!currentBlock) return false;
        
        // Check if block is reorderable
        if (!isReorderableBlock(currentBlock.node)) return false;
        
        // Find previous block
        if (currentBlock.startPos <= 0) return false;
        
        const prevBlockPos = currentBlock.startPos - 1;
        const $prevPos = doc.resolve(prevBlockPos);
        const prevNode = $prevPos.nodeBefore;
        if (!prevNode) return false;
        
        const prevBlockRange = findBlockRange(doc, currentBlock.startPos - prevNode.nodeSize);
        if (!prevBlockRange) return false;
        
        // Don't move past H1/H2
        if (!isReorderableBlock(prevBlockRange.node)) return false;
        
        // Get content to move
        const slice = doc.slice(currentBlock.startPos, currentBlock.endPos);
        
        // Delete original and insert before previous
        tr.delete(currentBlock.startPos, currentBlock.endPos);
        
        // Calculate new position (accounts for deletion)
        const newPos = prevBlockRange.startPos;
        tr.insert(newPos, slice.content);
        
        // Update selection to stay with moved block
        const newSelection = TextSelection.near(tr.doc.resolve(newPos + 1));
        tr.setSelection(newSelection);
        
        view.dispatch(tr);
        return true;
      },
      'Mod-Shift-ArrowDown': () => {
        const { state, view } = this.editor;
        const { doc, selection, tr } = state;
        
        // Get current block position
        const $from = selection.$from;
        let blockPos = $from.depth >= 1 ? $from.before(1) : $from.before($from.depth === 0 ? 1 : $from.depth);
        
        // Find the block at current position
        const currentBlock = findBlockRange(doc, blockPos);
        if (!currentBlock) return false;
        
        // Check if block is reorderable
        if (!isReorderableBlock(currentBlock.node)) return false;
        
        // Find next block
        if (currentBlock.endPos >= doc.content.size) return false;
        
        const nextBlockRange = findBlockRange(doc, currentBlock.endPos);
        if (!nextBlockRange) return false;
        
        // Don't move past H1/H2
        if (!isReorderableBlock(nextBlockRange.node)) return false;
        
        // Get content to move
        const slice = doc.slice(currentBlock.startPos, currentBlock.endPos);
        
        // Calculate insert position (after next block, but accounting for deletion)
        const insertAfterPos = nextBlockRange.endPos;
        
        // Delete original first
        tr.delete(currentBlock.startPos, currentBlock.endPos);
        
        // Calculate new position accounting for deletion
        const newPos = insertAfterPos - (currentBlock.endPos - currentBlock.startPos);
        tr.insert(newPos, slice.content);
        
        // Update selection to stay with moved block
        const newSelection = TextSelection.near(tr.doc.resolve(newPos + 1));
        tr.setSelection(newSelection);
        
        view.dispatch(tr);
        return true;
      },
    };
  },
});
