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

export interface RefSnapshot {
  wpById: Map<string, WPData>;
  taskById: Map<string, TaskData>;
  deliverableById: Map<string, DeliverableData>;
  milestoneById: Map<string, MilestoneData>;
  caseById: Map<string, CaseData>;
  participantById: Map<string, ParticipantData>;
  figureById: Map<string, FigureData>;
  tableCaptionMap: Map<string, string>;
}

/**
 * Fetches current numbering data for all cross-referenceable items in a
 * proposal. 9-way parallel fetch. Extracted verbatim from
 * syncCrossReferences.ts.
 */
export async function fetchReferenceData(proposalId: string): Promise<RefSnapshot> {
  const [wpRes, taskRes, delRes, msRes, caseRes, caseTypeRes, participantRes, figureRes, tableCaptionRes] = await Promise.all([
    supabase
      .from('wp_drafts')
      .select('id, number, color, short_name')
      .eq('proposal_id', proposalId)
      .order('number'),
    supabase
      .from('wp_draft_tasks')
      .select('id, number, wp_draft_id')
      .order('number'),
    supabase
      .from('wp_draft_deliverables')
      .select('id, number, wp_draft_id')
      .order('number'),
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
      .select('id, figure_number, figure_type, title')
      .eq('proposal_id', proposalId),
    supabase
      .from('table_captions')
      .select('table_key, caption')
      .eq('proposal_id', proposalId),
  ]);

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
  const figures: FigureData[] = figureRes.data || [];

  const tableCaptionMap = new Map<string, string>();
  for (const tc of tableCaptionRes.data || []) {
    tableCaptionMap.set(tc.table_key, tc.caption || '');
  }

  return {
    wpById: wpMap,
    taskById: new Map(tasks.map(t => [t.id, t])),
    deliverableById: new Map(deliverables.map(d => [d.id, d])),
    milestoneById: new Map(milestones.map(m => [m.id, m])),
    caseById: new Map(cases.map(c => [c.id, c])),
    participantById: new Map(participants.map(p => [p.id, p])),
    figureById: new Map(figures.map(f => [f.id, f])),
    tableCaptionMap,
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

  return query;
}
