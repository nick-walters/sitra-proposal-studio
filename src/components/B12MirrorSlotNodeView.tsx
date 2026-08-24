import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeEditorHtml } from '@/lib/editorContentSanitizer';
import type { B12SlotKey } from '@/extensions/B12MirrorSlotNode';
import { B12MethodologiesSlotContent } from '@/components/B12MethodologiesSlotContent';
import { B12LinkedActivitiesSlotContent } from '@/components/B12LinkedActivitiesSlotContent';


function proposalIdFromUrl(): string {
  if (typeof window === 'undefined') return '';
  const m = window.location.pathname.match(/\/proposal\/([0-9a-f-]{36})/i);
  return m ? m[1] : '';
}

export interface MethodologySubsectionRow {
  id: string;
  proposalId: string;
  key: string;
  title: string;
  orderIndex: number;
  isVisible: boolean;
  contentHtml: string | null;
}

/**
 * Same query key + shape as useMethodologySubsections on the Methodologies
 * page, so edits there propagate to B1.2 without a reload.
 */
export function useMethodologySubsectionsMirror(proposalId: string) {
  return useQuery({
    queryKey: ['methodology-subsections', proposalId],
    enabled: !!proposalId,
    queryFn: async (): Promise<MethodologySubsectionRow[]> => {
      if (!proposalId) return [];
      const { data, error } = await supabase
        .from('methodology_subsections')
        .select('id, proposal_id, key, title, order_index, is_visible, content_html')
        .eq('proposal_id', proposalId)
        .order('order_index');
      if (error) throw error;
      return (data || []).map((r) => ({
        id: r.id,
        proposalId: r.proposal_id,
        key: r.key,
        title: r.title,
        orderIndex: r.order_index,
        isVisible: r.is_visible,
        contentHtml: r.content_html,
      }));
    },
  });
}


export interface B12MirrorSlotLiveViewProps {
  proposalId: string;
  slotKey: B12SlotKey | null;
  /** Methodologies slots only: which run of items this slot renders. */
  runIndex?: number | null;
}

/**
 * Read-only mirror of one methodology subsection's content.
 * The 'methodologies' key renders one RUN of methodology items; the runs are
 * split at the case placeholders so cases tables can sit between the slots.
 */
export function B12MirrorSlotLiveView({
  slotKey,
  proposalId,
  runIndex = null,
}: B12MirrorSlotLiveViewProps) {
  const { data: subsections = [] } = useMethodologySubsectionsMirror(proposalId);
  const row = slotKey ? subsections.find((s) => s.key === slotKey) : undefined;

  const html = row?.contentHtml ? sanitizeEditorHtml(row.contentHtml) : '';

  const isMethodologies = slotKey === 'methodologies';
  // RETIRED: the linked activities table now lives in its own B1.2 block, so
  // the mirror slot would render it a second time. The slot renders nothing.
  const isLinkedActivities = slotKey === 'linked_activities';

  return (
    <div
      data-b12-mirror-slot-nodeview=""
      data-b12-slot-key={slotKey ?? ''}
      data-b12-run-index={runIndex === null ? undefined : String(runIndex)}
      style={{ userSelect: 'text' }}
    >
      {isLinkedActivities ? null : isMethodologies ? (
        <B12MethodologiesSlotContent proposalId={proposalId} runIndex={runIndex ?? 0} />
      ) : html ? (
        <div className="ProseMirror-mirrored" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p className="text-muted-foreground italic text-sm print:hidden">
          No content yet — write it on the Methodologies page.
        </p>
      )}

    </div>
  );

}

export function B12MirrorSlotNodeView(props: NodeViewProps) {
  const { node } = props;
  const slotKey = (node.attrs?.slotKey as string | null) ?? null;
  const runIndex =
    typeof node.attrs?.runIndex === 'number' ? (node.attrs.runIndex as number) : null;
  const params = useParams<{ proposalId?: string; id?: string }>();
  const proposalId = params.proposalId || params.id || proposalIdFromUrl();

  return (
    <NodeViewWrapper
      as="div"
      data-b12-mirror-slot-wrapper=""
      data-b12-slot-key={slotKey ?? ''}
      data-b12-run-index={runIndex === null ? undefined : String(runIndex)}
      contentEditable={false}
      draggable={false}
      style={{ margin: '4px 0' }}
    >
      <B12MirrorSlotLiveView proposalId={proposalId} slotKey={slotKey} runIndex={runIndex} />
    </NodeViewWrapper>
  );
}


export default B12MirrorSlotNodeView;
