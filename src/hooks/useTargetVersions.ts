import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mapFieldVersion, type CardFieldVersion } from '@/types/cards';

/**
 * A version target is a pair of a type and a row id, plus the name of the text
 * box being versioned. For a module the text box is 'header' or 'content'; for
 * every other target it is the column that holds the text (or, for a pilot case
 * subsection, its key inside `subsection_content`).
 */
export type VersionTargetType =
  | 'card_field'
  | 'wp_draft'
  | 'wp_draft_task'
  | 'wp_draft_deliverable'
  | 'case_draft'
  | 'case_draft_subsection';

export interface VersionTarget {
  targetType: VersionTargetType;
  targetId: string;
  textBox: string;
}

export const targetVersionsKey = (t: VersionTarget) => [
  'target-versions',
  t.targetType,
  t.targetId,
  t.textBox,
];

interface Options {
  enabled?: boolean;
  /**
   * Version of the underlying row the client last loaded. Passed to the
   * restore RPC so a concurrent edit is rejected rather than overwritten.
   * Ignored for module text boxes, which carry their own per-box counters.
   */
  expectedVersion?: number | null;
  /** Extra query keys to invalidate after a successful restore. */
  invalidateKeys?: readonly unknown[][];
}

/**
 * Version history for one text box of any versioned target. Modules keep their
 * existing behaviour through `useCardFieldVersions`, which wraps this hook.
 */
export function useTargetVersions(target: VersionTarget, options?: Options) {
  const queryClient = useQueryClient();
  const { targetType, targetId, textBox } = target;

  const { data: versions = [], isLoading, error, refetch } = useQuery({
    queryKey: targetVersionsKey(target),
    queryFn: async (): Promise<CardFieldVersion[]> => {
      const { data, error } = await supabase
        .from('card_field_versions')
        .select('*')
        .eq('target_type', targetType)
        .eq('target_id', targetId)
        .eq('text_box', textBox)
        .order('version_number', { ascending: false });
      if (error) throw error;
      return (data || []).map(mapFieldVersion);
    },
    enabled: !!targetId && (options?.enabled ?? true),
  });

  /** Append a snapshot. No-ops server-side when the value is unchanged. */
  const saveVersion = useMutation({
    mutationFn: async ({
      value,
      isAutoSave = true,
    }: {
      value: string | null;
      isAutoSave?: boolean;
    }): Promise<number> => {
      const { data, error } = await supabase.rpc('save_target_version', {
        p_target_type: targetType,
        p_target_id: targetId,
        p_text_box: textBox,
        p_value: value ?? '',
        p_is_auto_save: isAutoSave,
      });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: targetVersionsKey(target) }),
    onError: (e: Error) => toast.error(e.message || 'Could not save a version'),
  });

  /**
   * Copy an older version back onto the live row. The write goes through
   * `restore_target_version`, which itself uses the versioned save path, so a
   * conflicting concurrent edit is rejected rather than clobbered.
   */
  const revertToVersion = useMutation({
    mutationFn: async (versionId: string) => {
      const { data, error } = await supabase.rpc('restore_target_version', {
        p_version_id: versionId,
        p_expected_version: options?.expectedVersion ?? undefined,
      });
      if (error) throw error;
      const result = (data ?? {}) as { ok?: boolean; conflict?: boolean };
      if (result.conflict) throw new Error('Someone else changed this while you were looking');
      if (result.ok === false) throw new Error('Could not restore that version');
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: targetVersionsKey(target) });
      for (const key of options?.invalidateKeys ?? []) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      toast.success('Version restored');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not restore that version'),
  });

  const latest = useCallback(() => versions[0] ?? null, [versions]);

  return {
    versions,
    latest,
    isLoading,
    error: error as Error | null,
    refetch,
    saveVersion,
    revertToVersion,
  };
}
