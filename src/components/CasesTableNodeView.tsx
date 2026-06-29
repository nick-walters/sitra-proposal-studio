import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { getCaseTypePrefix, buildCaseLabel, caseWord } from '@/lib/caseTypeLabels';

import { supabase } from '@/integrations/supabase/client';
import { RICH_TEXT_CONFIG } from '@/lib/sanitizePresets';
import { ParticipantBubble } from './B31Pill';

/**
 * CasesTableNodeView — Stage 1 (live read-only mirror).
 *
 * Renders the B1.2 cases LIVE from case_drafts + case_subsection_templates
 * (no snapshot, no in-place editing). The node attribute caseIds is ignored;
 * we always show all visible cases for the proposal.
 */

interface CaseRow {
  id: string;
  number: number | null;
  short_name: string | null;
  title: string | null;
  case_type: string | null;
  case_type_id: string | null;
  custom_type_name: string | null;
  color: string | null;
  lead_participant_id: string | null;
  order_index: number | null;
  subsection_content: any;
  background_context: string | null;
  proposed_solutions: string | null;
  expected_outcomes: string | null;
  replicability: string | null;
  key_stakeholders: string | null;
  heading_background: string | null;
  heading_solutions: string | null;
  heading_outcomes: string | null;
  heading_replicability: string | null;
  heading_stakeholders: string | null;
}

interface CaseTypeRow {
  id: string;
  include_number: boolean;
  include_abbreviation: boolean;
  outline_color: string;
  type_code: string | null;
  custom_type_name: string | null;
}




interface SubsectionTemplate {
  id: string;
  key: string;
  heading: string | null;
  order_index: number | null;
  is_default: boolean | null;
}

interface Participant {
  id: string;
  participant_number: number | null;
  organisation_short_name: string | null;
  organisation_name: string | null;
}

function casePrefix(caseType: string | null): string {
  return getCaseTypePrefix(caseType);
}

// Chip label = abbreviation+number only (no short name), respects per-type flags.
const caseChipLabel = (opts: {
  prefix: string;
  number: number | null;
  shortName: string | null;
  includeNumber: boolean;
  includeAbbreviation: boolean;
}): string => buildCaseLabel({ ...opts, withShortName: false });


function CaseChip({ label, color }: { label: string; color: string }) {
  return (
    <span
      data-case-reference=""
      className="case-reference-badge"
      contentEditable={false}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        backgroundColor: '#ffffff',
        border: `1.5px solid ${color || '#000000'}`,
        padding: '0 0.4rem',
        borderRadius: 9999,
        whiteSpace: 'nowrap',
        verticalAlign: 'baseline',
      }}
    >

      <span style={{ color: color || '#000000', fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', fontWeight: 700, lineHeight: 1 }}>
        {label}
      </span>
    </span>
  );
}

function ReadOnlyRichBody({ html }: { html: string | null | undefined }) {
  const raw = (html ?? '').toString();
  const isEmpty = !raw || raw.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim() === '';
  if (isEmpty) return null;
  return (
    <div
      className="font-['Times_New_Roman',Times,serif] text-[11pt] text-justify [&_p]:mt-[6pt] [&_p]:mb-[6pt]"
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(raw, RICH_TEXT_CONFIG) }}
    />
  );
}

function extractSubsections(row: CaseRow, templates: SubsectionTemplate[]) {
  // Source priority: per-case subsection_content jsonb (richest) → known columns.
  const out: { key: string; heading: string; body: string }[] = [];
  const seen = new Set<string>();

  // Known column-based subsections (fallback display order)
  const builtins: { key: string; heading: string | null; defaultHeading: string; body: string | null }[] = [
    { key: 'background', heading: row.heading_background, defaultHeading: 'Background', body: row.background_context },
    { key: 'stakeholders', heading: row.heading_stakeholders, defaultHeading: 'Key stakeholders', body: row.key_stakeholders },
    { key: 'solutions', heading: row.heading_solutions, defaultHeading: 'Proposed solutions', body: row.proposed_solutions },
    { key: 'outcomes', heading: row.heading_outcomes, defaultHeading: 'Expected outcomes', body: row.expected_outcomes },
    { key: 'replicability', heading: row.heading_replicability, defaultHeading: 'Replicability', body: row.replicability },
  ];

  // Drive order from case_subsection_templates if present, falling back to builtin order.
  const orderedKeys = templates
    .slice()
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    .map((t) => t.key);

  const pushSub = (key: string, heading: string, body: string | null | undefined) => {
    if (seen.has(key)) return;
    if (!body || !body.toString().replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim()) return;
    out.push({ key, heading, body: body.toString() });
    seen.add(key);
  };

  const jsonContent = row.subsection_content as Record<string, { heading?: string; body?: string }> | null;

  for (const k of orderedKeys) {
    const tpl = templates.find((t) => t.key === k);
    const tplHeading = tpl?.heading || '';
    if (jsonContent && jsonContent[k]) {
      pushSub(k, jsonContent[k].heading || tplHeading || k, jsonContent[k].body || '');
      continue;
    }
    const builtin = builtins.find((b) => b.key === k);
    if (builtin) {
      pushSub(k, builtin.heading || tplHeading || builtin.defaultHeading, builtin.body);
    }
  }

  // Remaining builtins not covered by templates
  for (const b of builtins) {
    pushSub(b.key, b.heading || b.defaultHeading, b.body);
  }

  // Any remaining JSON keys
  if (jsonContent) {
    for (const k of Object.keys(jsonContent)) {
      pushSub(k, jsonContent[k]?.heading || k, jsonContent[k]?.body || '');
    }
  }

  return out;
}

function proposalIdFromUrl(): string {
  if (typeof window === 'undefined') return '';
  const m = window.location.pathname.match(/\/proposal\/([0-9a-f-]{36})/i);
  return m ? m[1] : '';
}

export function CasesTableNodeView(_props: NodeViewProps) {
  const params = useParams<{ proposalId?: string; id?: string }>();
  const pathFallback = proposalIdFromUrl();
  // Tiptap NodeViews may render in a detached React tree, so useParams can
  // return empty. Fall back to parsing the proposal id from the URL.
  const proposalId = params.proposalId || params.id || pathFallback;

  const { data } = useQuery({
    queryKey: ['b12-cases-live', proposalId],
    enabled: !!proposalId,
    queryFn: async () => {
      const [casesRes, tplRes, partsRes, typesRes] = await Promise.all([
        supabase
          .from('case_drafts')
          .select('id, number, short_name, title, case_type, case_type_id, custom_type_name, color, lead_participant_id, order_index, subsection_content, background_context, proposed_solutions, expected_outcomes, replicability, key_stakeholders, heading_background, heading_solutions, heading_outcomes, heading_replicability, heading_stakeholders')
          .eq('proposal_id', proposalId)
          .order('order_index', { ascending: true, nullsFirst: false })
          .order('number', { ascending: true }),
        supabase
          .from('case_subsection_templates')
          .select('id, key, heading, order_index, is_default')
          .eq('proposal_id', proposalId)
          .order('order_index'),
        supabase
          .from('participants')
          .select('id, participant_number, organisation_short_name, organisation_name')
          .eq('proposal_id', proposalId)
          .order('participant_number'),
        supabase
          .from('proposal_case_types')
          .select('id, include_number, include_abbreviation, outline_color, type_code, custom_type_name')
          .eq('proposal_id', proposalId),
      ]);

      const cases = (casesRes.data || []) as CaseRow[];
      const templates = (tplRes.data || []) as SubsectionTemplate[];
      const participants = (partsRes.data || []) as Participant[];
      const types = (typesRes.data || []) as CaseTypeRow[];
      const typeById = new Map(types.map((t) => [t.id, t]));
      return { cases, templates, participants, typeById, types };
    },
  });






  return (
    <NodeViewWrapper
      as="div"
      data-cases-table-nodeview=""
      contentEditable={false}
      style={{
        margin: '0',
        fontFamily: "'Times New Roman', Times, serif",
        fontSize: '11pt',
        color: '#000',
        width: '100%',
        userSelect: 'text',
      }}
    >
      {(!data || data.cases.length === 0) && (
        <div
          style={{
            padding: '8px 10px',
            border: '1px dashed #9ca3af',
            borderRadius: 4,
            color: '#6b7280',
            fontFamily: 'system-ui, sans-serif',
            fontSize: 12,
          }}
        >
          No {caseWord(data?.types ?? [], { plural: true, capitalize: false })} yet. Add {caseWord(data?.types ?? [], { plural: true, capitalize: false })} in the Case manager — they will appear here automatically.
        </div>
      )}

      {data && data.cases.map((c, idx) => {
        const prefix = casePrefix(c.case_type);
        const typeRow = c.case_type_id ? data.typeById.get(c.case_type_id) : undefined;
        const includeNumber = typeRow?.include_number !== false;
        const includeAbbreviation = typeRow?.include_abbreviation !== false;
        const outlineColor = typeRow?.outline_color || c.color || '#000000';
        const label = caseChipLabel({
          prefix,
          number: c.number,
          shortName: c.short_name,
          includeNumber,
          includeAbbreviation,
        });
        const leader = data.participants.find((p) => p.id === c.lead_participant_id);
        const subs = extractSubsections(c, data.templates);

        return (
          <div
            key={c.id}
            data-case-block=""
            data-case-id={c.id}
            style={{ marginTop: idx === 0 ? 0 : 18 }}
          >
            {/* Header: chip left, leader pill right */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12, width: '100%', marginBottom: 4,
            }}>
              <CaseChip label={label} color={outlineColor} />

              {leader ? (
                <ParticipantBubble
                  showCrown
                  shortName={leader.organisation_short_name || leader.organisation_name || ''}
                  style={{ fontStyle: 'normal' }}
                />
              ) : (
                <span className="text-muted-foreground text-[9pt] italic">No {caseWord(data?.types ?? [], { capitalize: false })} lead</span>
              )}
            </div>

            {/* Title */}
            <div style={{ marginBottom: 4, fontWeight: 700 }}>
              {(c.title || '').trim() ? c.title : <span className="text-muted-foreground italic font-normal">Untitled {caseWord(data?.types ?? [], { capitalize: false })}</span>}
            </div>

            <div style={{ height: 1, backgroundColor: '#000000', width: '100%', margin: '6px 0' }} />

            {subs.map((s) => (
              <div key={s.key}>
                <div>
                  <span style={{ fontWeight: 700, fontStyle: 'italic' }}>
                    {s.heading}
                    {s.heading.trim() && <span>:</span>}
                  </span>
                  <div style={{ marginTop: 2 }}>
                    <ReadOnlyRichBody html={s.body} />
                  </div>
                </div>
                <div style={{ height: 1, backgroundColor: '#000000', width: '100%', margin: '6px 0' }} />
              </div>
            ))}
          </div>
        );
      })}

      {data && data.cases.length > 0 && <div style={{ height: 18 }} />}
    </NodeViewWrapper>
  );
}

export default CasesTableNodeView;
