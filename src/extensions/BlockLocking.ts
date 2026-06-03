import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

// Simplified BlockLock interface for the extension - only needs userId and blockId for filtering
export interface BlockLockForFiltering {
  userId: string;
  blockId: string;
}

export interface BlockLockingOptions {
  getLockedBlocks: () => BlockLockForFiltering[];
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
          return true;
        },
      }),
    ];
  },
});
