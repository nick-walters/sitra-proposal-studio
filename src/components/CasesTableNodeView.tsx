import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { LeaderPicker } from './B31WPDescriptionTables';
import type { B31Participant } from '@/hooks/useB31SectionData';
import DOMPurify from 'dompurify';
import { RICH_TEXT_CONFIG } from '@/lib/sanitizePresets';

/**
 * CasesTableNodeView — Stage 2.
 *
 * Renders the selected cases live from `case_drafts`. Per case:
 *   - header row: case cross-reference chip (left) + LeaderPicker (right)
 *   - bold full title
 *   - one block per subsection: bold-italic "Heading:" + body html
 *
 * Title chip = visual replica of CaseReferenceNode's pill (same markup/style),
 * NOT an interactive tiptap cross-ref atom (would require a child editor
 * inside the NodeView). It is visually identical, click-through wiring can
 * be added later.
 *
 * Styling is scoped to this component via inline styles + a unique
 * `data-cases-table-nodeview` data-attribute root, so it does not depend on
 * the three legacy index.css cases blocks (which stage 4 retires).
 */

interface CaseRow {
  id: string;
  number: number;
  short_name: string | null;
  title: string | null;
  case_type: string;
  custom_type_name: string | null;
  lead_participant_id: string | null;
  subsection_content: Record<string, string> | null;
  order_index: number;
}

interface SubsectionTemplate {
  key: string;
  heading: string;
  order_index: number;
}

function casePrefix(caseType: string): string {
  switch (caseType) {
    case 'case_study': return 'CS';
    case 'use_case': return 'UC';
    case 'living_lab': return 'LL';
    case 'pilot': return 'P';
    case 'demonstration': return 'D';
    default: return '';
  }
}

function caseChipLabel(opts: {
  prefix: string;
  number: number;
  shortName: string | null;
  includeNumber: boolean;
  includeAbbreviation: boolean;
}): string {
  const { prefix, number, shortName, includeNumber, includeAbbreviation } = opts;
  if (prefix && (includeNumber || includeAbbreviation)) {
    const ab = includeAbbreviation ? prefix : '';
    const nm = includeNumber ? number : '';
    return `${ab}${nm}` || shortName || `${number}`;
  }
  return shortName || `${number}`;
}

function CaseChip({ label }: { label: string }) {
  // Visual replica of CaseReferenceNode pill.
  return (
    <span
      data-case-reference=""
      className="case-reference-badge"
      contentEditable={false}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        backgroundColor: '#ffffff',
        border: '1.5px solid #000000',
        padding: '0 0.4rem',
        borderRadius: 9999,
        whiteSpace: 'nowrap',
        verticalAlign: 'baseline',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          color: '#000000',
          fontFamily: "'Times New Roman', Times, serif",
          fontSize: '11pt',
          fontWeight: 700,
          fontStyle: 'normal',
          lineHeight: 1,
        }}
      >
        {label}
      </span>
    </span>
  );
}

export function CasesTableNodeView(props: NodeViewProps) {
  const caseIds: string[] = Array.isArray(props.node.attrs.caseIds)
    ? props.node.attrs.caseIds
    : [];

  // Extractor needs a stable proposalId — pull from the editor storage / URL.
  // The editor itself is bound to a proposalId via the page route; the
  // NodeView doesn't receive props directly, so fetch the case rows by id
  // (they carry proposal_id) and derive the rest.
  const idsKey = caseIds.join(',');

  const { data } = useQuery({
    queryKey: ['b12-cases-node', idsKey],
    enabled: caseIds.length > 0,
    queryFn: async () => {
      const { data: cases } = await supabase
        .from('case_drafts')
        .select(
          'id, number, short_name, title, case_type, custom_type_name, lead_participant_id, subsection_content, order_index, proposal_id',
        )
        .in('id', caseIds);
      const rows = (cases || []) as any as (CaseRow & { proposal_id: string })[];
      if (!rows.length) return { rows: [], templates: [], participants: [], flags: { num: true, ab: true }, proposalId: '' };
      const proposalId = rows[0].proposal_id;
      const [{ data: tpls }, { data: parts }, { data: prop }] = await Promise.all([
        supabase
          .from('case_subsection_templates')
          .select('key, heading, order_index')
          .eq('proposal_id', proposalId)
          .order('order_index', { ascending: true }),
        supabase
          .from('participants')
          .select('id, participant_number, organisation_short_name, organisation_name')
          .eq('proposal_id', proposalId)
          .order('participant_number', { ascending: true }),
        supabase
          .from('proposals')
          .select('case_include_number, case_include_abbreviation')
          .eq('id', proposalId)
          .maybeSingle(),
      ]);
      return {
        rows: rows.sort((a, b) => caseIds.indexOf(a.id) - caseIds.indexOf(b.id)),
        templates: (tpls || []) as SubsectionTemplate[],
        participants: (parts || []) as any as B31Participant[],
        flags: {
          num: (prop as any)?.case_include_number !== false,
          ab: (prop as any)?.case_include_abbreviation !== false,
        },
        proposalId,
      };
    },
  });

  return (
    <NodeViewWrapper
      as="div"
      data-cases-table-nodeview=""
      style={{
        margin: '0',
        fontFamily: "'Times New Roman', Times, serif",
        fontSize: '11pt',
        color: '#000',
        width: '100%',
      }}
    >
      {(!data || data.rows.length === 0) && (
        <div
          contentEditable={false}
          style={{
            padding: '8px 10px',
            border: '1px dashed #9ca3af',
            borderRadius: 4,
            color: '#6b7280',
            fontFamily: 'system-ui, sans-serif',
            fontSize: 12,
          }}
        >
          No cases selected. Use the case manager to populate this table.
        </div>
      )}

      {data && data.rows.map((c, idx) => {
        const prefix = casePrefix(c.case_type);
        const label = caseChipLabel({
          prefix,
          number: c.number,
          shortName: c.short_name,
          includeNumber: data.flags.num,
          includeAbbreviation: data.flags.ab,
        });
        const contentMap = c.subsection_content || {};
        return (
          <div
            key={c.id}
            data-case-block=""
            data-case-id={c.id}
            style={{
              paddingTop: idx === 0 ? 0 : 14,
              marginTop: idx === 0 ? 0 : 14,
              borderTop: idx === 0 ? 'none' : '1px solid #d1d5db',
            }}
          >
            {/* Header row: chip left, leader pill right */}
            <div
              contentEditable={false}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                width: '100%',
                marginBottom: 8,
              }}
            >
              <CaseChip label={label} />
              <LeaderPicker
                entityId={c.id}
                entityTable="case_drafts"
                currentLeaderId={c.lead_participant_id}
                participants={data.participants}
                proposalId={data.proposalId}
                showCrown
                arrowPosition="right"
                placeholder="Select case lead"
                invalidateKeys={[['b12-cases-node', idsKey]]}
              />
            </div>

            {/* Full title (bold, not italic) */}
            {c.title && (
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{c.title}</div>
            )}

            {/* Subsections */}
            {data.templates.map((t) => {
              const html = (contentMap[t.key] || '').trim();
              const clean = html
                ? DOMPurify.sanitize(html, RICH_TEXT_CONFIG as any)
                : '<em style="color:#999;">No content yet.</em>';
              return (
                <div key={t.key} style={{ marginBottom: 6 }}>
                  <strong>
                    <em>{t.heading}:</em>
                  </strong>{' '}
                  <span dangerouslySetInnerHTML={{ __html: clean }} />
                </div>
              );
            })}
          </div>
        );
      })}
    </NodeViewWrapper>
  );
}

export default CasesTableNodeView;
