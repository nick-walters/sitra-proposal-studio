import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState, useEffect, useCallback, useRef } from 'react';

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

function formatCount(n: number): string {
  return n < 10 ? NUMBER_WORDS[n] : String(n);
}

function computeDefaultReportingPeriods(duration: number) {
  const periods: { number: number; startMonth: number; endMonth: number }[] = [];
  let start = 1;
  let num = 1;
  while (start <= duration) {
    const remaining = duration - start + 1;
    // Use 18-month periods; if remainder after this would be ≤12, use the remainder directly
    const len = remaining > 18 ? 18 : remaining;
    periods.push({ number: num, startMonth: start, endMonth: start + len - 1 });
    start += len;
    num++;
  }
  return periods;
}

function formatRpLengths(periods: { startMonth: number; endMonth: number }[]): string {
  const lengths = periods.map(p => p.endMonth - p.startMonth + 1);
  if (lengths.length === 0) return '';
  // If all the same, just say "18-month"
  if (lengths.every(l => l === lengths[0])) {
    return `${lengths[0]}-month `;
  }
  // Otherwise list them: "18-month and 12-month" or "18-month, 18-month, and 12-month"
  const parts = lengths.map(l => `${l}-month`);
  if (parts.length === 2) return `${parts[0]} and ${parts[1]} `;
  return parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1] + ' ';
}

interface Props {
  proposalId: string;
  acronymSegments?: { text: string; color: string }[];
  proposalAcronym: string;
}

export function B31IntroText({ proposalId, acronymSegments, proposalAcronym }: Props) {
  const { data: proposalMeta } = useQuery({
    queryKey: ['b31-intro-meta', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select('duration, reporting_periods')
        .eq('id', proposalId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: wpCount } = useQuery({
    queryKey: ['b31-wp-count', proposalId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('wp_drafts')
        .select('id', { count: 'exact', head: true })
        .eq('proposal_id', proposalId);
      if (error) throw error;
      return count || 0;
    },
  });

  const [savedText, setSavedText] = useState<string | null>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    supabase
      .from('section_content')
      .select('content')
      .eq('proposal_id', proposalId)
      .eq('section_id', 'b31-intro-text')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.content) setSavedText(data.content);
      });
  }, [proposalId]);

  const saveText = useCallback((text: string) => {
    setSavedText(text || null);
    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      if (!text) {
        await supabase.from('section_content').delete().eq('proposal_id', proposalId).eq('section_id', 'b31-intro-text');
      } else {
        await supabase.from('section_content').upsert({
          proposal_id: proposalId,
          section_id: 'b31-intro-text',
          content: text,
        }, { onConflict: 'proposal_id,section_id' });
      }
    }, 500);
  }, [proposalId]);

  const duration = proposalMeta?.duration || 36;
  const rps = (proposalMeta?.reporting_periods as any[]);
  const rpCount = (rps && rps.length > 0) ? rps.length : computeDefaultReportingPeriods(duration).length;
  const wps = wpCount || 0;

  const defaultSuffix = ` consists of ${formatCount(wps)} WPs organised into ${formatCount(rpCount)} reporting period${rpCount !== 1 ? 's' : ''} over ${formatCount(duration)} months.`;

  // Render acronym as cross-reference style
  const acronymEl = acronymSegments && acronymSegments.length > 0 ? (
    <span
      data-type="acronymReference"
      style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900 }}
    >
      {acronymSegments.map((seg, i) => (
        <span key={i} style={{ color: seg.color }}>{seg.text}</span>
      ))}
    </span>
  ) : (
    <span
      data-type="acronymReference"
      style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900 }}
    >
      {proposalAcronym}
    </span>
  );

  const displayText = savedText || null;

  return (
    <p
      contentEditable
      suppressContentEditableWarning
      className="outline-none"
      style={{ textAlign: 'justify', margin: 0, fontFamily: '"Times New Roman", Times, serif', fontSize: '11pt', lineHeight: 1.15 }}
      onBlur={(e) => {
        const text = e.currentTarget.textContent || '';
        const defaultFull = (proposalAcronym + defaultSuffix).trim();
        if (!text.trim() || text.trim() === defaultFull) {
          saveText('');
        } else {
          saveText(text);
        }
      }}
    >
      {displayText ? (
        displayText
      ) : (
        <>
          {acronymEl}{defaultSuffix}
        </>
      )}
    </p>
  );
}
