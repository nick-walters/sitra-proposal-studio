import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface Collaborator {
  id: string;
  name: string;
  email: string;
  sectionId: string | null;
  cursorPosition?: { line: number; ch: number };
  online_at: string;
}

interface UseRealtimePresenceProps {
  proposalId: string;
  currentSectionId: string | null;
}

export function useRealtimePresence({ proposalId, currentSectionId }: UseRealtimePresenceProps) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    if (!proposalId || !user) return;

    const channel = supabase.channel(`proposal:${proposalId}:presence`, {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users: Collaborator[] = [];
        
        for (const [, presences] of Object.entries(state)) {
          const presence = presences[0] as unknown as Collaborator;
          if (presence.id !== user.id) {
            users.push(presence);
          }
        }
        
        setCollaborators(users);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('User joined:', key, newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('User left:', key, leftPresences);
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return;

        await channel.track({
          id: user.id,
          name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Anonymous',
          email: user.email,
          sectionId: currentSectionId,
          online_at: new Date().toISOString(),
        });
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [proposalId, user]);

  // Update section when it changes
  const updateSection = useCallback(async (sectionId: string | null) => {
    if (!proposalId || !user) return;

    const channel = supabase.channel(`proposal:${proposalId}:presence`);
    
    await channel.track({
      id: user.id,
      name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Anonymous',
      email: user.email,
      sectionId,
      online_at: new Date().toISOString(),
    });
  }, [proposalId, user]);

  useEffect(() => {
    updateSection(currentSectionId);
  }, [currentSectionId, updateSection]);

  return {
    collaborators,
    updateSection,
  };
}
