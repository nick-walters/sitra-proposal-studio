import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cardFieldsKey } from './useCardFields';
import { sectionCardsKey } from './useSectionCards';
import { mapCard, mapField, type CardAnchor, type CardField, type CardKind, type ProposalCard } from '@/types/cards';

interface CreateCardInput {
  kind: CardKind;
  title?: string | null;
  document?: 'part_b' | 'fstp_annex';
  /** Cards created from the UI always land at the bottom of the free band. */
  anchor?: CardAnchor;
  isHideable?: boolean;
  renderGroup?: string | null;
  fields?: { heading?: string | null; contentHtml?: string | null }[];
}

interface CreateFieldInput {
  cardId: string;
  heading?: string | null;
  contentHtml?: string | null;
  fieldRole?: CardField['fieldRole'];
}

/**
 * Create / update / reorder / bin operations for cards and their fields.
 */
export function useCardMutations(proposalId: string, sectionId: string) {
  const queryClient = useQueryClient();
  const cardsKey = sectionCardsKey(proposalId, sectionId);

  const invalidateCards = () => queryClient.invalidateQueries({ queryKey: cardsKey });
  const invalidateFields = (cardId: string) => {
    queryClient.invalidateQueries({ queryKey: cardFieldsKey(cardId) });
    queryClient.invalidateQueries({ queryKey: ['card-fields-batch'] });
  };
  const invalidateBin = () =>
    queryClient.invalidateQueries({ queryKey: ['card-recycle-bin', proposalId] });
  const invalidateCitations = () => {
    queryClient.invalidateQueries({ queryKey: ['reference-data', proposalId] });
    queryClient.invalidateQueries({ queryKey: ['section-citation-sources', proposalId] });
    window.dispatchEvent(new CustomEvent('cross-ref-data-changed'));
  };

  const createCard = useMutation({
    mutationFn: async (_input?: CreateCardInput): Promise<string> => {
      const { data, error } = await supabase.rpc('create_manual_text_card', {
        p_section_id: sectionId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (cardId) => {
      invalidateCards();
      invalidateFields(cardId);
      toast.success('Block added');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not create the block'),
  });


  // Table blocks were removed — a table inside a text block covers that need.



  /** Figure block: created empty; the block itself offers the figure options. */
  const createFigureCard = useMutation({
    mutationFn: async (): Promise<string> => {
      const { data, error } = await supabase.rpc('create_figure_card', {
        p_section_id: sectionId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      invalidateCards();
      toast.success('Figure block added');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not create the figure block'),
  });

  const updateCard = useMutation({
    mutationFn: async ({
      cardId,
      title,
      isVisible,
      renderGroup,
    }: {
      cardId: string;
      title?: string | null;
      isVisible?: boolean;
      renderGroup?: string | null;
    }) => {
      const patch: Partial<{ title: string | null; is_visible: boolean; render_group: string | null }> = {};
      if (title !== undefined) patch.title = title;
      if (isVisible !== undefined) patch.is_visible = isVisible;
      if (renderGroup !== undefined) patch.render_group = renderGroup;
      if (Object.keys(patch).length === 0) return;
      const { error } = await supabase.from('proposal_cards').update(patch).eq('id', cardId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateCards();
      invalidateCitations();
    },
    onError: (e: Error) => toast.error(e.message || 'Could not update the block'),
  });

  /** Reorder the free band. `orderedFreeCardIds` is the full new order of free cards. */
  const reorderCards = useMutation({
    mutationFn: async (orderedFreeCardIds: string[]) => {
      const { error } = await supabase.rpc('reorder_section_cards', {
        p_section_id: sectionId,
        p_card_ids: orderedFreeCardIds,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateCards();
      invalidateCitations();
    },
    onError: (e: Error) => toast.error(e.message || 'Could not reorder the blocks'),
  });

  const createField = useMutation({
    mutationFn: async (input: CreateFieldInput): Promise<CardField> => {
      // Server-side so the index accounts for soft-deleted rows still holding a slot.
      const { data: newId, error } = await supabase.rpc('create_card_field', {
        p_card_id: input.cardId,
        p_heading: input.heading ?? null,
        p_content_html: input.contentHtml ?? '',
        p_field_role: input.fieldRole ?? 'narrative',
      });
      if (error) throw error;
      const { data, error: readErr } = await supabase
        .from('card_fields')
        .select('*')
        .eq('id', newId as string)
        .single();
      if (readErr) throw readErr;
      return mapField(data);
    },
    onSuccess: (field) => invalidateFields(field.cardId),
    onError: (e: Error) => toast.error(e.message || 'Could not add the module'),
  });


  /**
   * Metadata-only field update. Content is deliberately NOT accepted here: it
   * must go through `save_card_text`, which carries the version check.
   */
  const updateField = useMutation({
    mutationFn: async ({
      fieldId,
      cardId: _cardId,
      heading,
      headingEnabled,
      assignedParticipantId,
      isVisible,
    }: {
      fieldId: string;
      cardId: string;
      heading?: string | null;
      headingEnabled?: boolean;
      assignedParticipantId?: string | null;
      isVisible?: boolean;
    }) => {
      const patch: Partial<{
        heading: string | null;
        heading_enabled: boolean;
        assigned_participant_id: string | null;
        is_visible: boolean;
      }> = {};
      if (heading !== undefined) patch.heading = heading;
      if (headingEnabled !== undefined) patch.heading_enabled = headingEnabled;
      if (isVisible !== undefined) patch.is_visible = isVisible;
      if (assignedParticipantId !== undefined) patch.assigned_participant_id = assignedParticipantId;
      if (Object.keys(patch).length === 0) return;
      const { error } = await supabase.from('card_fields').update(patch).eq('id', fieldId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => invalidateFields(vars.cardId),
    onError: (e: Error) => toast.error(e.message || 'Could not save the module'),
  });

  const reorderFields = useMutation({
    mutationFn: async ({ cardId, orderedFieldIds }: { cardId: string; orderedFieldIds: string[] }) => {
      const { error } = await supabase.rpc('reorder_card_fields', {
        p_card_id: cardId,
        p_field_ids: orderedFieldIds,
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => invalidateFields(vars.cardId),
    onError: (e: Error) => toast.error(e.message || 'Could not reorder the modules'),
  });

  const deleteCard = useMutation({
    mutationFn: async (cardId: string) => {
      const { error } = await supabase.rpc('soft_delete_card', { p_card_id: cardId });
      if (error) throw error;
    },
    onSuccess: (_d, cardId) => {
      invalidateCards();
      invalidateFields(cardId);
      invalidateBin();
      invalidateCitations();
      toast.success('Block moved to the recycle bin');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not delete the block'),
  });

  const deleteField = useMutation({
    mutationFn: async ({ fieldId, cardId: _cardId }: { fieldId: string; cardId: string }) => {
      const { error } = await supabase.rpc('soft_delete_card_field', { p_field_id: fieldId });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      invalidateFields(vars.cardId);
      invalidateBin();
      invalidateCitations();
      toast.success('Module moved to the recycle bin');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not delete the module'),
  });


  const seedCards = useMutation({
    mutationFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('seed_proposal_cards', { p_proposal_id: proposalId });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: invalidateCards,
    onError: (e: Error) => toast.error(e.message || 'Could not seed the blocks'),
  });

  return {
    createCard,
    createFigureCard,
    updateCard,
    reorderCards,
    createField,
    updateField,
    reorderFields,
    deleteCard,
    deleteField,
    seedCards,
  };
}
