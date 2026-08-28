import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ParticipantBubble } from './B31Pill';
import { EditableCaption } from '@/components/EditableCaption';
import { B32_INFRA_DEFAULT_HEADING } from '@/extensions/B32InfraTableNode';

/**
 * B3.2's "Access to critical infrastructure" table.
 *
 * One column. Each row is one participant organisation, carrying that
 * participant's 200-character "how it will support the project" notes in A2
 * order, semicolon-separated, followed by the participant's badge. A
 * participant with no such notes has NO row: the table lists access that
 * exists, not organisations.
 */

export const B32_INFRA_TABLE_KEY = 'b32-infrastructure';

interface Row {
  participantId: string;
  number: number | null;
  shortName: string;
  text: string;
}

export function useB32InfraRows(proposalId: string) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['b32-infra-table', proposalId],
    enabled: !!proposalId,
    queryFn: async (): Promise<Row[]> => {
      const partsR = await supabase
        .from('participants')
        .select('id, participant_number, organisation_short_name, organisation_name')
        .eq('proposal_id', proposalId)
        .order('participant_number', { ascending: true });
      if (partsR.error) throw partsR.error;
      const participants = partsR.data || [];
      if (participants.length === 0) return [];

      const infraR = await supabase
        .from('participant_infrastructure')
        .select('participant_id, project_support, order_index')
        .in(
          'participant_id',
          participants.map((p) => p.id),
        )
        .order('order_index', { ascending: true });
      if (infraR.error) throw infraR.error;

      const byParticipant = new Map<string, string[]>();
      for (const item of (infraR.data || []) as {
        participant_id: string;
        project_support: string | null;
      }[]) {
        const text = (item.project_support || '').trim().replace(/[;.\s]+$/, '');
        if (!text) continue;
        const list = byParticipant.get(item.participant_id) || [];
        list.push(text);
        byParticipant.set(item.participant_id, list);
      }

      return participants
        .map((p) => ({
          participantId: p.id,
          number: p.participant_number ?? null,
          shortName: p.organisation_short_name || p.organisation_name || '',
          text: (byParticipant.get(p.id) || []).join('; '),
        }))
        .filter((r) => r.text.length > 0);
    },
  });

  useEffect(() => {
    const handler = () => qc.invalidateQueries({ queryKey: ['b32-infra-table', proposalId] });
    window.addEventListener('cross-ref-data-changed', handler);
    return () => window.removeEventListener('cross-ref-data-changed', handler);
  }, [qc, proposalId]);

  return query;
}

interface LiveProps {
  proposalId: string;
  heading: string;
  onHeadingChange?: (next: string) => void;
  editable?: boolean;
}

export function B32InfraTableLiveView({
  proposalId,
  heading,
  onHeadingChange,
  editable = false,
}: LiveProps) {
  const { data } = useB32InfraRows(proposalId);
  const rows = useMemo(() => data ?? [], [data]);
  const [draft, setDraft] = useState(heading);
  useEffect(() => setDraft(heading), [heading]);

  if (rows.length === 0) return null;

  return (
    <div
      data-b32-infra-table-view=""
      className="mirror-surface b31-tables-container space-y-1 [&_p]:!my-0 mt-[2px]"
    >
      <EditableCaption
        proposalId={proposalId}
        tableKey={B32_INFRA_TABLE_KEY}
        label="Table 3.2.b."
        defaultCaption="Access to critical infrastructure"
      />
      <table
        data-table-key={B32_INFRA_TABLE_KEY}
        className="platform-table platform-table--tight"
        style={{ tableLayout: 'fixed', borderCollapse: 'collapse', width: '100%' }}
      >
        <colgroup>
          <col style={{ width: '100%' }} />
        </colgroup>
        <thead>
          <tr>
            <th className="cell-pl-0 py-0 text-[11pt] text-left align-bottom">
              {editable && onHeadingChange ? (
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => {
                    const next = draft.trim() || B32_INFRA_DEFAULT_HEADING;
                    setDraft(next);
                    if (next !== heading) onHeadingChange(next);
                  }}
                  className="w-full bg-transparent border-0 outline-none p-0 text-[11pt] font-bold"
                  aria-label="Table heading"
                />
              ) : (
                heading
              )}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.participantId}>
              <td className="align-top cell-pl-0 py-0 leading-tight text-[11pt]">
                <span>{r.text}</span>{' '}
                <ParticipantBubble number={r.number ?? undefined} shortName={r.shortName} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function proposalIdFromUrl(): string {
  if (typeof window === 'undefined') return '';
  const m = window.location.pathname.match(/\/proposal\/([0-9a-f-]{36})/i);
  return m ? m[1] : '';
}

export function B32InfraTableNodeView(props: NodeViewProps) {
  const { node, updateAttributes, editor } = props;
  const params = useParams<{ proposalId?: string }>();
  const proposalId = params.proposalId || proposalIdFromUrl();
  const heading = (node.attrs?.heading as string) || B32_INFRA_DEFAULT_HEADING;

  return (
    <NodeViewWrapper
      as="div"
      data-b32-infra-table-wrapper=""
      contentEditable={false}
      draggable={false}
      style={{ margin: '8px 0' }}
    >
      <B32InfraTableLiveView
        proposalId={proposalId}
        heading={heading}
        editable={editor?.isEditable !== false}
        onHeadingChange={(next) => updateAttributes({ heading: next })}
      />
    </NodeViewWrapper>
  );
}

export default B32InfraTableNodeView;
