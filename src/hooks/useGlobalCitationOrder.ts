import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Match citation superscripts and prefer the stable internal id in data-citation.
// Falls back to numeric text so older saved citations still produce footnotes.
const SUP_RE = /<sup\b([^>]*)>([\s\S]*?)<\/sup>/gi;

export function extractCitedNumbersInOrder(html: string): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  if (!html) return out;
  let m: RegExpExecArray | null;
  const re = new RegExp(SUP_RE.source, 'gi');
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || '';
    const body = m[2] || '';
    const dataMatch = attrs.match(/\bdata-citation=(?:"(\d+)"|'(\d+)'|(\d+))/i);
    const text = body.replace(/<[^>]+>/g, '').trim();
    const textMatch = text.match(/^\[?\s*(\d+)\s*\]?$/);
    const n = parseInt(dataMatch?.[1] || dataMatch?.[2] || dataMatch?.[3] || textMatch?.[1] || '', 10);
    if (Number.isFinite(n) && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

/**
 * Computes a proposal-wide citation display order based on order of first
 * appearance across all Part B sections. The DB `citation_number` acts as a
 * stable internal id; the returned displayMap converts it to the sequential
 * number shown in the rendered document.
 */
export function useGlobalCitationOrder(
  proposalId: string | undefined,
  currentSectionId?: string,
  currentContent?: string,
) {
  const [rows, setRows] = useState<Array<{ section_id: string; content: string }>>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!proposalId) return;
    let cancelled = false;
    supabase
      .from('section_content')
      .select('section_id, content')
      .eq('proposal_id', proposalId)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setRows(data.filter((r: any) => /^b/i.test(r.section_id)) as any);
      });
    return () => {
      cancelled = true;
    };
  }, [proposalId, tick]);

  useEffect(() => {
    if (!proposalId) return;
    const ch = supabase
      .channel(`section_content-cite-${proposalId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'section_content', filter: `proposal_id=eq.${proposalId}` },
        () => setTick((k) => k + 1),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [proposalId]);

  return useMemo(() => {
    const merged: Record<string, string> = {};
    rows.forEach((r) => {
      merged[r.section_id] = r.content || '';
    });
    if (currentSectionId) {
      merged[currentSectionId] = currentContent ?? merged[currentSectionId] ?? '';
    }
    const sectionIds = Object.keys(merged).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
    );
    const displayMap = new Map<number, number>();
    let next = 1;
    for (const sid of sectionIds) {
      for (const n of extractCitedNumbersInOrder(merged[sid])) {
        if (!displayMap.has(n)) displayMap.set(n, next++);
      }
    }
    const sectionCitedNumbers = currentSectionId
      ? extractCitedNumbersInOrder(merged[currentSectionId] || '')
      : [];
    return { displayMap, sectionCitedNumbers };
  }, [rows, currentSectionId, currentContent]);
}
