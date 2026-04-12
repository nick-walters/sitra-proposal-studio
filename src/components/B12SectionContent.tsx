import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { B12CaseStudyTables } from './B12CaseStudyTables';
import { B12OngoingProjectsTable } from './B12OngoingProjectsTable';

interface Props {
  proposalId: string;
}

export function B12SectionContent({ proposalId }: Props) {
  const { data: hasCases } = useQuery({
    queryKey: ['b12-has-cases', proposalId],
    queryFn: async () => {
      const { count } = await supabase
        .from('case_drafts')
        .select('id', { count: 'exact', head: true })
        .eq('proposal_id', proposalId)
        .eq('is_hidden', false);
      return (count ?? 0) > 0;
    },
  });

  const ongoingIndex = hasCases ? 1 : 0;

  return (
    <div className="b12-tables-container space-y-4 [&_p]:!my-0 mt-[20px]">
      <B12CaseStudyTables proposalId={proposalId} tableIndex={0} />
      <B12OngoingProjectsTable proposalId={proposalId} tableIndex={ongoingIndex} />
    </div>
  );
}
