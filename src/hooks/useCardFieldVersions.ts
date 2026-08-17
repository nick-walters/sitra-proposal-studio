import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mapFieldVersion, type CardFieldVersion, type CardTextBox } from '@/types/cards';

export const cardFieldVersionsKey = (fieldId: string, textBox: CardTextBox) => [
  'card-field-versions',
  fieldId,
  textBox,
];

/**
 * Version history for ONE text box of a module (header or content). History
 * survives soft deletion of the module and of its parent block.
 */
export function useCardFieldVersions(
  fieldId: string,
  textBox: CardTextBox,
  options?: { enabled?: boolean },
) {
  const queryClient = useQueryClient();

  const { data: versions = [], isLoading, error, refetch } = useQuery({
    queryKey: cardFieldVersionsKey(fieldId, textBox),
    queryFn: async (): Promise<CardFieldVersion[]> => {
      const { data, error } = await supabase
        .from('card_field_versions')
        .select('*')
        .eq('field_id', fieldId)
        .eq('text_box', textBox)
        .order('version_number', { ascending: false });
      if (error) throw error;
      return (data || []).map(mapFieldVersion);
    },
    enabled: !!fieldId && (options?.enabled ?? true),
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
      const { data, error } = await supabase.rpc('save_card_field_version', {
        p_field_id: fieldId,
        p_text_box: textBox,
        p_value: value ?? '',
        p_is_auto_save: isAutoSave,
      });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: cardFieldVersionsKey(fieldId, textBox) }),
    onError: (e: Error) => toast.error(e.message || 'Could not save a version'),
  });

  /** Copy an older version's value back onto the live text box. */
  const revertToVersion = useMutation({
    mutationFn: async (versionId: string) => {
      const version = versions.find((v) => v.id === versionId);
      if (!version) throw new Error('Version not found');
      const value = textBox === 'header' ? version.heading : version.contentHtml;
      const patch =
        textBox === 'header' ? { heading: value } : { content_html: value };
      const { error } = await supabase.from('card_fields').update(patch).eq('id', fieldId);
      if (error) throw error;
      const { error: vErr } = await supabase.rpc('save_card_field_version', {
        p_field_id: fieldId,
        p_text_box: textBox,
        p_value: value ?? '',
        p_is_auto_save: false,
      });
      if (vErr) throw vErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cardFieldVersionsKey(fieldId, textBox) });
      queryClient.invalidateQueries({ queryKey: ['card-fields-batch'] });
      queryClient.invalidateQueries({ queryKey: ['card-fields'] });
      toast.success('Version restored');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not restore that version'),
  });

  const latest = useCallback(() => versions[0] ?? null, [versions]);

  return { versions, latest, isLoading, error: error as Error | null, refetch, saveVersion, revertToVersion };
}
