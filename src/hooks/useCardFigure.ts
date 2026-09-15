import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { invalidateCardFigureSummaries } from './useCardFigureSummaries';
import { invalidateFigureCaptionKinds } from './useFigureCaptionKinds';
import { computeFigureNumbers } from '@/lib/figureNumbering';
import { mapCardFigure, type CardFigureBlockData } from '@/types/cardTable';
import type {
  FigurePageBreakMode,
  FigurePositionMode,
  FigureWidthMode,
} from '@/lib/figureLayout';

export const cardFigureKey = (cardId: string, fieldId?: string | null) => [
  'card-figure',
  cardId,
  fieldId ?? null,
];

/**
 * The three states a figure can be in.
 *  - 'placed'  — held by a live block: numbered, listed under its section.
 *  - 'held_by_deleted_block' — held by a SOFT-DELETED block. The unique index
 *    on card_figure.figure_id still holds the figure, so it cannot be placed
 *    elsewhere; the manager hides it entirely. Restoring the block brings the
 *    figure back with it; purging the block frees the figure, which then
 *    becomes 'unplaced'.
 *  - 'unplaced' — no card_figure row points at it: shown at the top, no number.
 */
export type FigurePlacementState = 'placed' | 'held_by_deleted_block' | 'unplaced';

export interface ProposalFigureOption {
  id: string;
  /** Derived from the placing block; null when the figure is unplaced. */
  figureNumber: string | null;
  title: string;
  figureType: string;
  caption: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any;
  /** Block currently holding this figure, or null when unplaced. */
  placedCardId: string | null;
  placedSectionId: string | null;
  /** "B1.2" — the section of the placing block. */
  placedSectionLabel: string | null;
  state: FigurePlacementState;
}

/**
 * Clears a placement row that still claims `figureId` on behalf of a figure
 * module that has been deleted. Deleting a module releases its figure at the
 * time of deletion (see `useCardMutations.deleteField`); this is the guard for
 * rows that reached the stale state by any other path, so a picture is never
 * permanently held by something that no longer exists.
 */
export async function releaseDefunctModuleClaim(
  figureId: string,
  cardId: string,
  fieldId: string | null,
): Promise<void> {
  const { data: claims } = await supabase
    .from('card_figure')
    .select('card_id, field_id')
    .eq('figure_id', figureId);
  for (const claim of claims ?? []) {
    if (claim.card_id === cardId && (claim.field_id ?? null) === fieldId) continue;
    // Only MODULE claims are released here; a figure held by a soft-deleted
    // BLOCK is a deliberate state — restoring the block brings it back.
    if (!claim.field_id) continue;
    const { data: field } = await supabase
      .from('card_fields')
      .select('id, deleted_at')
      .eq('id', claim.field_id)
      .maybeSingle();
    if (field && !field.deleted_at) continue;
    await supabase.rpc('save_card_figure', {
      p_card_id: claim.card_id,
      p_patch: { figure_id: null },
      p_field_id: claim.field_id,
    });
  }
}


/**
 * Figure placement row. `card_figure` alone decides where a figure renders.
 *
 * With no `fieldId` this is the BLOCK's own figure (`field_id IS NULL`), which
 * is exactly what it has always been. With a `fieldId` it is a figure MODULE
 * sitting among the block's other modules.
 */
export function useCardFigure(cardId: string, fieldId?: string | null) {
  const queryClient = useQueryClient();
  const queryKey = cardFigureKey(cardId, fieldId);

  const query = useQuery({
    queryKey,
    enabled: !!cardId,
    queryFn: async (): Promise<CardFigureBlockData | null> => {
      const base = supabase.from('card_figure').select('*').eq('card_id', cardId);
      const { data, error } = await (fieldId
        ? base.eq('field_id', fieldId)
        : base.is('field_id', null)
      ).maybeSingle();
      if (error) throw error;
      return data ? mapCardFigure(data) : null;
    },
  });

  const save = useMutation({
    mutationFn: async (patch: {
      figure_id?: string | null;
      caption?: string;
      caption_kind?: 'figure' | 'table' | 'none';
      float?: 'none' | 'left' | 'right';
      max_width_cm?: number | null;
      width_mode?: FigureWidthMode;
      custom_width_pct?: number;
      group_with_above?: boolean;
      group_with_below?: boolean;
      position_mode?: FigurePositionMode;
      page_break_mode?: FigurePageBreakMode;
    }) => {
      // A figure can be claimed by exactly one placement row (unique index on
      // card_figure.figure_id). A claim held by a DELETED figure module is
      // defunct — the module is gone and restoring it no longer returns the
      // figure — so release it here rather than refusing the insertion.
      if (patch.figure_id) {
        await releaseDefunctModuleClaim(patch.figure_id, cardId, fieldId ?? null);
      }
      const { error } = await supabase.rpc('save_card_figure', {
        p_card_id: cardId,
        p_patch: patch,
        p_field_id: fieldId ?? null,
      });
      if (error) throw error;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      // Collapsed blocks show the caption as their one-line summary.
      invalidateCardFigureSummaries(queryClient, cardId);
      // Captioning a picture as a table renumbers both sequences on the board.
      invalidateFigureCaptionKinds(queryClient);
    },
    onError: (e: Error) => toast.error(e.message || 'Could not save the figure'),
  });

  return { figureBlock: query.data ?? null, isLoading: query.isLoading, save };
}

/**
 * All figures of a proposal, each annotated with where it is placed and the
 * number DERIVED from that placement. Nothing here reads
 * `figures.figure_number`, `figures.section_id` or `figures.order_index`.
 */
export function useProposalFigures(proposalId: string) {
  return useQuery({
    queryKey: ['figures', proposalId],
    enabled: !!proposalId,
    queryFn: async (): Promise<ProposalFigureOption[]> => {
      const [figRes, placementRes, cardRes, fieldRes] = await Promise.all([
        supabase
          .from('figures')
          .select('id, title, figure_type, caption, content, created_at')
          .eq('proposal_id', proposalId)
          // Soft-deleted figures live in the manager's recycle bin, not here.
          .is('deleted_at', null)
          .order('created_at'),
        supabase
          .from('card_figure')
          .select('card_id, figure_id, field_id')
          .eq('proposal_id', proposalId),
        // Deleted blocks are fetched too: a figure held by a soft-deleted block
        // is a distinct state from an unplaced one.
        supabase
          .from('proposal_cards')
          .select('id, section_id, order_index, deleted_at')
          .eq('proposal_id', proposalId),
        supabase
          .from('card_fields')
          .select('id, order_index, deleted_at, is_visible')
          .eq('proposal_id', proposalId)
          .eq('field_role', 'figure'),
      ]);
      if (figRes.error) throw figRes.error;

      const allCards = cardRes.data ?? [];
      const cards = allCards.filter((c) => !c.deleted_at);
      const sectionIds = Array.from(new Set(cards.map((c) => c.section_id).filter(Boolean))) as string[];
      const sectionRes = sectionIds.length
        ? await supabase
            .from('proposal_template_sections')
            .select('id, section_number, order_index')
            .in('id', sectionIds)
        : { data: [] as { id: string; section_number: string | null; order_index: number | null }[] };
      const sections = sectionRes.data ?? [];

      // Numbering sees LIVE blocks only, so a soft-deleted block numbers nothing.
      const numbers = computeFigureNumbers(
        (placementRes.data ?? []) as {
          card_id: string;
          figure_id: string | null;
          field_id: string | null;
        }[],
        cards as { id: string; section_id: string | null; order_index: number | null }[],
        sections as { id: string; section_number: string | null; order_index: number | null }[],
        (fieldRes.data ?? []) as {
          id: string;
          order_index: number | null;
          deleted_at: string | null;
          is_visible: boolean | null;
        }[],
      );
      const cardById = new Map(allCards.map((c) => [c.id, c]));
      const fieldById = new Map((fieldRes.data ?? []).map((f) => [f.id, f]));
      const sectionById = new Map(sections.map((s) => [s.id, s]));
      const placementByFigure = new Map<
        string,
        { cardId: string; sectionId: string | null; sectionLabel: string | null; deleted: boolean }
      >();
      for (const p of placementRes.data ?? []) {
        if (!p.figure_id) continue;
        const card = cardById.get(p.card_id);
        // A MODULE placement whose module has been deleted (or has vanished
        // altogether) holds nothing: the figure is free and must be listed as
        // unplaced, whatever left the row behind.
        if (p.field_id) {
          const field = fieldById.get(p.field_id);
          if (!field || field.deleted_at) continue;
        }
        // Likewise a placement whose block row no longer exists at all.
        if (!card) continue;
        placementByFigure.set(p.figure_id, {
          cardId: p.card_id,
          sectionId: card?.section_id ?? null,
          sectionLabel: card?.section_id ? sectionById.get(card.section_id)?.section_number ?? null : null,
          deleted: !!card?.deleted_at,
        });

      }

      return (figRes.data ?? []).map((f) => {
        const placement = placementByFigure.get(f.id) ?? null;
        const state: FigurePlacementState = !placement
          ? 'unplaced'
          : placement.deleted
            ? 'held_by_deleted_block'
            : 'placed';
        return {
          id: f.id,
          figureNumber: numbers.get(f.id) ?? null,
          title: f.title,
          figureType: f.figure_type,
          caption: f.caption,
          content: f.content,
          placedCardId: placement?.cardId ?? null,
          placedSectionId: placement?.sectionId ?? null,
          placedSectionLabel: placement?.sectionLabel ?? null,
          state,
        };
      });

    },
  });
}

export interface DeletedFigureOption {
  id: string;
  title: string;
  figureType: string;
  caption: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any;
  deletedAt: string | null;
  purgeAfter: string | null;
}

export const deletedFiguresKey = (proposalId: string) => ['figures-bin', proposalId];

/** The figures recycle bin: soft-deleted figures, newest first. */
export function useDeletedFigures(proposalId: string) {
  return useQuery({
    queryKey: deletedFiguresKey(proposalId),
    enabled: !!proposalId,
    queryFn: async (): Promise<DeletedFigureOption[]> => {
      const { data, error } = await supabase
        .from('figures')
        .select('id, title, figure_type, caption, content, deleted_at, purge_after')
        .eq('proposal_id', proposalId)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((f) => ({
        id: f.id,
        title: f.title,
        figureType: f.figure_type,
        caption: f.caption,
        content: f.content,
        deletedAt: f.deleted_at,
        purgeAfter: f.purge_after,
      }));
    },
  });
}

/**
 * Soft delete and restore. Both go through SECURITY DEFINER RPCs: the server
 * refuses to bin a figure still held by a block (live or soft-deleted) and
 * names the section, so no block is ever silently emptied. There is no hard
 * DELETE grant — the existing purge job clears expired rows.
 */
export function useFigureBinActions(proposalId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['figures', proposalId] });
    queryClient.invalidateQueries({ queryKey: deletedFiguresKey(proposalId) });
  };

  const softDelete = useMutation({
    mutationFn: async (figureId: string) => {
      const { error } = await supabase.rpc('soft_delete_figure', { p_figure_id: figureId });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Figure moved to the recycle bin');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not delete the figure'),
  });

  const restore = useMutation({
    mutationFn: async (figureId: string) => {
      const { error } = await supabase.rpc('restore_figure', { p_figure_id: figureId });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Figure restored to Unplaced');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not restore the figure'),
  });

  return { softDelete, restore };
}
