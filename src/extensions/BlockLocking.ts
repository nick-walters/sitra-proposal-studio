import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { BlockLock } from '@/hooks/useBlockLocking';

export interface BlockLockingOptions {
  getLockedBlocks: () => BlockLock[];
  getCurrentUserId: () => string | null;
}

// Get block identifier from position (matching the hook logic)
function getBlockIdFromPosition(doc: any, pos: number): string | null {
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

export const BlockLocking = Extension.create<BlockLockingOptions>({
  name: 'blockLocking',

  addOptions() {
    return {
      getLockedBlocks: () => [],
      getCurrentUserId: () => null,
    };
  },

  addProseMirrorPlugins() {
    const { getLockedBlocks, getCurrentUserId } = this.options;

    return [
      new Plugin({
        key: new PluginKey('blockLocking'),

        filterTransaction(tr, state) {
          // Allow non-content changes (selection, meta)
          if (!tr.docChanged) return true;

          const lockedBlocks = getLockedBlocks();
          if (lockedBlocks.length === 0) return true;

          const userId = getCurrentUserId();
          const lockedBlockIds = new Set(
            lockedBlocks
              .filter(lock => lock.userId !== userId)
              .map(lock => lock.blockId)
          );

          if (lockedBlockIds.size === 0) return true;

          // Check if the transaction affects any locked block
          let affectsLockedBlock = false;

          tr.steps.forEach((step) => {
            // Get the range affected by this step
            const stepMap = step.getMap();
            
            stepMap.forEach((oldStart, oldEnd) => {
              // Check positions in the old document
              for (let pos = oldStart; pos <= oldEnd; pos++) {
                const blockId = getBlockIdFromPosition(state.doc, pos);
                if (blockId && lockedBlockIds.has(blockId)) {
                  affectsLockedBlock = true;
                }
              }
            });
          });

          // Block the transaction if it affects a locked block
          return !affectsLockedBlock;
        },
      }),
    ];
  },
});
