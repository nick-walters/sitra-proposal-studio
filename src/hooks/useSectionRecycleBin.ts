import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cardFieldsKey } from './useCardFields';
import { sectionCardsKey } from './useSectionCards';
import type { CardDeletionEntry } from '@/types/cards';

/**
 * Deleted cards and fields awaiting restore or purge.
 * Pass a sectionId to scope the bin to one section, or omit it for the whole proposal.
 */
export function useSectionRecycleBin(proposalId: string, sectionId?: string) {
  const queryClient = useQueryClient();
  const queryKey = ['card-recycle-bin', proposalId, sectionId ?? 'all'];

  const { data: entries = [], isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: async (): Promise<CardDeletionEntry[]> => {
      let query = supabase
        .from('card_deletions')
        .select('*')
        .eq('proposal_id', proposalId)
        .is('restored_at', null)
        .order('deleted_at', { ascending: false });
      if (sectionId) query = query.eq('section_id', sectionId);

      const { data, error } = await query;
      if (error) throw error;
      const rows = data || [];

      const cardIds = rows.filter((r) => r.target_type === 'card').map((r) => r.target_id);
      const fieldIds = rows.filter((r) => r.target_type === 'field').map((r) => r.target_id);

      const labels = new Map<string, string | null>();
      const previews = new Map<string, string>();
      const fieldCounts = new Map<string, number>();
      const figureBlocks = new Map<
        string,
        { caption: string | null; imagePath: string | null; title: string | null }
      >();

      if (cardIds.length) {
        const { data: cards } = await supabase
          .from('proposal_cards')
          .select('id, title')
          .in('id', cardIds);
        for (const c of cards || []) labels.set(c.id, c.title || null);

        const { data: cardFields } = await supabase
          .from('card_fields')
          .select('card_id, content_html, order_index')
          .in('card_id', cardIds)
          .order('order_index');
        for (const f of cardFields || []) {
          fieldCounts.set(f.card_id, (fieldCounts.get(f.card_id) ?? 0) + 1);
          previews.set(
            f.card_id,
            `${previews.get(f.card_id) ?? ''}${f.content_html ?? ''}`,
          );
        }
      }

      // Figure blocks carry no text, so the bin needs the caption and a
      // thumbnail to identify them, mirroring the heading + preview of a text
      // block.
      if (cardIds.length) {
        const { data: figBlocks } = await supabase
          .from('card_figure')
          .select('card_id, figure_id, caption')
          .in('card_id', cardIds);
        const figureIds = (figBlocks || []).map((b) => b.figure_id).filter(Boolean) as string[];
        const { data: figs } = figureIds.length
          ? await supabase.from('figures').select('id, title, content').in('id', figureIds)
          : { data: [] as { id: string; title: string; content: any }[] };
        const figById = new Map((figs || []).map((f) => [f.id, f]));
        for (const b of figBlocks || []) {
          const fig = b.figure_id ? figById.get(b.figure_id) : null;
          figureBlocks.set(b.card_id, {
            caption: b.caption || null,
            imagePath: (fig?.content as any)?.imageUrl ?? null,
            title: fig?.title ?? null,
          });
        }
      }

      if (fieldIds.length) {
        const { data: fields } = await supabase
          .from('card_fields')
          .select('id, heading, heading_enabled, content_html')
          .in('id', fieldIds);
        for (const f of fields || []) {
          labels.set(f.id, f.heading_enabled ? (f.heading || null) : null);
          previews.set(f.id, f.content_html ?? '');
        }
      }

      return rows.map((r) => ({
        id: r.id,
        proposalId: r.proposal_id,
        sectionId: r.section_id ?? null,
        targetType: r.target_type as 'card' | 'field',
        targetId: r.target_id,
        parentCardId: r.parent_card_id ?? null,
        deletedAt: r.deleted_at,
        deletedBy: r.deleted_by ?? null,
        purgeAfter: r.purge_after ?? null,
        restoredAt: r.restored_at ?? null,
        restoredBy: r.restored_by ?? null,
        label: labels.get(r.target_id) ?? null,
        contentHtml: previews.get(r.target_id) ?? null,
        fieldCount: r.target_type === 'card' ? (fieldCounts.get(r.target_id) ?? 0) : null,
        figureCaption: figureBlocks.get(r.target_id)?.caption ?? null,
        figureImagePath: figureBlocks.get(r.target_id)?.imagePath ?? null,
        figureTitle: figureBlocks.get(r.target_id)?.title ?? null,
      }));

    },
    enabled: !!proposalId,
  });

  const invalidateAll = (cardId?: string | null) => {
    queryClient.invalidateQueries({ queryKey: ['card-recycle-bin', proposalId] });
    if (sectionId) {
      queryClient.invalidateQueries({ queryKey: sectionCardsKey(proposalId, sectionId) });
    } else {
      queryClient.invalidateQueries({ queryKey: ['section-cards', proposalId] });
    }
    if (cardId) queryClient.invalidateQueries({ queryKey: cardFieldsKey(cardId) });
    queryClient.invalidateQueries({ queryKey: ['card-fields-batch'] });
  };

  const restoreCard = useMutation({
    mutationFn: async (cardId: string) => {
      const { data, error } = await supabase.rpc('restore_card', { p_card_id: cardId });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, cardId) => {
      invalidateAll(cardId);
      toast.success('Block restored');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not restore the block'),
  });

  const restoreField = useMutation({
    mutationFn: async (fieldId: string) => {
      const { data, error } = await supabase.rpc('restore_card_field', { p_field_id: fieldId });
      if (error) throw error;
      return data as { card_id?: string; restored_parent_card?: boolean } | null;
    },
    onSuccess: (data) => {
      invalidateAll(data?.card_id ?? null);
      toast.success(
        data?.restored_parent_card ? 'Module restored, along with its block' : 'Module restored',
      );
    },
    onError: (e: Error) => toast.error(e.message || 'Could not restore the module'),
  });

  return {
    entries,
    cardEntries: entries.filter((e) => e.targetType === 'card'),
    fieldEntries: entries.filter((e) => e.targetType === 'field'),
    isLoading,
    error: error as Error | null,
    refetch,
    restoreCard,
    restoreField,
  };
}
