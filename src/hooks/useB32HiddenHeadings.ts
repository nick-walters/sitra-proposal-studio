import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Editor } from '@tiptap/react';
import { supabase } from '@/integrations/supabase/client';

/**
 * B3.2 mirror toggles → hide the owning subsection HEADING when every mirror
 * slot under it is switched off in A2.
 *
 *   "Value chain coverage & industrial involvement" heading
 *      → hidden when mirror_value_chain AND mirror_industrial_involvement are off
 *   "Justification of the participation of international organisations…" heading
 *      → hidden when mirror_participation_justification is off
 *
 * Implementation: flags are written as data-attributes on the ProseMirror root
 * so CSS (index.css) can hide the matching headings without mutating the doc —
 * the headings stay in the stored content and reappear when re-enabled.
 */
export function useB32HiddenHeadings({
  editor,
  proposalId,
  sectionNumber,
}: {
  editor: Editor | null;
  proposalId: string;
  sectionNumber: string | undefined | null;
}) {
  const qc = useQueryClient();
  const active = sectionNumber === 'B3.2';

  const { data } = useQuery({
    queryKey: ['b32-mirror-toggles', proposalId],
    enabled: !!proposalId && active,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select(
          'mirror_contribution_resources, mirror_infrastructure, mirror_value_chain, mirror_industrial_involvement, mirror_participation_justification',
        )
        .eq('id', proposalId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!active) return;
    const handler = () => {
      qc.invalidateQueries({ queryKey: ['b32-mirror-toggles', proposalId] });
    };
    window.addEventListener('cross-ref-data-changed', handler);
    return () => window.removeEventListener('cross-ref-data-changed', handler);
  }, [qc, proposalId, active]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const dom = editor.view?.dom as HTMLElement | undefined;
    if (!dom) return;

    const valueChain = data ? data.mirror_value_chain !== false : true;
    const industrial = data ? data.mirror_industrial_involvement !== false : true;
    const international = data ? data.mirror_participation_justification !== false : true;

    const hideValueChain = active && !valueChain && !industrial;
    const hideInternational = active && !international;

    dom.toggleAttribute('data-b32-hide-value-chain', hideValueChain);
    dom.toggleAttribute('data-b32-hide-international', hideInternational);

    return () => {
      dom.removeAttribute('data-b32-hide-value-chain');
      dom.removeAttribute('data-b32-hide-international');
    };
  }, [editor, data, active]);
}
