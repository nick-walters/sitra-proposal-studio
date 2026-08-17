import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mapFieldVersion, type CardFieldVersion } from '@/types/cards';

export const cardFieldVersionsKey = (fieldId: string) => ['card-field-versions', fieldId];

/**
 * Version history for a single card field. History survives soft deletion of
 * the field and of its parent card.
 */
export function useCardFieldVersions(fieldId: string, options?: { enabled?: boolean }) {
  const queryClient = useQueryClient();

  const { data: versions = [], isLoading, error, refetch } = useQuery({
    queryKey: cardFieldVersionsKey(fieldId),
    queryFn: async (): Promise<CardFieldVersion[]> => {
      const { data, error } = await supabase
        .from('card_field_versions')
        .select('*')
        .eq('field_id', fieldId)
        .order('version_number', { ascending: false });
      if (error) throw error;
      return (data || []).map(mapFieldVersion);
    },
    enabled: !!fieldId && (options?.enabled ?? true),
  });

  /** Append a snapshot. No-ops server-side when content is unchanged. */
  const saveVersion = useMutation({
    mutationFn: async ({
      contentHtml,
      heading,
      isAutoSave = true,
    }: {
      contentHtml: string | null;
      heading?: string | null;
      isAutoSave?: boolean;
    }): Promise<number> => {
      const { data, error } = await supabase.rpc('save_card_field_version', {
        p_field_id: fieldId,
        p_content_html: contentHtml,
        p_heading: heading ?? null,
        p_is_auto_save: isAutoSave,
      });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cardFieldVersionsKey(fieldId) }),
    onError: (e: Error) => toast.error(e.message || 'Could not save a version'),
  });

  /** Copy an older version's content back onto the live field. */
  const revertToVersion = useMutation({
    mutationFn: async (versionId: string) => {
      const version = versions.find((v) => v.id === versionId);
      if (!version) throw new Error('Version not found');
      const { error } = await supabase
        .from('card_fields')
        .update({ content_html: version.contentHtml, heading: version.heading })
        .eq('id', fieldId);
      if (error) throw error;
      const { error: vErr } = await supabase.rpc('save_card_field_version', {
        p_field_id: fieldId,
        p_content_html: version.contentHtml,
        p_heading: version.heading,
        p_is_auto_save: false,
      });
      if (vErr) throw vErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cardFieldVersionsKey(fieldId) });
      queryClient.invalidateQueries({ queryKey: ['card-fields-batch'] });
      toast.success('Version restored');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not restore that version'),
  });

  const latest = useCallback(() => versions[0] ?? null, [versions]);

  return { versions, latest, isLoading, error: error as Error | null, refetch, saveVersion, revertToVersion };
}
