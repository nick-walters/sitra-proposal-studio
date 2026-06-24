import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { LeaderPicker, EditableText, EditableHeaderText } from './B31WPDescriptionTables';
import type { B31Participant } from '@/hooks/useB31SectionData';

/**
 * CasesTableNodeView — Stage 3b.
 *
 * Renders the B1.2 cases from the b12_cases / b12_case_subsections snapshot
 * (populated by populateCasesNodeToB12). Edits write to the snapshot tables
 * only — never back to case_drafts.
 *
 * Per case:
 *   - header row: case cross-ref chip (left) + LeaderPicker on b12_cases (right)
 *   - editable bold full title bound to b12_cases.title
 *   - editable bold-italic heading + rich body per b12_case_subsections row
 */

interface SnapshotSub {
  id: string;
  subsection_key: string;
  heading: string | null;
  body: string | null;
  order_index: number | null;
}

interface SnapshotCase {
  id: string;
  case_draft_id: string | null;
  proposal_id: string;
  number: number | null;
  short_name: string | null;
  title: string | null;
  case_type: string | null;
  custom_type_name: string | null;
  color: string | null;
  lead_participant_id: string | null;
  order_index: number | null;
  b12_case_subsections: SnapshotSub[];
}

function casePrefix(caseType: string | null): string {
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
  number: number | null;
  shortName: string | null;
  includeNumber: boolean;
  includeAbbreviation: boolean;
}): string {
  const { prefix, number, shortName, includeNumber, includeAbbreviation } = opts;
  if (prefix && (includeNumber || includeAbbreviation)) {
    const ab = includeAbbreviation ? prefix : '';
    const nm = includeNumber ? (number ?? '') : '';
    return `${ab}${nm}` || shortName || `${number ?? ''}`;
  }
  return shortName || `${number ?? ''}`;
}

function CaseChip({ label }: { label: string }) {
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
  const queryClient = useQueryClient();
  const idsKey = caseIds.join(',');

  const { data } = useQuery({
    queryKey: ['b12-cases-node', idsKey],
    enabled: caseIds.length > 0,
    queryFn: async () => {
      const { data: snap } = await supabase
        .from('b12_cases')
        .select(
          'id, case_draft_id, proposal_id, number, short_name, title, case_type, custom_type_name, color, lead_participant_id, order_index, b12_case_subsections(id, subsection_key, heading, body, order_index)',
        )
        .in('case_draft_id', caseIds);

      const rows = (snap || []) as any as SnapshotCase[];
      if (!rows.length) {
        return { rows: [], participants: [] as B31Participant[], flags: { num: true, ab: true }, proposalId: '' };
      }
      const proposalId = rows[0].proposal_id;

      const [{ data: parts }, { data: prop }] = await Promise.all([
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

      // Order: by b12_cases.order_index first, then fall back to the node's caseIds order.
      const ordered = rows.slice().sort((a, b) => {
        const ai = a.order_index ?? Number.MAX_SAFE_INTEGER;
        const bi = b.order_index ?? Number.MAX_SAFE_INTEGER;
        if (ai !== bi) return ai - bi;
        return caseIds.indexOf(a.case_draft_id || '') - caseIds.indexOf(b.case_draft_id || '');
      });
      ordered.forEach((r) => {
        (r.b12_case_subsections || []).sort(
          (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0),
        );
      });

      return {
        rows: ordered,
        participants: (parts || []) as any as B31Participant[],
        flags: {
          num: (prop as any)?.case_include_number !== false,
          ab: (prop as any)?.case_include_abbreviation !== false,
        },
        proposalId,
      };
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['b12-cases-node', idsKey] });

  const saveCaseField = async (id: string, field: 'title' | 'short_name', value: string) => {
    await supabase.from('b12_cases').update({ [field]: value || null }).eq('id', id);
    invalidate();
  };

  const saveSubField = async (id: string, field: 'heading' | 'body', value: string) => {
    await supabase.from('b12_case_subsections').update({ [field]: value || null }).eq('id', id);
    invalidate();
  };

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
          No cases populated. Use the case manager to populate this table.
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
                entityTable="b12_cases"
                currentLeaderId={c.lead_participant_id}
                participants={data.participants}
                proposalId={data.proposalId}
                showCrown
                arrowPosition="right"
                placeholder="Select case lead"
                invalidateKeys={[['b12-cases-node', idsKey], ['b12-cases', data.proposalId]]}
              />
            </div>

            {/* Editable full title (bold) */}
            <div style={{ marginBottom: 8, fontWeight: 700 }}>
              <EditableHeaderText
                value={c.title || ''}
                onSave={(val) => saveCaseField(c.id, 'title', val)}
              />
            </div>

            {/* Editable subsections */}
            {(c.b12_case_subsections || []).map((s) => (
              <div key={s.id} style={{ marginBottom: 6 }}>
                <div style={{ fontWeight: 700, fontStyle: 'italic' }}>
                  <EditableHeaderText
                    value={s.heading || ''}
                    onSave={(val) => saveSubField(s.id, 'heading', val)}
                  />
                </div>
                <EditableText
                  value={s.body || ''}
                  onSave={(val) => saveSubField(s.id, 'body', val)}
                  placeholder="Click to add content…"
                />
              </div>
            ))}
          </div>
        );
      })}
    </NodeViewWrapper>
  );
}

export default CasesTableNodeView;
