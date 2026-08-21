import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useReferenceData } from '@/lib/refDataContext';
import { extractCitationRefKeys } from '@/lib/citationNumbering';
import { legacySectionKey } from '@/lib/citationSources';
import type { ProposalReference } from '@/hooks/useProposalReferences';

/**
 * The references cited by ONE section, for the per-section references block.
 *
 * Two sources feed it, because a proposal today holds both:
 *  1. Card blocks — citations live in `card_fields.content_html`.
 *  2. Legacy `section_content` — the pre-cards body of the section, which is
 *     where SUSIE-Q's citations actually are. It is matched to the section by
 *     turning the section number ("B1.2") into its legacy key ("b1-2"), the
 *     same mapping the numbering module uses, and always counts as visible.
 *
 * Display numbers are NEVER computed here: they come from the proposal-wide
 * derived map in `referenceData`, so this list can only agree with what the
 * editors, mirrors and exports show.
 */

export interface SectionCitedReference {
  reference: ProposalReference;
  /** null when the reference is cited only in hidden blocks of this section. */
  displayNumber: number | null;
  refKey: number;
}

interface SectionCitationScan {
  visibleKeys: number[];
  hiddenKeys: number[];
}

export function useSectionCitedReferences(proposalId: string, sectionId: string) {
  const { data: refData } = useReferenceData();

  const scan = useQuery({
    queryKey: ['section-cited-refs', proposalId, sectionId],
    enabled: !!proposalId && !!sectionId,
    staleTime: 15_000,
    queryFn: async (): Promise<SectionCitationScan> => {
      const [cardRes, sectionRes] = await Promise.all([
        supabase
          .from('proposal_cards')
          .select('id, is_visible, anchor, order_index')
          .eq('proposal_id', proposalId)
          .eq('section_id', sectionId)
          .is('deleted_at', null),
        supabase
          .from('proposal_template_sections')
          .select('section_number')
          .eq('id', sectionId)
          .maybeSingle(),
      ]);

      const cards = (cardRes.data || []) as Array<{ id: string; is_visible: boolean | null }>;
      const cardIds = cards.map((c) => c.id);
      const fieldRes = cardIds.length
        ? await supabase
            .from('card_fields')
            .select('card_id, content_html')
            .in('card_id', cardIds)
            .is('deleted_at', null)
        : { data: [] as Array<{ card_id: string; content_html: string | null }> };

      const visibleById = new Map(cards.map((c) => [c.id, c.is_visible !== false]));
      const visible = new Set<number>();
      const hidden = new Set<number>();

      for (const row of (fieldRes.data || []) as Array<{ card_id: string; content_html: string | null }>) {
        const target = visibleById.get(row.card_id) ? visible : hidden;
        for (const key of extractCitationRefKeys(row.content_html)) target.add(key);
      }

      // Legacy body of this section — always visible content.
      const legacyKey = legacySectionKey(sectionRes.data?.section_number ?? null);
      if (legacyKey) {
        const legacyRes = await supabase
          .from('section_content')
          .select('content')
          .eq('proposal_id', proposalId)
          .eq('section_id', legacyKey)
          .maybeSingle();
        for (const key of extractCitationRefKeys(legacyRes.data?.content ?? null)) visible.add(key);
      }

      for (const key of visible) hidden.delete(key);
      return { visibleKeys: [...visible], hiddenKeys: [...hidden] };
    },
  });

  const refsQuery = useQuery({
    queryKey: ['proposal-references-list', proposalId],
    enabled: !!proposalId,
    staleTime: 15_000,
    queryFn: async (): Promise<ProposalReference[]> => {
      const { data, error } = await supabase
        .from('proposal_references')
        .select('*')
        .eq('proposal_id', proposalId);
      if (error) throw error;
      return (data || []) as ProposalReference[];
    },
  });

  const entries = useMemo<SectionCitedReference[]>(() => {
    const scanned = scan.data;
    const refs = refsQuery.data;
    if (!scanned || !refs) return [];
    const byKey = new Map(refs.map((r) => [r.ref_key, r]));
    const numbers = refData?.citationNumbers;

    const build = (keys: number[], numbered: boolean): SectionCitedReference[] =>
      keys
        .map((refKey) => {
          const reference = byKey.get(refKey);
          if (!reference) return null;
          const displayNumber = numbered ? numbers?.get(refKey) ?? null : null;
          return { reference, displayNumber, refKey };
        })
        .filter(Boolean) as SectionCitedReference[];

    const cited = build(scanned.visibleKeys, true).sort((a, b) => {
      const an = a.displayNumber ?? Number.MAX_SAFE_INTEGER;
      const bn = b.displayNumber ?? Number.MAX_SAFE_INTEGER;
      return an - bn || a.refKey - b.refKey;
    });
    const hiddenOnly = build(scanned.hiddenKeys, false).sort((a, b) => a.refKey - b.refKey);

    return [...cited, ...hiddenOnly];
  }, [scan.data, refsQuery.data, refData?.citationNumbers]);

  return {
    entries,
    isLoading: scan.isLoading || refsQuery.isLoading,
    /** Whether the section cites anything at all — drives block visibility. */
    hasAny: entries.length > 0,
  };
}
