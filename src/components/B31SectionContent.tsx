import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { EditableCaption } from '@/components/EditableCaption';
import { useB31SectionData } from '@/hooks/useB31SectionData';
import { B31WPListTable } from './B31WPListTable';
import { B31WPDescriptionTables } from './B31WPDescriptionTables';
import { B31DeliverablesTable, B31MilestonesTable, B31RisksTable } from './B31TablesEditor';
import { B31EffortMatrix } from './B31EffortMatrix';
import { B31SubcontractingTable } from './B31SubcontractingTable';
import { B31EquipmentTable } from './B31EquipmentTable';
import { B31JustificationTable } from './B31JustificationTable';
import { useB31JustificationToggles } from '@/hooks/useB31JustificationToggles';
import { PERTChartFigure } from './PERTChartFigure';
import { GanttChartFigure } from './GanttChartFigure';

interface Props {
  proposalId: string;
}

export function B31SectionContent({ proposalId }: Props) {
  const {
    wpData, participants, pertFigure, ganttFigure,
    subcontractingByParticipant, equipmentByParticipant,
    travelByParticipant, otherGoodsByParticipant, fstpByParticipant, internallyInvoicedByParticipant,
    loading,
  } = useB31SectionData(proposalId);
  const { toggles } = useB31JustificationToggles(proposalId);
  const { data: proposalDuration } = useQuery({
    queryKey: ['proposal-duration', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase.from('proposals').select('duration').eq('id', proposalId).single();
      if (error) throw error;
      return data?.duration || 36;
    },
  });
  const projectDuration = proposalDuration || 36;

  if (loading) return null;

  return (
    <div className="b31-tables-container space-y-4 [&_p]:!my-0 mt-[2px]">
      {/* Table 3.1.a – List of work packages */}
      <B31WPListTable wpData={wpData} participants={participants} proposalId={proposalId} />

      {/* Figure 3.1.a – PERT chart */}
      {pertFigure ? (
         <div data-figure-type="pert">
          <PERTChartFigure
            figureId={pertFigure.id}
            proposalId={proposalId}
            figureNumber={pertFigure.figure_number}
            content={pertFigure.content as any}
            onContentChange={() => {}}
            canEdit={false}
          />
          <EditableCaption
            proposalId={proposalId}
            tableKey="figure-3.1.a"
            label="Figure 3.1.a."
            defaultCaption={pertFigure.caption || pertFigure.title}
            className="mt-1"
          />
        </div>
      ) : (
        <p className="text-muted-foreground text-sm italic">
          PERT chart will appear here once created in Figures
        </p>
      )}

      {/* Figure 3.1.b – Gantt chart */}
      {ganttFigure ? (
        <div data-figure-type="gantt">
          <GanttChartFigure
            figureId={ganttFigure.id}
            proposalId={proposalId}
            figureNumber={ganttFigure.figure_number}
            content={ganttFigure.content as any}
            onContentChange={() => {}}
            canEdit={false}
          />
          <EditableCaption
            proposalId={proposalId}
            tableKey="figure-3.1.b"
            label="Figure 3.1.b."
            defaultCaption="Gantt chart"
            className="mt-1"
          />
        </div>
      ) : (
        <p className="text-muted-foreground text-sm italic">
          Gantt chart will appear here once created in Figures
        </p>
      )}

      {/* Table 3.1.b – Work package descriptions */}
      <B31WPDescriptionTables wpData={wpData} participants={participants} proposalId={proposalId} projectDuration={projectDuration} />

      {/* Table 3.1.c – Deliverables */}
      <B31DeliverablesTable proposalId={proposalId} />

      {/* Table 3.1.d – Milestones */}
      <B31MilestonesTable proposalId={proposalId} />

      {/* Table 3.1.e – Critical risks */}
      <B31RisksTable proposalId={proposalId} />

      {/* Table 3.1.f – Effort matrix */}
      <B31EffortMatrix wpData={wpData} participants={participants} proposalId={proposalId} />

      {/* Table 3.1.g – Subcontracting (conditional) */}
      <B31SubcontractingTable items={subcontractingByParticipant} participants={participants} proposalId={proposalId} />

      {/* Table 3.1.h – Equipment (conditional) */}
      <B31EquipmentTable
        items={equipmentByParticipant}
        participants={participants}
        proposalId={proposalId}
      />

      {/* Optional cost-justification tables (coordinator-toggled in A3). */}
      {toggles.travel && (
        <B31JustificationTable
          items={travelByParticipant}
          participants={participants}
          proposalId={proposalId}
          tableKey="travel-justification"
          tableLabel="Table 3.1.i."
          defaultCaption="Travel and subsistence cost items"
        />
      )}
      {toggles.other_goods && (
        <B31JustificationTable
          items={otherGoodsByParticipant}
          participants={participants}
          proposalId={proposalId}
          tableKey="other-goods-justification"
          tableLabel="Table 3.1.j."
          defaultCaption="Other goods, works and services cost items"
        />
      )}
      {toggles.fstp && (
        <B31JustificationTable
          items={fstpByParticipant}
          participants={participants}
          proposalId={proposalId}
          tableKey="fstp-justification"
          tableLabel="Table 3.1.k."
          defaultCaption="Financial support to third parties cost items"
        />
      )}
      {toggles.internally_invoiced && (
        <B31JustificationTable
          items={internallyInvoicedByParticipant}
          participants={participants}
          proposalId={proposalId}
          tableKey="internally-invoiced-justification"
          tableLabel="Table 3.1.l."
          defaultCaption="Internally invoiced goods and services cost items"
        />
      )}
    </div>
  );
}
