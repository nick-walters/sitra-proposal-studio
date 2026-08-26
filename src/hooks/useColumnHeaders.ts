import { useCallback, useEffect, useState } from 'react';
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
      const trimmed = value.trim();
      const next = { ...overrides };
      // Typing the template default back in clears the override, so the column
      // resumes following the template.
      if (!trimmed || trimmed === defaults[index]) delete next[String(index)];
      else next[String(index)] = trimmed;
      setOverrides(next);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      await (supabase as any).from('table_column_headers').upsert(
        {
          proposal_id: proposalId,
          table_key: tableKey,
          headers: next,
          updated_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        },
        { onConflict: 'proposal_id,table_key' },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [proposalId, tableKey, overrides, defaults.join('\u0000')],
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
