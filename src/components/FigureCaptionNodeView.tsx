import { useEffect } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * FigureCaptionNodeView — renders "Figure X. <caption>" live from the
 * figures table. Display-only in editors; caption text is edited on the
 * figure's editor page.
 */
export function FigureCaptionNodeView({ node, updateAttributes }: NodeViewProps) {
  const figureId = node.attrs.figureId as string | null;
  const figureNumberAttr = (node.attrs.figureNumber as string) || '';
  const captionTextAttr = (node.attrs.captionText as string) || '';

  const { data } = useQuery({
    queryKey: ['figure-caption', figureId],
    queryFn: async () => {
      if (!figureId) return null;
      const { data } = await supabase
        .from('figures')
        .select('figure_number, caption, title')
        .eq('id', figureId)
        .maybeSingle();
      return data;
    },
    enabled: !!figureId,
    staleTime: 30_000,
  });

  const liveNumber = (data?.figure_number || figureNumberAttr || '').trim();
  const liveText = (
    (data?.caption && String(data.caption).trim()) ||
    (data?.title && String(data.title).trim()) ||
    captionTextAttr ||
    ''
  ).trim();

  useEffect(() => {
    if (!data) return;
    if (liveNumber !== figureNumberAttr || liveText !== captionTextAttr) {
      updateAttributes({ figureNumber: liveNumber, captionText: liveText });
    }
  }, [data, liveNumber, liveText, figureNumberAttr, captionTextAttr, updateAttributes]);

  return (
    <NodeViewWrapper
      as="p"
      className="figure-caption"
      contentEditable={false}
      data-figure-id={figureId || undefined}
    >
      <em>
        <strong>{liveNumber ? `Figure ${liveNumber}. ` : 'Figure. '}</strong>
        {liveText}
      </em>
    </NodeViewWrapper>
  );
}

export default FigureCaptionNodeView;
