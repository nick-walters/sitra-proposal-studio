/**
 * The per-section citation scan, shared by the on-screen references block and
 * by the PDF/DOCX export.
 *
 * TWO SOURCES, ONE ANSWER
 * A section's citations can sit in either place, and today a proposal holds
 * both at once:
 *   1. Card blocks — `<sup data-citation>` inside `card_fields.content_html`.
 *      Hidden or soft-deleted blocks are tracked separately: their citations
 *      consume no number, so they are listed unnumbered at the end.
 *   2. The legacy `section_content` body, which is where SUSIE-Q's citations
 *      actually live. It is matched to its template section by turning the
 *      section number ("B1.2") into its legacy key ("b1-2") — the same mapping
 *      the numbering module uses — and always counts as visible.
 *
 * Display numbers are NEVER computed here. They come from the proposal-wide
 * derived map (`referenceData.citationNumbers`), so this list can only agree
 * with what the editors, mirrors and exports render.
 */

import { supabase } from '@/integrations/supabase/client';
import { extractCitationRefKeys } from '@/lib/citationNumbering';
import { legacySectionKey } from '@/lib/citationSources';
import type { ProposalReference } from '@/hooks/useProposalReferences';

export interface SectionCitedReference {
  reference: ProposalReference;
  /** null when the reference is cited only in hidden blocks of this section. */
  displayNumber: number | null;
  refKey: number;
}

export interface SectionCitationSources {
  /** Citations of card blocks, keyed by template section uuid. */
  byCardSection: Map<string, { visible: Set<number>; hidden: Set<number> }>;
  /** Citations of legacy bodies, keyed by legacy section key ("b1-2"). */
  byLegacyKey: Map<string, Set<number>>;
  /** Legacy key of each template section uuid, for merging the two. */
  legacyKeyBySectionId: Map<string, string>;
  references: Map<number, ProposalReference>;
}

export async function fetchSectionCitationSources(
  proposalId: string,
): Promise<SectionCitationSources> {
  const [cardRes, fieldRes, legacyRes, refRes] = await Promise.all([
    supabase
      .from('proposal_cards')
      .select('id, section_id, is_visible')
      .eq('proposal_id', proposalId)
      .is('deleted_at', null),
    supabase
      .from('card_fields')
      .select('card_id, content_html')
      .eq('proposal_id', proposalId)
      .is('deleted_at', null),
    supabase.from('section_content').select('section_id, content').eq('proposal_id', proposalId),
    supabase.from('proposal_references').select('*').eq('proposal_id', proposalId),
  ]);

  const cards = (cardRes.data || []) as Array<{
    id: string;
    section_id: string | null;
    is_visible: boolean | null;
  }>;
  const cardById = new Map(cards.map((c) => [c.id, c]));

  const byCardSection = new Map<string, { visible: Set<number>; hidden: Set<number> }>();
  for (const row of (fieldRes.data || []) as Array<{ card_id: string; content_html: string | null }>) {
    const card = cardById.get(row.card_id);
    if (!card?.section_id) continue;
    let bucket = byCardSection.get(card.section_id);
    if (!bucket) {
      bucket = { visible: new Set(), hidden: new Set() };
      byCardSection.set(card.section_id, bucket);
    }
    const target = card.is_visible === false ? bucket.hidden : bucket.visible;
    for (const key of extractCitationRefKeys(row.content_html)) target.add(key);
  }

  const byLegacyKey = new Map<string, Set<number>>();
  for (const row of (legacyRes.data || []) as Array<{ section_id: string; content: string | null }>) {
    const keys = extractCitationRefKeys(row.content);
    if (!keys.length) continue;
    byLegacyKey.set(legacySectionKey(row.section_id), new Set(keys));
  }

  const sectionIds = [...byCardSection.keys()];
  const legacyKeyBySectionId = new Map<string, string>();
  if (sectionIds.length) {
    const secRes = await supabase
      .from('proposal_template_sections')
      .select('id, section_number')
      .in('id', sectionIds);
    for (const s of (secRes.data || []) as Array<{ id: string; section_number: string | null }>) {
      legacyKeyBySectionId.set(s.id, legacySectionKey(s.section_number));
    }
  }

  const references = new Map<number, ProposalReference>();
  for (const r of (refRes.data || []) as ProposalReference[]) references.set(r.ref_key, r);

  return { byCardSection, byLegacyKey, legacyKeyBySectionId, references };
}

/**
 * The reference list of one section: visible citations first, ordered by
 * display number ascending (so a reference first cited in an earlier section
 * keeps its lower number), then the hidden-only ones, unnumbered.
 */
export function sectionCitedReferences(
  sources: SectionCitationSources,
  target: { sectionId?: string | null; legacyKey?: string | null },
  citationNumbers: Map<number, number> | undefined,
): SectionCitedReference[] {
  const visible = new Set<number>();
  const hidden = new Set<number>();

  if (target.sectionId) {
    const bucket = sources.byCardSection.get(target.sectionId);
    bucket?.visible.forEach((k) => visible.add(k));
    bucket?.hidden.forEach((k) => hidden.add(k));
  }

  const legacyKey =
    target.legacyKey ??
    (target.sectionId ? sources.legacyKeyBySectionId.get(target.sectionId) ?? null : null);
  if (legacyKey) sources.byLegacyKey.get(legacyKey)?.forEach((k) => visible.add(k));

  for (const key of visible) hidden.delete(key);

  const build = (keys: Iterable<number>, numbered: boolean): SectionCitedReference[] =>
    [...keys]
      .map((refKey) => {
        const reference = sources.references.get(refKey);
        if (!reference) return null;
        return {
          reference,
          refKey,
          displayNumber: numbered ? citationNumbers?.get(refKey) ?? null : null,
        };
      })
      .filter((e): e is SectionCitedReference => e !== null);

  const cited = build(visible, true).sort(
    (a, b) =>
      (a.displayNumber ?? Number.MAX_SAFE_INTEGER) - (b.displayNumber ?? Number.MAX_SAFE_INTEGER) ||
      a.refKey - b.refKey,
  );
  const hiddenOnly = build(hidden, false).sort((a, b) => a.refKey - b.refKey);
  return [...cited, ...hiddenOnly];
}

/** The one-line formatted citation, with markdown emphasis turned into HTML. */
export function citationHtml(reference: ProposalReference): string {
  const raw =
    reference.formatted_citation ??
    [
      (reference.authors || []).join(', '),
      reference.year ? `(${reference.year})` : '',
      reference.title,
      reference.journal,
      reference.doi ? `https://doi.org/${reference.doi}` : '',
    ]
      .filter(Boolean)
      .join('. ');

  return raw
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}
