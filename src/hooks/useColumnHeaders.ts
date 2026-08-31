import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/**
 * User-edited column headers for authored tables.
 *
 * Headers are stored per (proposal, table_key) in `table_column_headers` as a
 * sparse object keyed by column index — only columns the user actually renamed
 * are written. Any column with no stored value keeps following the template
 * default, so a later change to the default reaches every proposal that never
 * overrode that column; a proposal that DID override it keeps its own wording.
 */
export function useColumnHeaders(
  proposalId: string | undefined,
  tableKey: string,
  defaults: string[],
) {
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const tableKeyRef = useRef(tableKey);
  tableKeyRef.current = tableKey;



  useEffect(() => {
    if (!proposalId || !tableKey) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from('table_column_headers')
        .select('headers')
        .eq('proposal_id', proposalId)
        .eq('table_key', tableKey)
        .maybeSingle();
      if (cancelled) return;
      const stored = data?.headers;
      if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
        setOverrides(stored as Record<string, string>);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [proposalId, tableKey]);

  const headers = defaults.map((fallback, index) => {
    const stored = overrides[String(index)];
    return typeof stored === 'string' && stored.trim().length > 0 ? stored : fallback;
  });

  const setHeader = useCallback(
    async (index: number, value: string) => {
      if (!proposalId || !tableKey) return;
      // Capture the key this edit belongs to, so a table switch mid-flight
      // cannot land the result under a different table.
      const keyAtWrite = tableKey;
      const trimmed = value.trim();
      // Typing the template default back in clears the override, so the column
      // resumes following the template.
      const clearing = !trimmed || trimmed === defaults[index];

      setOverrides((prev) => {
        const next = { ...prev };
        if (clearing) delete next[String(index)];
        else next[String(index)] = trimmed;
        return next;
      });

      // Merge server-side: only this column is written, so a co-author's edit
      // to another column of the same table is not replaced by a stale map.
      const { data, error } = await (supabase as any).rpc('save_table_column_header', {
        p_proposal_id: proposalId,
        p_table_key: keyAtWrite,
        p_index: index,
        p_value: clearing ? '' : trimmed,
      });
      if (error) {
        toast.error('Column header not saved', { description: error.message });
        return;
      }
      if (keyAtWrite !== tableKeyRef.current) return;
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        setOverrides(data as Record<string, string>);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [proposalId, tableKey, defaults.join('\u0000')],
  );


  return { headers, setHeader };
}

/** Read-only variant for mirrors and exports. */
export async function fetchColumnHeaders(
  proposalId: string,
  tableKey: string,
  defaults: string[],
): Promise<string[]> {
  const { data } = await (supabase as any)
    .from('table_column_headers')
    .select('headers')
    .eq('proposal_id', proposalId)
    .eq('table_key', tableKey)
    .maybeSingle();
  const stored = (data?.headers ?? {}) as Record<string, string>;
  return defaults.map((fallback, index) => {
    const value = stored[String(index)];
    return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
  });
}
