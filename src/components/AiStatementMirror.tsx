import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AI_STATEMENT_PREFIX, DEFAULT_AI_STATEMENT } from "@/lib/aiStatement";

interface AiStatementMirrorProps {
  proposalId: string;
}

/**
 * Read-only mirror of the A1 "AI usage statement".
 * Rendered in the document between the participants list and the
 * "1. Excellence" heading. Edited in A1 only.
 */
export function AiStatementMirror({ proposalId }: AiStatementMirrorProps) {
  const { data } = useQuery({
    queryKey: ['a1-ai-statement', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('part_a1')
        .select('ai_statement_enabled, ai_statement_text')
        .eq('proposal_id', proposalId)
        .maybeSingle();
      if (error) throw error;
      return data as { ai_statement_enabled: boolean | null; ai_statement_text: string | null } | null;
    },
    enabled: !!proposalId,
  });

  if (!data || data.ai_statement_enabled === false) return null;

  const text = (data.ai_statement_text ?? '').trim() || DEFAULT_AI_STATEMENT;

  return (
    <p
      className="mb-4 text-justify"
      style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '11pt', lineHeight: 1.5 }}
    >
      {text}
    </p>
  );
}
