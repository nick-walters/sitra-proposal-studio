/**
 * Every table and figure in a proposal that a cross-reference can point at,
 * with the number it CURRENTLY carries and the caption text that identifies it.
 *
 * Numbers here are derived exactly as the board derives them — sections in
 * template order, blocks in head → free → tail then `order_index` order,
 * modules in `order_index` order, hidden and soft-deleted rows skipped — so a
 * picker opened after a reorder shows the new numbering. Nothing is read from
 * a stored number column.
 *
 * Caption TEXT is a separate question from the number. The auto-numbered label
 * ("Table 1.2.b.") is a widget derived from position and is not present in the
 * stored HTML, so the description is whatever the caption paragraph holds.
 */

import { supabase } from '@/integrations/supabase/client';
import { captionKind, captionLetter } from '@/lib/cards/captionSlots';
import { getCaseTypeLabel } from '@/lib/caseTypeLabels';
import { computeFigureNumbers } from '@/lib/figureNumbering';
import { htmlToPlainText } from '@/lib/htmlToPlainText';

export interface CrossRefTarget {
  kind: 'figure' | 'table';
  /** Derived number, without the word: "1.2.b". */
  label: string;
  /** Caption description, empty when the author has not written one. */
  title: string;
  sectionId?: string;
  /** `figures.id`, for figure blocks. */
  figureId?: string;
  /** `table_captions.table_key`, for the compulsory B3.1 tables. */
  tableKey?: string;
}

export interface CrossRefTargets {
  figures: CrossRefTarget[];
  tables: CrossRefTarget[];
}

const BAND_ORDER: Record<string, number> = { head: 0, free: 1, tail: 2 };

/** The compulsory B3.1 tables and figures, which B3.1 numbers for itself. */
const B31_TABLES: { letter: string; title: string }[] = [
  { letter: 'a', title: 'List of work packages' },
  { letter: 'b', title: 'Work package descriptions' },
  { letter: 'c', title: 'List of deliverables' },
  { letter: 'd', title: 'List of milestones' },
  { letter: 'e', title: 'Critical risks for implementation' },
  { letter: 'f', title: 'Summary of staff effort' },
  { letter: 'g', title: 'Subcontracting costs' },
  { letter: 'h', title: 'Purchase costs of equipment' },
];
const B31_FIGURES: { letter: string; title: string }[] = [
  { letter: 'a', title: 'PERT chart' },
  { letter: 'b', title: 'Gantt chart' },
];

/** Caption description with its derived label prefix removed. */
function captionDescription(p: Element): string {
  const clone = p.cloneNode(true) as Element;
  clone.querySelectorAll('[data-caption-label], .caption-placeholder').forEach((n) => n.remove());
  return (clone.textContent || '')
    .replace(/^\s*(Figure|Table)\s+\d+(?:\.\d+)*\.[a-z]+\.?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Caption slots a stored fragment occupies, IN DOCUMENT ORDER. */
function orderedCaptions(
  html: string | null | undefined,
  captionForCaseType: (typeId: string | null) => string,
): { kind: 'table' | 'figure'; title: string }[] {
  if (!html || typeof document === 'undefined') return [];
  const holder = document.createElement('div');
  holder.innerHTML = html;
  const out: { kind: 'table' | 'figure'; title: string }[] = [];
  holder.querySelectorAll('div[data-cases-table-node], p').forEach((el) => {
    if (el.matches('div[data-cases-table-node]')) {
      // The atom carries its caption inside its node view, not in the HTML —
      // it is the bound case type's caption, exactly as the node view draws it.
      out.push({ kind: 'table', title: captionForCaseType(el.getAttribute('data-case-type-id')) });
      return;
    }
    const kind = captionKind(el);
    if (kind) out.push({ kind, title: captionDescription(el) });
  });
  return out;
}


function sectionCaptionNumber(sectionNumber: string | null | undefined): string {
  return (sectionNumber || '').replace(/^[A-Za-z]+/, '') || '1.1';
}

/**
 * Enumerates every cross-referenceable table and figure of a proposal.
 */
export async function fetchCrossRefTargets(proposalId: string): Promise<CrossRefTargets> {
  const [cardRes, fieldRes, placementRes, figureRes, captionRes, caseTypeRes] = await Promise.all([
    supabase
      .from('proposal_cards')
      .select('id, section_id, order_index, anchor, kind, title, source_key, is_source_fed, is_visible, deleted_at')
      .eq('proposal_id', proposalId)
      .is('deleted_at', null)
      .eq('is_visible', true),
    supabase
      .from('card_fields')
      .select('id, card_id, order_index, content_html, field_role, placeholder_case_type_id, is_visible, deleted_at')
      .eq('proposal_id', proposalId)
      .is('deleted_at', null)
      .eq('is_visible', true),
    supabase.from('card_figure').select('card_id, figure_id, caption').eq('proposal_id', proposalId),
    supabase.from('figures').select('id, title, caption, deleted_at').eq('proposal_id', proposalId),
    supabase.from('table_captions').select('table_key, caption').eq('proposal_id', proposalId),
    // The pilots table's caption belongs to the CASE TYPE it is bound to — the
    // case manager writes it — not to the block it happens to sit in.
    supabase
      .from('proposal_case_types')
      .select('id, caption_text, type_code, custom_type_name')
      .eq('proposal_id', proposalId),
  ]);

  const caseTypeCaption = new Map(
    (caseTypeRes.data || []).map((t) => [
      t.id as string,
      (t.caption_text || '').trim()
        || `${getCaseTypeLabel(t.type_code, t.custom_type_name, { plural: false })} descriptions`,
    ]),
  );
  const captionForCaseType = (typeId: string | null) =>
    (typeId && caseTypeCaption.get(typeId)) || '';


  const cards = cardRes.data || [];
  const sectionIds = Array.from(new Set(cards.map((c) => c.section_id).filter(Boolean))) as string[];
  const sectionRes = sectionIds.length
    ? await supabase
        .from('proposal_template_sections')
        .select('id, section_number, order_index')
        .in('id', sectionIds)
    : { data: [] as { id: string; section_number: string | null; order_index: number | null }[] };
  const sections = (sectionRes.data || []).slice().sort(
    (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0),
  );

  const fieldsByCard = new Map<string, typeof fieldRes.data>();
  for (const f of fieldRes.data || []) {
    const list = fieldsByCard.get(f.card_id) || [];
    list.push(f);
    fieldsByCard.set(f.card_id, list);
  }
  for (const list of fieldsByCard.values()) list.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));

  const placementByCard = new Map(
    (placementRes.data || []).map((p) => [p.card_id as string, p]),
  );
  const figureById = new Map((figureRes.data || []).map((f) => [f.id, f]));
  const captionOverride = new Map(
    (captionRes.data || []).map((c) => [c.table_key as string, (c.caption || '').trim()]),
  );

  // Figure NUMBERS come from the one shared authority the board and the
  // previews already use, so a figure never shows two different numbers.
  const figureNumbers = computeFigureNumbers(
    (placementRes.data || []) as { card_id: string; figure_id: string | null }[],
    cards as { id: string; section_id: string | null; order_index: number | null }[],
    sections as { id: string; section_number: string | null; order_index: number | null }[],
  );

  const figures: CrossRefTarget[] = [];
  const tables: CrossRefTarget[] = [];

  for (const section of sections) {
    const number = sectionCaptionNumber(section.section_number);
    const ordered = cards
      .filter((c) => c.section_id === section.id)
      .sort(
        (a, b) =>
          (BAND_ORDER[a.anchor as string] ?? 1) - (BAND_ORDER[b.anchor as string] ?? 1) ||
          (a.order_index ?? 0) - (b.order_index ?? 0),
      );

    // B3.1 numbers its own captions from the fixed template sequence.
    if (number === '3.1') {
      for (const t of B31_TABLES) {
        const key = `table-3.1.${t.letter}`;
        tables.push({
          kind: 'table',
          label: `3.1.${t.letter}`,
          title: captionOverride.get(key) || t.title,
          sectionId: section.id,
          tableKey: key,
        });
      }
      for (const f of B31_FIGURES) {
        figures.push({
          kind: 'figure',
          label: `3.1.${f.letter}`,
          title: f.title,
          sectionId: section.id,
        });
      }
      continue;
    }

    let tableIdx = 0;
    let figureIdx = 0;

    for (const card of ordered) {
      if (card.kind === 'figure') {
        const placement = placementByCard.get(card.id);
        const figureId = (placement?.figure_id as string | null) ?? null;
        const figure = figureId ? figureById.get(figureId) : null;
        figures.push({
          kind: 'figure',
          // Prefer the shared authority; fall back to the local walk.
          label: (figureId && figureNumbers.get(figureId)) || `${number}.${captionLetter(figureIdx)}`,
          title:
            ((placement?.caption as string | null) || figure?.caption || figure?.title || '').trim(),
          sectionId: section.id,
          figureId: figureId || undefined,
        });
        figureIdx += 1;
        continue;
      }

      // A relational table authored in place carries a block-level caption.
      if (card.source_key === 'b12.linked_activities' && !card.is_source_fed) {
        tables.push({
          kind: 'table',
          label: `${number}.${captionLetter(tableIdx)}`,
          title: htmlToPlainText(card.title || '').trim(),
          sectionId: section.id,
        });
        tableIdx += 1;
        continue;
      }

      if (card.is_source_fed || card.kind === 'references') continue;

      for (const field of fieldsByCard.get(card.id) || []) {
        if (field.field_role === 'case_placeholder') {
          // NOT the block's title: the projected pilots table carries the
          // caption the case manager wrote for its bound case type.
          tables.push({
            kind: 'table',
            label: `${number}.${captionLetter(tableIdx)}`,
            title:
              captionForCaseType(field.placeholder_case_type_id as string | null)
              || htmlToPlainText(card.title || '').trim(),
            sectionId: section.id,
          });
          tableIdx += 1;
          continue;
        }
        for (const cap of orderedCaptions(field.content_html, captionForCaseType)) {
          if (cap.kind === 'table') {
            tables.push({
              kind: 'table',
              label: `${number}.${captionLetter(tableIdx)}`,
              title: cap.title,
              sectionId: section.id,
            });
            tableIdx += 1;
          } else {
            figures.push({
              kind: 'figure',
              label: `${number}.${captionLetter(figureIdx)}`,
              title: cap.title,
              sectionId: section.id,
            });
            figureIdx += 1;
          }
        }
      }
    }
  }

  return { figures, tables };
}
