/**
 * Whole-proposal search fields.
 *
 * The page sources only know about the surface that is mounted, so a search
 * from one Part B page could never see the others. This hook reads the STORED
 * Part B content of the whole proposal — every block title and every module
 * header and body, in every section — straight from `proposal_cards` and
 * `card_fields`, and hands it to the find panel as ordinary searchable fields.
 *
 * These fields are deliberately READ-ONLY. Writing to a section that is not
 * open would bypass that editor's own save path, its track-changes handling
 * and its version history, so replacement stays on the open page.
 */

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { htmlToPlainText } from '@/lib/htmlToPlainText';
import { jumpToElementId } from '@/lib/jumpToElement';
import type { SearchableField } from './types';

interface CardRow {
  id: string;
  section_id: string;
  title: string | null;
  is_visible: boolean;
  order_index: number;
}

interface FieldRow {
  id: string;
  card_id: string;
  heading: string | null;
  content_html: string | null;
  is_visible: boolean;
  order_index: number;
}

/** Opens the section that holds the match, then scrolls to it. */
function revealElsewhere(sectionId: string, domId: string) {
  return async () => {
    window.dispatchEvent(
      new CustomEvent('open-proposal-section', { detail: { sectionId } }),
    );
    await jumpToElementId(domId);
  };
}

export function useProposalWideFields(enabled: boolean): SearchableField[] {
  const { id: proposalId } = useParams<{ id: string }>();

  const { data = [] } = useQuery({
    queryKey: ['proposal-wide-search-fields', proposalId],
    enabled: enabled && !!proposalId,
    staleTime: 30_000,
    queryFn: async (): Promise<SearchableField[]> => {
      const [cardsRes, sectionsRes] = await Promise.all([
        supabase
          .from('proposal_cards')
          .select('id, section_id, title, is_visible, order_index')
          .eq('proposal_id', proposalId!)
          .eq('document', 'part_b')
          .is('deleted_at', null)
          .order('order_index'),
        supabase
          .from('proposal_template_sections')
          .select('id, section_number, title'),
      ]);
      if (cardsRes.error) throw cardsRes.error;

      const cards = (cardsRes.data ?? []) as CardRow[];
      if (cards.length === 0) return [];

      const sectionLabels = new Map<string, string>();
      for (const s of (sectionsRes.data ?? []) as {
        id: string;
        section_number: string | null;
        title: string | null;
      }[]) {
        sectionLabels.set(s.id, [s.section_number, s.title].filter(Boolean).join(' '));
      }

      const { data: fieldRows, error: fErr } = await supabase
        .from('card_fields')
        .select('id, card_id, heading, content_html, is_visible, order_index')
        .in('card_id', cards.map((c) => c.id))
        .is('deleted_at', null)
        .order('order_index');
      if (fErr) throw fErr;

      const byCard = new Map<string, FieldRow[]>();
      for (const row of (fieldRows ?? []) as FieldRow[]) {
        const list = byCard.get(row.card_id);
        if (list) list.push(row);
        else byCard.set(row.card_id, [row]);
      }

      const out: SearchableField[] = [];
      for (const card of cards) {
        const sectionLabel = sectionLabels.get(card.section_id) ?? 'Part B';
        const cardLabel = htmlToPlainText(card.title ?? '').trim() || 'Untitled block';
        const cardHidden = !card.is_visible;

        if (card.title) {
          out.push({
            id: `card:${card.id}:title`,
            label: `${sectionLabel} › ${cardLabel} › block title`,
            groupId: card.id,
            groupLabel: `${sectionLabel} › ${cardLabel}`,
            hidden: cardHidden,
            format: 'html',
            value: card.title,
            readOnly: true,
            reveal: revealElsewhere(card.section_id, `card-block-${card.id}`),
          });
        }

        for (const field of byCard.get(card.id) ?? []) {
          const hidden = cardHidden || !field.is_visible;
          const reveal = revealElsewhere(card.section_id, `card-module-${field.id}`);
          if (field.heading) {
            out.push({
              id: `field:${field.id}:header`,
              label: `${sectionLabel} › ${cardLabel} › module header`,
              groupId: card.id,
              groupLabel: `${sectionLabel} › ${cardLabel}`,
              hidden,
              format: 'html',
              value: field.heading,
              readOnly: true,
              reveal,
            });
          }
          if (field.content_html) {
            out.push({
              id: `field:${field.id}:content`,
              label:
                `${sectionLabel} › ${cardLabel} › ` +
                (htmlToPlainText(field.heading ?? '').trim() || 'module content'),
              groupId: card.id,
              groupLabel: `${sectionLabel} › ${cardLabel}`,
              hidden,
              format: 'html',
              value: field.content_html,
              readOnly: true,
              reveal,
            });
          }
        }
      }
      return out;
    },
  });

  return data;
}
