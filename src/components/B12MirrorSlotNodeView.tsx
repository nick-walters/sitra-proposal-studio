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
}

/**
 * Read-only mirror of one methodology subsection's content.
 * Narrative keys render stored content_html; 'methodologies' and
 * 'linked_activities' render a placeholder until stage 5b.
 */
export function B12MirrorSlotLiveView({
  slotKey,
  proposalId,
}: B12MirrorSlotLiveViewProps) {
  const { data: subsections = [] } = useMethodologySubsectionsMirror(proposalId);
  const row = slotKey ? subsections.find((s) => s.key === slotKey) : undefined;

  const html = row?.contentHtml ? sanitizeEditorHtml(row.contentHtml) : '';

  const isMethodologies = slotKey === 'methodologies';
  const isLinkedActivities = slotKey === 'linked_activities';

  return (
    <div
      data-b12-mirror-slot-nodeview=""
      data-b12-slot-key={slotKey ?? ''}
      style={{ userSelect: 'text' }}
    >
      {isMethodologies ? (
        <B12MethodologiesSlotContent proposalId={proposalId} />
      ) : isLinkedActivities ? (
        <B12LinkedActivitiesSlotContent proposalId={proposalId} />
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
  const params = useParams<{ proposalId?: string; id?: string }>();
  const proposalId = params.proposalId || params.id || proposalIdFromUrl();

  return (
    <NodeViewWrapper
      as="div"
      data-b12-mirror-slot-wrapper=""
      data-b12-slot-key={slotKey ?? ''}
      contentEditable={false}
      draggable={false}
      style={{ margin: '4px 0' }}
    >
      <B12MirrorSlotLiveView proposalId={proposalId} slotKey={slotKey} />
    </NodeViewWrapper>
  );
}

export default B12MirrorSlotNodeView;
