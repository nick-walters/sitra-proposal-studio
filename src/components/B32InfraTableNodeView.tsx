import { useEffect } from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ParticipantBubble } from './B31Pill';
import { EditableCaption } from '@/components/EditableCaption';
import {
  fetchB32InfraTableData,
  joinInfraNotes,
  B32_INFRA_TABLE_KEY,
  B32_INFRA_DEFAULT_CAPTION,
  B32_INFRA_DEFAULT_HEADER,
} from '@/lib/typst/b32InfraData';


function proposalIdFromUrl(): string {
  if (typeof window === 'undefined') return '';
  const m = window.location.pathname.match(/\/proposal\/([0-9a-f-]{36})/i);
  return m ? m[1] : '';
}

interface LiveProps {
  proposalId: string;
  header: string;
  onHeaderChange?: (next: string) => void;
}

export function B32InfraTableLiveView({ proposalId, header, onHeaderChange }: LiveProps) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['b32-infra-table', proposalId],
    enabled: !!proposalId,
    queryFn: () => fetchB32InfraTableData(proposalId),
  });

  useEffect(() => {
    const handler = () => qc.invalidateQueries({ queryKey: ['b32-infra-table', proposalId] });
    window.addEventListener('cross-ref-data-changed', handler);
    return () => window.removeEventListener('cross-ref-data-changed', handler);
  }, [qc, proposalId]);

  const rows = data?.rows || [];
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
        defaultCaption={B32_INFRA_DEFAULT_CAPTION}
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
              <span
                contentEditable={!!onHeaderChange}
                suppressContentEditableWarning
                spellCheck={false}
                onBlur={(e) => onHeaderChange?.(e.currentTarget.textContent?.trim() || B32_INFRA_DEFAULT_HEADER)}
                style={{ outline: 'none' }}
              >
                {header || B32_INFRA_DEFAULT_HEADER}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.participantId}>
              <td className="align-top cell-pl-0 py-0 leading-tight text-[11pt]">
                <span>{joinInfraNotes(row.notes)}</span>{' '}
                <ParticipantBubble
                  number={row.number ?? undefined}
                  shortName={row.shortName}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function B32InfraTableNodeView(props: NodeViewProps) {
  const { node, updateAttributes, editor } = props;
  const params = useParams<{ proposalId?: string }>();
  const proposalId = params.proposalId || proposalIdFromUrl();
  const header = (node.attrs?.header as string) || B32_INFRA_DEFAULT_HEADER;

  return (
    <NodeViewWrapper as="div" data-b32-infra-table-wrapper="" draggable={false} style={{ margin: '8px 0' }}>
      <B32InfraTableLiveView
        proposalId={proposalId}
        header={header}
        onHeaderChange={
          editor?.isEditable ? (next) => updateAttributes({ header: next }) : undefined
        }
      />
    </NodeViewWrapper>
  );
}

export default B32InfraTableNodeView;
