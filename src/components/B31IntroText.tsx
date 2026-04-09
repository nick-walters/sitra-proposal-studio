import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSectionContent } from '@/hooks/useSectionContent';

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

  const duration = proposalMeta?.duration || 36;
  const rps = (proposalMeta?.reporting_periods as any[]) || [];
  const rpCount = rps.length || Math.ceil(duration / 18);
  const wps = wpCount || 0;

  const { content, updateContent } = useSectionContent(proposalId, 'b31-intro-text');

  const acronymEl = acronymSegments && acronymSegments.length > 0 ? (
    <span style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900 }}>
      {acronymSegments.map((seg, i) => (
        <span key={i} style={{ color: seg.color }}>{seg.text}</span>
      ))}
    </span>
  ) : (
    <strong>{proposalAcronym}</strong>
  );

  const defaultText = `consists of ${formatCount(wps)} WPs organised into ${formatCount(rpCount)} reporting periods over ${formatCount(duration)} months.`;

  // If user has edited, show their version; otherwise show dynamic default
  const displayText = content || defaultText;
  const isDefault = !content;

  return (
    <div className="b31-intro-text mb-4" style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '11pt' }}>
      <p
        contentEditable
        suppressContentEditableWarning
        className="outline-none"
        style={{ textAlign: 'justify' }}
        onBlur={(e) => {
          const text = e.currentTarget.textContent || '';
          // If user cleared it or it matches default, save empty to revert to dynamic
          if (!text.trim() || text.trim() === defaultText.trim()) {
            updateContent('');
          } else {
            updateContent(text);
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
