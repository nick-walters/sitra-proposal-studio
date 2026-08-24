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
import { htmlToTypstBlocks, typstString, type ConvertContext } from './htmlToTypst';
import { TYPST_PREAMBLE } from './typstPreamble';

import { extractHexTextColorsFromHtml } from '@/lib/extractHexTextColors';
import { htmlToPlainText } from '@/lib/htmlToPlainText';

/**
 * Block titles and module headers are stored as single-line HTML since they
 * became rich-text fields. Typst renders them as bold text, so the markup is
 * flattened here (inline bold/italic inside a title is not carried through).
 */
function titleText(value: string | null | undefined): string {
  return htmlToPlainText(value ?? '').trim();
}

/**
 * Font colour is the one mark a title field keeps — the output fixes
 * everything else (block titles bold + underlined, module headers bold +
 * italic). Take the first colour used in the field, if any.
 */
function titleColour(value: string | null | undefined): string | null {
  const colours = extractHexTextColorsFromHtml(value ?? '');
  const first = [...colours][0];
  return first ? first.toLowerCase() : null;
}

function titleFill(value: string | null | undefined): string {
  const c = titleColour(value);
  return c ? `fill: rgb("${c}"), ` : '';
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

  for (const card of tree.cards) {
    if (card.isSourceFed) {
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

    if (card.title) {
      out.push(
        `block(above: 14pt, below: 6pt, text(size: 12pt, weight: "bold", ${titleFill(card.title)}underline(t(${typstString(titleText(card.title))}))))`,
      );
    }

    for (const field of tree.fieldsByCard[card.id] || []) {
      if (field.headingEnabled && field.heading) {
        out.push(
          `block(above: 10pt, below: 4pt, text(size: 11pt, weight: "bold", style: "italic", ${titleFill(field.heading)}t(${typstString(titleText(field.heading))})))`,
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
