/**
 * Reads one section's BLOCK TREE and assembles a complete Typst document.
 *
 * Blocks are ordered head → free → tail then by `order_index`, hidden and
 * soft-deleted blocks are excluded, and each block's modules come back in
 * `order_index` order. Legacy `section_content` is deliberately out of scope:
 * this path renders blocks only.
 */

import { supabase } from '@/integrations/supabase/client';
import type { RefSnapshot } from '@/lib/referenceData';
import { mapCard, mapField, type CardField, type ProposalCard } from '@/types/cards';
import {
  htmlToTypstBlocks,
  htmlToTypstInline,
  typstString,
  type ConvertContext,
} from './htmlToTypst';
import { TYPST_PREAMBLE } from './typstPreamble';

import { htmlToPlainText } from '@/lib/htmlToPlainText';

/**
 * Plain text of a title, used only for placeholder MESSAGES (never for the
 * rendered heading, which keeps its per-run marks — see `htmlToTypstInline`).
 */
function titleText(value: string | null | undefined): string {
  return htmlToPlainText(value ?? '').trim();
}


const BAND_ORDER: Record<string, number> = { head: 0, free: 1, tail: 2 };

export interface SectionBlockTree {
  cards: ProposalCard[];
  fieldsByCard: Record<string, CardField[]>;
}

export async function fetchSectionBlockTree(
  proposalId: string,
  sectionId: string,
): Promise<SectionBlockTree> {
  const { data: cardRows, error: cardError } = await supabase
    .from('proposal_cards')
    .select('*')
    .eq('proposal_id', proposalId)
    .eq('section_id', sectionId)
    .is('deleted_at', null)
    .eq('is_visible', true)
    .order('order_index');
  if (cardError) throw cardError;

  const cards = (cardRows || [])
    .map(mapCard)
    .sort(
      (a, b) =>
        (BAND_ORDER[a.anchor] ?? 1) - (BAND_ORDER[b.anchor] ?? 1) || a.orderIndex - b.orderIndex,
    );

  const fieldsByCard: Record<string, CardField[]> = {};
  if (cards.length) {
    const { data: fieldRows, error: fieldError } = await supabase
      .from('card_fields')
      .select('*')
      .in('card_id', cards.map((c) => c.id))
      .is('deleted_at', null)
      .order('order_index');
    if (fieldError) throw fieldError;
    for (const row of fieldRows || []) {
      const field = mapField(row);
      (fieldsByCard[field.cardId] ||= []).push(field);
    }
  }

  return { cards, fieldsByCard };
}

export interface BuiltTypstDocument {
  source: string;
  /** Names of markup features encountered but not converted in this step. */
  unsupported: string[];
  blockCount: number;
}

function placeholder(label: string): string {
  return `not-converted(${typstString(label)})`;
}

export function buildSectionTypstDocument(
  tree: SectionBlockTree,
  options: { sectionLabel?: string; data?: RefSnapshot } = {},
): BuiltTypstDocument {
  const ctx: ConvertContext = { data: options.data, unsupported: new Set<string>() };
  const out: string[] = [];

  if (options.sectionLabel) {
    out.push(
      `block(below: 12pt, text(size: 14pt, weight: "bold", t(${typstString(options.sectionLabel)})))`,
    );
  }

  // Milestones and risks are authored in place (their rows live in
  // proposal_milestones / proposal_risks), so they are not card-field blocks
  // even though they are not source-fed either.
  const RELATIONAL_KEYS = new Set(['b31.table_d', 'b31.table_e', 'b12.linked_activities']);

  for (const card of tree.cards) {
    if (card.isSourceFed || (card.sourceKey && RELATIONAL_KEYS.has(card.sourceKey))) {
      // Honest placeholder naming the block, per the step scope.
      out.push(
        placeholder(
          `[source-fed block “${titleText(card.title) || card.sourceKey || card.templateKey || 'untitled'}” — generated content, not rendered in this step]`,
        ),
      );
      continue;
    }
    if (card.kind === 'figure') {
      ctx.unsupported.add('figure block');
      out.push(placeholder(`[figure block “${titleText(card.title) || 'untitled'}” — not rendered in this step]`));
      continue;
    }
    if (card.kind === 'references') {
      ctx.unsupported.add('references block');
      out.push(placeholder('[references block — not rendered in this step]'));
      continue;
    }

    // Editor-only headers (B3.1) exist for navigation in the board and are
    // never emitted to the preview or the export.
    if (card.title && card.titleMode === 'mirrored') {

      // Colour is carried per RUN, so colouring one word colours one word.
      out.push(
        `block(above: 14pt, below: 6pt, text(size: 12pt, weight: "bold", underline(${htmlToTypstInline(card.title, ctx)})))`,
      );
    }

    for (const field of tree.fieldsByCard[card.id] || []) {
      if (field.headingEnabled && field.heading) {
        out.push(
          `block(above: 10pt, below: 4pt, text(size: 11pt, weight: "bold", style: "italic", ${htmlToTypstInline(field.heading, ctx)}))`,
        );
      }
      out.push(...htmlToTypstBlocks(field.contentHtml, ctx));
    }
  }

  const body = out.map((expr) => `#${expr}`).join('\n\n');
  return {
    source: `${TYPST_PREAMBLE}\n${body}\n`,
    unsupported: Array.from(ctx.unsupported).sort(),
    blockCount: tree.cards.length,
  };
}
