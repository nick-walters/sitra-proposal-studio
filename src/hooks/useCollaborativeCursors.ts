import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { PRESENCE_COLORS } from '@/lib/constants';

export interface CursorPosition {
  line: number;
  ch: number;
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
  /** Set false to skip joining presence (situational consumers). Defaults to true. */
  enabled?: boolean;
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

// =====================================================================
// Shared cursors-channel registry (ref-counted, one channel per proposal)
// =====================================================================

type RawPresence = Omit<CollaboratorCursor, 'color'>;

interface PresenceEntry {
  channel: ReturnType<typeof supabase.channel>;
  refCount: number;
  state: RawPresence[];
  listeners: Set<(state: RawPresence[]) => void>;
  ownerUserId: string;
  subscribed: boolean;
}

const registry = new Map<string, PresenceEntry>();

function notify(entry: PresenceEntry) {
  for (const l of entry.listeners) l(entry.state);
}

function acquirePresence(
  proposalId: string,
  user: { id: string; email?: string | null; user_metadata?: any },
): PresenceEntry {
  let entry = registry.get(proposalId);
  if (entry) {
    entry.refCount += 1;
    return entry;
  }

  const channel = supabase.channel(`proposal:${proposalId}:cursors`, {
    config: { presence: { key: user.id } },
  });

  entry = {
    channel,
    refCount: 1,
    state: [],
    listeners: new Set(),
    ownerUserId: user.id,
    subscribed: false,
  };
  registry.set(proposalId, entry);

  // Register presence handlers BEFORE subscribe()
  channel
    .on('presence', { event: 'sync' }, () => {
      const raw = channel.presenceState();
      const users: RawPresence[] = [];
      for (const [, presences] of Object.entries(raw)) {
        const presence = (presences as any[])[0] as RawPresence;
        if (presence?.id && presence.id !== user.id) {
          users.push(presence);
        }
      }
      entry!.state = users;
      notify(entry!);
    })
    .on('presence', { event: 'join' }, () => { /* noop */ })
    .on('presence', { event: 'leave' }, () => { /* noop */ })
    .subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return;
      entry!.subscribed = true;
      await channel.track({
        id: user.id,
        name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Anonymous',
        email: user.email,
        sectionId: null,
        cursorPosition: null,
        selectionRange: null,
        online_at: new Date().toISOString(),
        avatar_url: user.user_metadata?.avatar_url || null,
      });
    });

  return entry;
}

function releasePresence(proposalId: string) {
  const entry = registry.get(proposalId);
  if (!entry) return;
  entry.refCount -= 1;
  if (entry.refCount > 0) return;

  registry.delete(proposalId);
  // Fire-and-forget teardown
  try {
    if (entry.subscribed) {
      void entry.channel.untrack();
    }
  } catch {
    /* ignore */
  }
  supabase.removeChannel(entry.channel);
}

export function useCollaborativeCursors({
  proposalId,
  currentSectionId,
  enabled = true,
}: UseCollaborativeCursorsProps) {
  const [collaborators, setCollaborators] = useState<CollaboratorCursor[]>([]);
  const { user } = useAuth();
  const entryRef = useRef<PresenceEntry | null>(null);
  const lastCursorUpdateRef = useRef<number>(0);
  const throttleMs = 50;

  const userId = user?.id;
  const isActive = enabled && !!proposalId && !!userId;

  useEffect(() => {
    if (!isActive || !user) return;

    const entry = acquirePresence(proposalId, user);
    entryRef.current = entry;

    const listener = (raw: RawPresence[]) => {
      setCollaborators(raw.map((p) => ({ ...p, color: getColorForUser(p.id) })));
    };
    entry.listeners.add(listener);
    // Seed with current state immediately for additional consumers
    listener(entry.state);

    return () => {
      entry.listeners.delete(listener);
      entryRef.current = null;
      releasePresence(proposalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalId, userId, isActive]);

  const trackSelf = useCallback(
    async (
      sectionId: string | null,
      cursorPosition: CursorPosition | null,
      selectionRange: { from: number; to: number } | null,
    ) => {
      const entry = entryRef.current;
      if (!entry || !user || !entry.subscribed) return;
      await entry.channel.track({
        id: user.id,
        name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Anonymous',
        email: user.email,
        sectionId,
        cursorPosition,
        selectionRange,
        online_at: new Date().toISOString(),
        avatar_url: user.user_metadata?.avatar_url || null,
      });
    },
    [user],
  );

  const updateCursorPosition = useCallback(
    async (
      position: CursorPosition | null,
      selectionRange?: { from: number; to: number } | null,
    ) => {
      const now = Date.now();
      if (now - lastCursorUpdateRef.current < throttleMs) return;
      lastCursorUpdateRef.current = now;
      await trackSelf(currentSectionId, position, selectionRange || null);
    },
    [trackSelf, currentSectionId],
  );

  const updateSection = useCallback(
    async (sectionId: string | null) => {
      await trackSelf(sectionId, null, null);
    },
    [trackSelf],
  );

  useEffect(() => {
    if (!isActive) return;
    updateSection(currentSectionId);
  }, [currentSectionId, updateSection, isActive]);

  const collaboratorsInSection = collaborators.filter(
    (c) => c.sectionId === currentSectionId,
  );

  return {
    collaborators,
    collaboratorsInSection,
    updateCursorPosition,
    updateSection,
    getColorForUser,
  };
}
