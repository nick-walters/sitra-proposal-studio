import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface CursorPosition {
  line: number;
  ch: number;
  // Position in document coordinates for overlay rendering
  top?: number;
  left?: number;
}

export interface CollaboratorCursor {
  id: string;
  name: string;
  email: string;
  color: string;
  sectionId: string | null;
  cursorPosition: CursorPosition | null;
  selectionRange?: { from: number; to: number } | null;
  online_at: string;
  avatar_url?: string | null;
}

interface UseCollaborativeCursorsProps {
  proposalId: string;
  currentSectionId: string | null;
}

// Predefined colors for collaborators - vibrant and distinct
const COLLABORATOR_COLORS = [
  '#E91E63', // Pink
  '#9C27B0', // Purple
  '#673AB7', // Deep Purple
  '#3F51B5', // Indigo
  '#2196F3', // Blue
  '#00BCD4', // Cyan
  '#009688', // Teal
  '#4CAF50', // Green
  '#FF9800', // Orange
  '#FF5722', // Deep Orange
];

// Get consistent color for a user based on their ID
function getColorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return COLLABORATOR_COLORS[Math.abs(hash) % COLLABORATOR_COLORS.length];
}

export function useCollaborativeCursors({ proposalId, currentSectionId }: UseCollaborativeCursorsProps) {
  const [collaborators, setCollaborators] = useState<CollaboratorCursor[]>([]);
  const { user } = useAuth();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastCursorUpdateRef = useRef<number>(0);
  const throttleMs = 50; // Throttle cursor updates to 50ms

  useEffect(() => {
    if (!proposalId || !user) return;

    const channel = supabase.channel(`proposal:${proposalId}:cursors`, {
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
        const users: CollaboratorCursor[] = [];
        
        for (const [, presences] of Object.entries(state)) {
          const presence = presences[0] as unknown as CollaboratorCursor;
          if (presence.id !== user.id) {
            users.push({
              ...presence,
              color: getColorForUser(presence.id),
            });
          }
        }
        
        setCollaborators(users);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        // User joined presence channel
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        // User left presence channel
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return;

        await channel.track({
          id: user.id,
          name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Anonymous',
          email: user.email,
          sectionId: currentSectionId,
          cursorPosition: null,
          selectionRange: null,
          online_at: new Date().toISOString(),
          avatar_url: user.user_metadata?.avatar_url || null,
        });
      });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [proposalId, user]);

  // Update cursor position with throttling
  const updateCursorPosition = useCallback(async (
    position: CursorPosition | null,
    selectionRange?: { from: number; to: number } | null
  ) => {
    const now = Date.now();
    if (now - lastCursorUpdateRef.current < throttleMs) return;
    lastCursorUpdateRef.current = now;

    if (!channelRef.current || !user) return;

    await channelRef.current.track({
      id: user.id,
      name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Anonymous',
      email: user.email,
      sectionId: currentSectionId,
      cursorPosition: position,
      selectionRange: selectionRange || null,
      online_at: new Date().toISOString(),
      avatar_url: user.user_metadata?.avatar_url || null,
    });
  }, [user, currentSectionId]);

  // Update section when it changes
  const updateSection = useCallback(async (sectionId: string | null) => {
    if (!channelRef.current || !user) return;

    await channelRef.current.track({
      id: user.id,
      name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Anonymous',
      email: user.email,
      sectionId,
      cursorPosition: null,
      selectionRange: null,
      online_at: new Date().toISOString(),
      avatar_url: user.user_metadata?.avatar_url || null,
    });
  }, [user]);

  useEffect(() => {
    updateSection(currentSectionId);
  }, [currentSectionId, updateSection]);

  // Get collaborators in the current section
  const collaboratorsInSection = collaborators.filter(
    c => c.sectionId === currentSectionId
  );

  return {
    collaborators,
    collaboratorsInSection,
    updateCursorPosition,
    updateSection,
    getColorForUser,
  };
}
