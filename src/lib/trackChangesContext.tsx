/**
 * Platform-wide "track my changes" setting.
 *
 * ONE setting per user, stored on `profiles.track_changes_enabled` — not in
 * localStorage — so it follows the user across sessions and devices. Every
 * rich text field on the platform reads it through `useRichTextEditor`, so
 * turning it on records the user's edits everywhere they type: Part B blocks,
 * WP drafts, case drafts, milestones and risks.
 *
 * Recording only. Accept and reject are deliberately NOT part of this layer.
 */

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProposalUserColors } from '@/hooks/useProposalUserColors';

export interface TrackChangesSetting {
  /** The user's own setting. Individual fields may force recording on top. */
  enabled: boolean;
  /** True while the stored setting has not loaded yet. */
  loading: boolean;
  setEnabled: (next: boolean) => void;
  toggle: () => void;
  authorId: string;
  authorName: string;
  authorColor: string;
}

const TrackChangesContext = createContext<TrackChangesSetting | null>(null);

export function TrackChangesProvider({
  proposalId,
  children,
}: {
  proposalId: string | undefined;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? '';

  const { getUserColor, getUserName } = useProposalUserColors(proposalId);

  const { data, isLoading } = useQuery({
    queryKey: ['track-changes-setting', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('track_changes_enabled, full_name')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      return {
        enabled: !!data?.track_changes_enabled,
        fullName: (data?.full_name as string | null) || null,
      };
    },
  });

  const mutation = useMutation({
    mutationFn: async (next: boolean) => {
      const { error } = await supabase
        .from('profiles')
        .update({ track_changes_enabled: next })
        .eq('id', userId);
      if (error) throw error;
      return next;
    },
    onMutate: async (next: boolean) => {
      // Optimistic: the toolbar must flip instantly, the write follows.
      queryClient.setQueryData(['track-changes-setting', userId], (old: any) => ({
        ...(old ?? { fullName: null }),
        enabled: next,
      }));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['track-changes-setting', userId] });
    },
  });

  const setEnabled = useCallback(
    (next: boolean) => {
      if (!userId) return;
      mutation.mutate(next);
    },
    [mutation, userId],
  );

  const value = useMemo<TrackChangesSetting>(() => {
    const enabled = !!data?.enabled;
    const resolved = userId ? getUserName?.(userId) : '';
    const authorName =
      (resolved && resolved !== 'Unknown' ? resolved : '') ||
      data?.fullName ||
      (user?.user_metadata as any)?.full_name ||
      user?.email?.split('@')[0] ||
      'Anonymous';
    return {
      enabled,
      loading: isLoading,
      setEnabled,
      toggle: () => setEnabled(!enabled),
      authorId: userId,
      authorName,
      authorColor: (userId && getUserColor?.(userId)) || '#3B82F6',
    };
  }, [data, isLoading, setEnabled, userId, user, getUserColor, getUserName]);

  return <TrackChangesContext.Provider value={value}>{children}</TrackChangesContext.Provider>;
}

/**
 * The platform-wide setting, or `null` outside a provider (template admin,
 * exports and other non-proposal surfaces never record tracked changes).
 */
export function useTrackChangesSetting(): TrackChangesSetting | null {
  return useContext(TrackChangesContext);
}
