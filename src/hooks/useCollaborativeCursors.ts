import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { PRESENCE_COLORS } from '@/lib/constants';

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

// Get consistent color for a user based on their ID
function getColorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length];
}

export function useCollaborativeCursors({ proposalId, currentSectionId }: UseCollaborativeCursorsProps) {
  const [collaborators, setCollaborators] = useState<CollaboratorCursor[]>([]);
  const { user } = useAuth();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastCursorUpdateRef = useRef<number>(0);
  const throttleMs = 50; // Throttle cursor updates to 50ms

  useEffect(() => {
    if (!proposalId || !user) return;

    // Defensive teardown: if a prior channel is still attached (e.g. due to
    // a rapid re-run before async cleanup completed), remove it first so
    // the Realtime client doesn't hand us back an already-subscribed
    // channel for the same topic (which would throw
    // "cannot add `presence` callbacks ... after subscribe()" below).
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase.channel(`proposal:${proposalId}:cursors`, {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    channelRef.current = channel;

    // IMPORTANT: register presence callbacks BEFORE subscribe(). track()
    // is called inside the subscribe status callback (post-SUBSCRIBED),
    // which is the correct place to push initial presence state.
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
      .on('presence', { event: 'join' }, () => {
        // User joined presence channel
      })
      .on('presence', { event: 'leave' }, () => {
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
      if (channelRef.current === channel) {
        channelRef.current = null;
      }
    };
    // Depend on user?.id (stable string) rather than the whole user object
    // to avoid spurious re-runs from new auth-object references.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalId, user?.id]);


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
