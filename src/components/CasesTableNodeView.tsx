import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';

/**
 * CasesTableNodeView — Stage 1 skeleton.
 * Renders a bordered placeholder showing how many cases are bound to the
 * node and their ids. Real case content rendering arrives in stage 2.
 */
export function CasesTableNodeView(props: NodeViewProps) {
  const caseIds: string[] = Array.isArray(props.node.attrs.caseIds)
    ? props.node.attrs.caseIds
    : [];
  const caption: string | null = props.node.attrs.caption ?? null;

  return (
    <NodeViewWrapper
      as="div"
      data-cases-table-nodeview=""
      contentEditable={false}
      style={{
        margin: '12px 0',
        padding: '12px 14px',
        border: '2px dashed #6b7280',
        borderRadius: 6,
        background: '#f9fafb',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
        color: '#111827',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        B1.2 Cases table — {caseIds.length} case{caseIds.length === 1 ? '' : 's'}
      </div>
      {caption && (
        <div style={{ fontStyle: 'italic', marginBottom: 6, color: '#374151' }}>{caption}</div>
      )}
      <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11, wordBreak: 'break-all', color: '#374151' }}>
        {caseIds.length ? caseIds.join(', ') : '(no case ids bound)'}
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: '#6b7280' }}>
        Stage 1 placeholder — real case content renders in stage 2.
      </div>
    </NodeViewWrapper>
  );
}

export default CasesTableNodeView;
