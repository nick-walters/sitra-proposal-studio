import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { EditableCaption } from '@/components/EditableCaption';
import { useB31SectionData } from '@/hooks/useB31SectionData';
import { B31WPListTable } from './B31WPListTable';
import { B31WPDescriptionTables } from './B31WPDescriptionTables';
import { B31DeliverablesTable, B31MilestonesTable, B31RisksTable } from './B31TablesEditor';
import { B31EffortMatrix } from './B31EffortMatrix';
import { B31SubcontractingTable } from './B31SubcontractingTable';
import { B31MergedJustificationTable, type MergedBlock } from './B31MergedJustificationTable';
import { useB31JustificationToggles } from '@/hooks/useB31JustificationToggles';
import { useB31CostPresence } from '@/hooks/useB31CostPresence';
import { PERTChartFigure } from './PERTChartFigure';
import { GanttChartFigure } from './GanttChartFigure';

interface Props {
  proposalId: string;
}

export function B31SectionContent({ proposalId }: Props) {
  const { toggles } = useB31JustificationToggles(proposalId);
  const presence = useB31CostPresence(proposalId);
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

  // ---- Determine which tables render & their letters ----
  const c2ForcedOn = presence.equipmentAboveThreshold;

  // Sub-block inclusion in 3.1.h
  const includeTravel = toggles.purchase_costs && toggles.travel && travelByParticipant.length > 0;
  const includeEquipment =
    (toggles.purchase_costs || c2ForcedOn) &&
    (c2ForcedOn || toggles.equipment) &&
    equipmentByParticipant.length > 0;
  const includeOtherGoods = toggles.purchase_costs && toggles.other_goods && otherGoodsByParticipant.length > 0;
  const purchaseBlocks: MergedBlock[] = [];
  if (includeTravel)      purchaseBlocks.push({ categoryLabel: 'Travel', participants: travelByParticipant });
  if (includeEquipment)   purchaseBlocks.push({ categoryLabel: 'Equipment', participants: equipmentByParticipant });
  if (includeOtherGoods)  purchaseBlocks.push({ categoryLabel: 'Other', participants: otherGoodsByParticipant });
  const includePurchase = purchaseBlocks.length > 0;

  // Sub-block inclusion in 3.1.i
  const includeFstp = toggles.other_direct_costs && toggles.fstp && fstpByParticipant.length > 0;
  const includeInternallyInvoiced = toggles.other_direct_costs && toggles.internally_invoiced && internallyInvoicedByParticipant.length > 0;
  const otherBlocks: MergedBlock[] = [];
  if (includeFstp)                otherBlocks.push({ categoryLabel: 'FSTP', participants: fstpByParticipant });
  if (includeInternallyInvoiced)  otherBlocks.push({ categoryLabel: 'Internally invoiced', participants: internallyInvoicedByParticipant });
  const includeOther = otherBlocks.length > 0;

  const includeSubcontracting = subcontractingByParticipant.length > 0;

  // Sequential lettering starting at 'g'
  let letterIdx = 0;
  const nextLabel = () => `Table 3.1.${String.fromCharCode(103 + letterIdx++)}.`;
  const subLabel  = includeSubcontracting ? nextLabel() : undefined;
  const purchaseLabel = includePurchase ? nextLabel() : undefined;
  const otherLabel = includeOther ? nextLabel() : undefined;

  return (
    <div className="b31-tables-container space-y-4 [&_p]:!my-0 mt-[2px]">
      <B31WPListTable wpData={wpData} participants={participants} proposalId={proposalId} />

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
        <p className="text-muted-foreground text-sm italic">PERT chart will appear here once created in Figures</p>
      )}

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
        <p className="text-muted-foreground text-sm italic">Gantt chart will appear here once created in Figures</p>
      )}

      <B31WPDescriptionTables wpData={wpData} participants={participants} proposalId={proposalId} projectDuration={projectDuration} />
      <B31DeliverablesTable proposalId={proposalId} />
      <B31MilestonesTable proposalId={proposalId} />
      <B31RisksTable proposalId={proposalId} />
      <B31EffortMatrix wpData={wpData} participants={participants} proposalId={proposalId} />

      {/* 3.1.g — Subcontracting */}
      {includeSubcontracting && (
        <B31SubcontractingTable
          items={subcontractingByParticipant}
          participants={participants}
          proposalId={proposalId}
          tableLabel={subLabel}
        />
      )}

      {/* 3.1.h — Purchase costs (merged) */}
      {includePurchase && (
        <B31MergedJustificationTable
          blocks={purchaseBlocks}
          participants={participants}
          proposalId={proposalId}
          tableKey="purchase-costs"
          tableLabel={purchaseLabel!}
          defaultCaption="Purchase cost items"
        />
      )}

      {/* 3.1.i — Other direct cost categories (merged) */}
      {includeOther && (
        <B31MergedJustificationTable
          blocks={otherBlocks}
          participants={participants}
          proposalId={proposalId}
          tableKey="other-direct-costs"
          tableLabel={otherLabel!}
          defaultCaption="Other direct cost items"
        />
      )}
    </div>
  );
}
