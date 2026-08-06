import { NodeViewWrapper } from '@tiptap/react';
import { OverviewCanvasSection } from '@/components/OverviewCanvasSection';

function proposalIdFromUrl(): string {
  if (typeof window === 'undefined') return '';
  const m = window.location.pathname.match(/\/proposal\/([0-9a-f-]{36})/i);
  return m ? m[1] : '';
}

/**
 * NodeView for the B1.1 project overview canvas slot — renders the read-only
 * canvas + caption inside the editor document flow.
 */
export function OverviewCanvasSlotNodeView() {
  const proposalId = proposalIdFromUrl();
  return (
    <NodeViewWrapper
      as="div"
      data-overview-canvas-slot=""
      data-overview-canvas-slot-nodeview="true"
      contentEditable={false}
      className="my-2"
    >
      {proposalId ? <OverviewCanvasSection proposalId={proposalId} /> : null}
    </NodeViewWrapper>
  );
}

export default OverviewCanvasSlotNodeView;
