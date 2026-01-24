import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Editor } from '@tiptap/react';

export interface BlockLock {
  userId: string;
  userName: string;
  userColor: string;
  blockId: string; // Position-based identifier for the block
  blockType: 'paragraph' | 'table' | 'heading' | 'list' | 'image' | 'other';
  lockedAt: string;
}

interface UseBlockLockingProps {
  proposalId: string;
  sectionId: string | null;
  editor: Editor | null;
}

// Predefined colors for users
const USER_COLORS = [
  '#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#2196F3',
  '#00BCD4', '#009688', '#4CAF50', '#FF9800', '#FF5722',
];

function getColorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

// Get a stable block identifier from position
function getBlockIdFromPosition(editor: Editor, pos: number): { blockId: string; blockType: string } | null {
  try {
    const $pos = editor.state.doc.resolve(pos);
    
    // Walk up to find the top-level block node (depth 1)
    let depth = $pos.depth;
    while (depth > 1) {
      depth--;
    }
    
    if (depth < 1) return null;
    
    const node = $pos.node(depth);
    const start = $pos.start(depth);
    
    // Create a stable identifier using position and node type
    const blockId = `${start}-${node.type.name}`;
    const blockType = node.type.name as BlockLock['blockType'];
    
    return { blockId, blockType };
  } catch {
    return null;
  }
}

export function useBlockLocking({ proposalId, sectionId, editor }: UseBlockLockingProps) {
  const [blockLocks, setBlockLocks] = useState<Map<string, BlockLock>>(new Map());
  const [myCurrentBlock, setMyCurrentBlock] = useState<string | null>(null);
  const { user } = useAuth();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const throttleMs = 100;

  // Get userName
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Anonymous';
  const userColor = user ? getColorForUser(user.id) : '#3B82F6';

  useEffect(() => {
    if (!proposalId || !sectionId || !user) return;

    const channelName = `block-locks:${proposalId}:${sectionId}`;
    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const locks = new Map<string, BlockLock>();
        
        for (const [userId, presences] of Object.entries(state)) {
          const presence = presences[0] as unknown as {
            blockId: string | null;
            blockType: string;
            userName: string;
            userColor: string;
            lockedAt: string;
          };
          
          // Skip if no active block or it's the current user
          if (!presence.blockId || userId === user.id) continue;
          
          locks.set(presence.blockId, {
            userId,
            userName: presence.userName,
            userColor: presence.userColor,
            blockId: presence.blockId,
            blockType: presence.blockType as BlockLock['blockType'],
            lockedAt: presence.lockedAt,
          });
        }
        
        setBlockLocks(locks);
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        // When a user leaves, remove their block lock
        setBlockLocks(prev => {
          const newLocks = new Map(prev);
          for (const [blockId, lock] of newLocks) {
            if (lock.userId === key) {
              newLocks.delete(blockId);
            }
          }
          return newLocks;
        });
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return;

        // Track initial empty state
        await channel.track({
          blockId: null,
          blockType: 'other',
          userName,
          userColor,
          lockedAt: new Date().toISOString(),
        });
      });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [proposalId, sectionId, user, userName, userColor]);

  // Update current block when selection changes
  const updateCurrentBlock = useCallback(async (pos: number | null) => {
    const now = Date.now();
    if (now - lastUpdateRef.current < throttleMs) return;
    lastUpdateRef.current = now;

    if (!channelRef.current || !editor) return;

    let blockId: string | null = null;
    let blockType = 'other';

    if (pos !== null) {
      const blockInfo = getBlockIdFromPosition(editor, pos);
      if (blockInfo) {
        blockId = blockInfo.blockId;
        blockType = blockInfo.blockType;
      }
    }

    // Only update if block changed
    if (blockId === myCurrentBlock) return;
    setMyCurrentBlock(blockId);

    await channelRef.current.track({
      blockId,
      blockType,
      userName,
      userColor,
      lockedAt: new Date().toISOString(),
    });
  }, [editor, userName, userColor, myCurrentBlock]);

  // Check if a block is locked by another user
  const isBlockLocked = useCallback((pos: number): BlockLock | null => {
    if (!editor) return null;
    
    const blockInfo = getBlockIdFromPosition(editor, pos);
    if (!blockInfo) return null;
    
    return blockLocks.get(blockInfo.blockId) || null;
  }, [editor, blockLocks]);

  // Get all locked blocks for visual indicators
  const getLockedBlocks = useCallback((): BlockLock[] => {
    return Array.from(blockLocks.values());
  }, [blockLocks]);

  // Clear current block lock (when leaving section)
  const clearBlockLock = useCallback(async () => {
    if (!channelRef.current) return;
    
    setMyCurrentBlock(null);
    await channelRef.current.track({
      blockId: null,
      blockType: 'other',
      userName,
      userColor,
      lockedAt: new Date().toISOString(),
    });
  }, [userName, userColor]);

  return {
    blockLocks,
    myCurrentBlock,
    updateCurrentBlock,
    isBlockLocked,
    getLockedBlocks,
    clearBlockLock,
    getColorForUser,
  };
}
