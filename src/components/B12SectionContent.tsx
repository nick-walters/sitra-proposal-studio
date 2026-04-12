import { B12CaseStudyTables } from './B12CaseStudyTables';
import { B12OngoingProjectsTable } from './B12OngoingProjectsTable';

interface Props {
  proposalId: string;
}

export function B12SectionContent({ proposalId }: Props) {
  return (
    <div className="b12-tables-container space-y-4 [&_p]:!my-0 mt-[20px]">
      <B12CaseStudyTables proposalId={proposalId} />
      <B12OngoingProjectsTable proposalId={proposalId} />
    </div>
  );
}
