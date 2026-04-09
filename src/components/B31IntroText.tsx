import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState, useEffect, useCallback, useRef } from 'react';

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

function formatCount(n: number): string {
  return n < 10 ? NUMBER_WORDS[n] : String(n);
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

  // Simple persist for intro text
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
  const rps = (proposalMeta?.reporting_periods as any[]) || [];
  const rpCount = rps.length || Math.ceil(duration / 18);
  const wps = wpCount || 0;

  const defaultText = `consists of ${formatCount(wps)} WPs organised into ${formatCount(rpCount)} reporting periods over ${formatCount(duration)} months.`;

  const acronymEl = acronymSegments && acronymSegments.length > 0 ? (
    <span style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900 }}>
      {acronymSegments.map((seg, i) => (
        <span key={i} style={{ color: seg.color }}>{seg.text}</span>
      ))}
    </span>
  ) : (
    <strong>{proposalAcronym}</strong>
  );

  const displayText = savedText || defaultText;
  const isDefault = !savedText;

  return (
    <div className="b31-intro-text" style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '11pt', marginBottom: '3pt' }}>
      <p
        contentEditable
        suppressContentEditableWarning
        className="outline-none"
        style={{ textAlign: 'justify', margin: 0 }}
        onBlur={(e) => {
          const text = e.currentTarget.textContent || '';
          if (!text.trim() || text.trim() === defaultText.trim()) {
            saveText('');
          } else {
            saveText(text);
          }
        }}
      >
        {isDefault ? (
          <>
            {acronymEl} {defaultText}
          </>
        ) : (
          displayText
        )}
      </p>
    </div>
  );
}
