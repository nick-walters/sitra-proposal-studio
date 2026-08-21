/**
 * Shared reference data snapshot.
 *
 * Extracted verbatim from syncCrossReferences.ts so that the main-editor
 * sync pipeline, the (upcoming) plain-span resolver for A2/mirror/drafts,
 * and the export renderers all consume the same fetch + Map shape.
 *
 * Behaviour-preserving: fetch, Map construction, and D{wp}.{n} synthesis
 * are unchanged.
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { computeFigureNumbers } from '@/lib/figureNumbering';
import { buildCitationNumberMap } from '@/lib/citationSources';
import { publishCitationDisplayMap } from '@/lib/citationDisplay';

export interface WPData {
  id: string;
  number: number;
  color: string;
  short_name: string | null;
}

export interface TaskData {
  id: string;
  number: number;
  wp_number: number;
  wp_color: string;
}

export interface DeliverableData {
  id: string;
  /** Pre-composed "D{wp}.{n}" — matches legacy sync behaviour. */
  number: string;
  wp_number: number | null;
  wp_color: string;
}

export interface MilestoneData {
  id: string;
  number: number;
}

export interface CaseData {
  id: string;
  number: number;
  case_type: string;
  case_type_id: string | null;
  short_name: string | null;
  color: string;
  include_number: boolean;
  include_abbreviation: boolean;
}

export interface ParticipantData {
  id: string;
  participant_number: number | null;
  organisation_short_name: string | null;
}

export interface FigureData {
  id: string;
  figure_number: string;
  figure_type: string;
  title: string;
}

export interface AcronymSegmentData {
  text: string;
  color: string;
}

export interface RefSnapshot {
  wpById: Map<string, WPData>;
  taskById: Map<string, TaskData>;
  deliverableById: Map<string, DeliverableData>;
  milestoneById: Map<string, MilestoneData>;
  caseById: Map<string, CaseData>;
  participantById: Map<string, ParticipantData>;
  figureById: Map<string, FigureData>;
  tableCaptionMap: Map<string, string>;
  acronymSegments: AcronymSegmentData[];
  /** Internal `ref_key` -> reader-facing citation number. Derived, never stored. */
  citationNumbers: Map<number, number>;
}


/**
 * Fetches current numbering data for all cross-referenceable items in a
 * proposal. 9-way parallel fetch. Extracted verbatim from
 * syncCrossReferences.ts.
 */
export async function fetchReferenceData(proposalId: string): Promise<RefSnapshot> {
  // Work packages first: tasks and deliverables carry no proposal_id, so they
  // must be filtered by this proposal's wp ids. Fetching them unfiltered
  // relied on RLS alone and was exposed to PostgREST's 1000-row default cap.
  const wpRes = await supabase
    .from('wp_drafts')
    .select('id, number, color, short_name')
    .eq('proposal_id', proposalId)
    .order('number');
  const wpIds = (wpRes.data || []).map(w => w.id);

  const [taskRes, delRes, msRes, caseRes, caseTypeRes, participantRes, figureRes, tableCaptionRes, proposalRes] = await Promise.all([
    wpIds.length
      ? supabase
          .from('wp_draft_tasks')
          .select('id, number, wp_draft_id')
          .in('wp_draft_id', wpIds)
          .order('number')
      : Promise.resolve({ data: [] as { id: string; number: number; wp_draft_id: string }[] } as any),
    wpIds.length
      ? supabase
          .from('wp_draft_deliverables')
          .select('id, number, wp_draft_id')
          .in('wp_draft_id', wpIds)
          .order('number')
      : Promise.resolve({ data: [] as { id: string; number: number; wp_draft_id: string }[] } as any),
    supabase
      .from('proposal_milestones')
      .select('id, number, proposal_id')
      .eq('proposal_id', proposalId)
      .order('number'),
    supabase
      .from('case_drafts')
      .select('id, number, case_type, case_type_id, short_name, color')
      .eq('proposal_id', proposalId)
      .order('number'),
    supabase
      .from('proposal_case_types')
      .select('id, include_number, include_abbreviation, outline_color')
      .eq('proposal_id', proposalId),
    supabase
      .from('participants')
      .select('id, participant_number, organisation_short_name')
      .eq('proposal_id', proposalId)
      .order('participant_number'),
    supabase
      .from('figures')
      .select('id, figure_type, title')
      .eq('proposal_id', proposalId),
    supabase
      .from('table_captions')
      .select('table_key, caption')
      .eq('proposal_id', proposalId),
    supabase
      .from('proposals')
      .select('acronym, acronym_segments')
      .eq('id', proposalId)
      .maybeSingle(),
  ]);

  // Figure numbers are DERIVED from the block that places the figure — the
  // stored `figures.figure_number` column is never read. See
  // supabase/functions/_shared/figureNumbering.ts.
  const [placementRes, cardRes] = await Promise.all([
    supabase.from('card_figure').select('card_id, figure_id').eq('proposal_id', proposalId),
    supabase
      .from('proposal_cards')
      .select('id, section_id, order_index')
      .eq('proposal_id', proposalId)
      .is('deleted_at', null),
  ]);
  const sectionIds = Array.from(
    new Set((cardRes.data || []).map((c: any) => c.section_id).filter(Boolean)),
  ) as string[];
  const sectionRes = sectionIds.length
    ? await supabase
        .from('proposal_template_sections')
        .select('id, section_number, order_index')
        .in('id', sectionIds)
    : { data: [] as any[] };
  const figureNumbers = computeFigureNumbers(
    (placementRes.data || []) as any[],
    (cardRes.data || []) as any[],
    (sectionRes.data || []) as any[],
  );

  // Citation display numbers are DERIVED the same way: the internal `ref_key`
  // in `data-citation` is resolved to a reader-facing number at render time,
  // in first-citation order across the whole proposal. Legacy `section_content`
  // documents are included because that is where older citations still live.
  const [citeCardRes, citeFieldRes, legacyRes] = await Promise.all([
    supabase
      .from('proposal_cards')
      .select('id, section_id, order_index, anchor, is_visible, deleted_at')
      .eq('proposal_id', proposalId),
    supabase
      .from('card_fields')
      .select('id, card_id, order_index, content_html, deleted_at')
      .eq('proposal_id', proposalId),
    supabase
      .from('section_content')
      .select('section_id, content')
      .eq('proposal_id', proposalId),
  ]);
  // Every section of the proposal's template, not just those holding cards:
  // a legacy section body needs its section to be orderable too.
  const citeSectionIds = Array.from(
    new Set([
      ...sectionIds,
      ...((citeCardRes.data || []).map((c: any) => c.section_id).filter(Boolean) as string[]),
    ]),
  );
  const citeSectionRes = citeSectionIds.length
    ? await supabase
        .from('proposal_template_sections')
        .select('id, section_number, order_index, proposal_template_id')
        .in('id', citeSectionIds)
    : { data: [] as any[] };
  const templateId = (citeSectionRes.data || [])[0]?.proposal_template_id ?? null;
  const allSectionRes = templateId
    ? await supabase
        .from('proposal_template_sections')
        .select('id, section_number, order_index')
        .eq('proposal_template_id', templateId)
    : { data: (citeSectionRes.data || []) as any[] };
  const citationNumbers = buildCitationNumberMap({
    sections: (allSectionRes.data || []) as any[],
    cards: (citeCardRes.data || []) as any[],
    fields: (citeFieldRes.data || []) as any[],
    legacySections: (legacyRes.data || []) as any[],
  });




  const wps: WPData[] = wpRes.data || [];
  const wpMap = new Map(wps.map(wp => [wp.id, wp]));

  const tasks: TaskData[] = (taskRes.data || [])
    .filter(t => wpMap.has(t.wp_draft_id))
    .map(t => {
      const wp = wpMap.get(t.wp_draft_id)!;
      return { id: t.id, number: t.number, wp_number: wp.number, wp_color: wp.color || '#000000' };
    });

  const deliverables: DeliverableData[] = (delRes.data || [])
    .filter(d => wpMap.has(d.wp_draft_id))
    .map(d => {
      const wp = wpMap.get(d.wp_draft_id)!;
      return {
        id: d.id,
        number: `D${wp.number}.${d.number}`,
        wp_number: wp.number,
        wp_color: wp.color || '#000000',
      };
    });

  const milestones: MilestoneData[] = (msRes.data || []).map(m => ({ id: m.id, number: m.number }));

  const caseTypeFlagsById = new Map(
    (caseTypeRes.data || []).map((t: any) => [t.id, t]),
  );
  const cases: CaseData[] = (caseRes.data || []).map((c: any) => {
    const t = c.case_type_id ? caseTypeFlagsById.get(c.case_type_id) : null;
    return {
      ...c,
      color: t?.outline_color || c.color || '#000000',
      include_number: t?.include_number !== false,
      include_abbreviation: t?.include_abbreviation !== false,
    } as CaseData;
  });

  const participants: ParticipantData[] = participantRes.data || [];
  // Only PLACED figures carry a number, so unplaced ones are omitted entirely
  // and their chips degrade to the stored label.
  const figures: FigureData[] = (figureRes.data || [])
    .filter((f: any) => figureNumbers.has(f.id))
    .map((f: any) => ({
      id: f.id,
      figure_number: figureNumbers.get(f.id)!,
      figure_type: f.figure_type,
      title: f.title,
    }));

  const tableCaptionMap = new Map<string, string>();
  for (const tc of tableCaptionRes.data || []) {
    tableCaptionMap.set(tc.table_key, tc.caption || '');
  }

  const proposalRow = (proposalRes as any).data as { acronym: string | null; acronym_segments: AcronymSegmentData[] | null } | null;
  const rawSegs = (proposalRow?.acronym_segments as AcronymSegmentData[] | null) || [];
  const plainAcronym = proposalRow?.acronym || '';
  const acronymSegments: AcronymSegmentData[] = rawSegs.length > 0
    ? rawSegs
    : (plainAcronym ? [{ text: plainAcronym, color: '#000000' }] : []);

  return {
    wpById: wpMap,
    taskById: new Map(tasks.map(t => [t.id, t])),
    deliverableById: new Map(deliverables.map(d => [d.id, d])),
    milestoneById: new Map(milestones.map(m => [m.id, m])),
    caseById: new Map(cases.map(c => [c.id, c])),
    participantById: new Map(participants.map(p => [p.id, p])),
    figureById: new Map(figures.map(f => [f.id, f])),
    tableCaptionMap,
    acronymSegments,
    citationNumbers,
  };
}


/**
 * React Query hook wrapping fetchReferenceData. Invalidated by the
 * 'cross-ref-data-changed' window event, matching how DocumentEditor
 * already triggers the main-editor sync.
 */
export function useReferenceData(proposalId: string | undefined) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['reference-data', proposalId],
    queryFn: () => fetchReferenceData(proposalId!),
    enabled: !!proposalId,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!proposalId) return;
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['reference-data', proposalId] });
    };
    window.addEventListener('cross-ref-data-changed', handler);
    return () => window.removeEventListener('cross-ref-data-changed', handler);
  }, [proposalId, queryClient]);

  useEffect(() => {
    if (!proposalId) return;
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['reference-data', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['section-citation-sources', proposalId] });
    };
    const channel = supabase
      .channel(`reference-data-cards-${proposalId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'proposal_cards', filter: `proposal_id=eq.${proposalId}` },
        invalidate,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'card_fields', filter: `proposal_id=eq.${proposalId}` },
        invalidate,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [proposalId, queryClient]);

  // Editors render citations through a node view, which cannot read React
  // context. Publishing the derived map here is what lets every citation in
  // every editor show the same number the mirrors and exports show.
  useEffect(() => {
    if (query.data) publishCitationDisplayMap(query.data.citationNumbers);
  }, [query.data]);

  return query;
}
