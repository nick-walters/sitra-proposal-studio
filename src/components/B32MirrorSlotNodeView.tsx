import { lazy, Suspense } from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { useParams } from 'react-router-dom';
import type { B32SlotKey } from '@/extensions/B32MirrorSlotNode';
import {
  B32MirrorParagraphSlot,
  type B32ParagraphSlotKey,
} from '@/components/B32MirrorParagraphSlot';
import { B32MirrorInfrastructureSlot } from '@/components/B32MirrorInfrastructureSlot';

const B32SectionContent = lazy(() =>
  import('@/components/B32SectionContent').then((m) => ({ default: m.B32SectionContent })),
);

const PARAGRAPH_SLOTS: readonly B32ParagraphSlotKey[] = [
  'capacity',
  'value-chain',
  'industrial',
  'international',
];


function proposalIdFromUrl(): string {
  if (typeof window === 'undefined') return '';
  const m = window.location.pathname.match(/\/proposal\/([0-9a-f-]{36})/i);
  return m ? m[1] : '';
}

const SLOT_LABELS: Record<B32SlotKey, string> = {
  interdisciplinarity: 'Interdisciplinarity — expertise matrix',
  capacity: 'Participants\u2019 capacity, contributions & resources',
  infrastructure: 'Critical infrastructure',
  'value-chain': 'Value chain coverage',
  industrial: 'Industrial / commercial involvement',
  international: 'Justification of international organisations & third countries',
};

export interface B32MirrorSlotLiveViewProps {
  proposalId: string;
  slotKey: B32SlotKey | null;
}

/**
 * Stage 3a: dispatch by slot key.
 *  - interdisciplinarity → real expertise matrix (B32SectionContent)
 *  - others → dummy placeholder (Stage 3b will replace with real content).
 */
export function B32MirrorSlotLiveView({ slotKey, proposalId }: B32MirrorSlotLiveViewProps) {
  if (slotKey === 'interdisciplinarity') {
    return (
      <div data-b32-mirror-slot-nodeview="" data-b32-slot-key="interdisciplinarity">
        <Suspense fallback={null}>
          <B32SectionContent proposalId={proposalId} />
        </Suspense>
      </div>
    );
  }

  if (slotKey === 'infrastructure') {
    return (
      <div data-b32-mirror-slot-nodeview="" data-b32-slot-key="infrastructure">
        <B32MirrorInfrastructureSlot proposalId={proposalId} interactive={interactive} />
      </div>
    );
  }


  if (slotKey && (PARAGRAPH_SLOTS as readonly string[]).includes(slotKey)) {
    return (
      <div data-b32-mirror-slot-nodeview="" data-b32-slot-key={slotKey}>
        <B32MirrorParagraphSlot
          proposalId={proposalId}
          slotKey={slotKey as B32ParagraphSlotKey}
        />
      </div>
    );
  }


  const label = slotKey ? SLOT_LABELS[slotKey] : 'unknown';
  return (
    <div
      data-b32-mirror-slot-nodeview=""
      data-b32-slot-key={slotKey ?? ''}
      style={{
        margin: '4px 0',
        padding: '10px 12px',
        border: '1px dashed #9ca3af',
        borderRadius: 4,
        background: '#f9fafb',
        color: '#374151',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 12,
        userSelect: 'text',
      }}
    >
      <strong>[B3.2 mirror: {slotKey ?? '—'} — Stage 3b]</strong>{' '}
      <span style={{ color: '#6b7280' }}>
        {label} — content in Stage 3b (proposal {proposalId || '?'})
      </span>
    </div>
  );
}

export function B32MirrorSlotNodeView(props: NodeViewProps) {
  const { node } = props;
  const slotKey = (node.attrs?.slotKey as B32SlotKey | null) ?? null;
  const params = useParams<{ proposalId?: string }>();
  const proposalId = params.proposalId || proposalIdFromUrl();

  return (
    <NodeViewWrapper
      as="div"
      data-b32-mirror-slot-wrapper=""
      data-b32-slot-key={slotKey ?? ''}
      contentEditable={false}
      draggable={false}
      style={{ margin: '8px 0' }}
    >
      <B32MirrorSlotLiveView proposalId={proposalId} slotKey={slotKey} />
    </NodeViewWrapper>
  );
}

export default B32MirrorSlotNodeView;
