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
  const { toggles } = useB31JustificationToggles(proposalId);
  const {
    wpData, participants, pertFigure, ganttFigure,
    subcontractingByParticipant, equipmentByParticipant,
    travelByParticipant, otherGoodsByParticipant, fstpByParticipant, internallyInvoicedByParticipant,
    loading,
  } = useB31SectionData(proposalId, { includeAllEquipment: toggles.equipment_all });
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

  // Sequential numbering for cost-justification tables — order is fixed by cost
  // category (B, C.2, C.1, C.3, D.1, D.2). Letters start at 'g' for the first
  // included table and increment only for tables that actually render.
  type JustKey = 'subcontracting' | 'equipment' | 'travel' | 'other_goods' | 'fstp' | 'internally_invoiced';
  const ORDER: JustKey[] = ['subcontracting', 'equipment', 'travel', 'other_goods', 'fstp', 'internally_invoiced'];
  const included: Record<JustKey, boolean> = {
    subcontracting: subcontractingByParticipant.length > 0,
    equipment: equipmentByParticipant.length > 0,
    travel: toggles.travel && travelByParticipant.length > 0,
    other_goods: toggles.other_goods && otherGoodsByParticipant.length > 0,
    fstp: toggles.fstp && fstpByParticipant.length > 0,
    internally_invoiced: toggles.internally_invoiced && internallyInvoicedByParticipant.length > 0,
  };
  const labelMap: Partial<Record<JustKey, string>> = {};
  let letterIdx = 0; // 0 → 'g'
  for (const key of ORDER) {
    if (!included[key]) continue;
    labelMap[key] = `Table 3.1.${String.fromCharCode(103 + letterIdx)}.`;
    letterIdx += 1;
  }

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

      {/* Cost-justification tables — numbered sequentially from 3.1.g onwards. */}
      {included.subcontracting && (
        <B31SubcontractingTable
          items={subcontractingByParticipant}
          participants={participants}
          proposalId={proposalId}
          tableLabel={labelMap.subcontracting}
        />
      )}
      {included.equipment && (
        <B31EquipmentTable
          items={equipmentByParticipant}
          participants={participants}
          proposalId={proposalId}
          tableLabel={labelMap.equipment}
        />
      )}
      {included.travel && (
        <B31JustificationTable
          items={travelByParticipant}
          participants={participants}
          proposalId={proposalId}
          tableKey="travel-justification"
          tableLabel={labelMap.travel!}
          defaultCaption="Travel and subsistence cost items"
        />
      )}
      {included.other_goods && (
        <B31JustificationTable
          items={otherGoodsByParticipant}
          participants={participants}
          proposalId={proposalId}
          tableKey="other-goods-justification"
          tableLabel={labelMap.other_goods!}
          defaultCaption="Other goods, works and services cost items"
        />
      )}
      {included.fstp && (
        <B31JustificationTable
          items={fstpByParticipant}
          participants={participants}
          proposalId={proposalId}
          tableKey="fstp-justification"
          tableLabel={labelMap.fstp!}
          defaultCaption="Financial support to third parties cost items"
        />
      )}
      {included.internally_invoiced && (
        <B31JustificationTable
          items={internallyInvoicedByParticipant}
          participants={participants}
          proposalId={proposalId}
          tableKey="internally-invoiced-justification"
          tableLabel={labelMap.internally_invoiced!}
          defaultCaption="Internally invoiced goods and services cost items"
        />
      )}
    </div>
  );
}
