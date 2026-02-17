import { useMemo } from 'react';
import { useB31SectionData } from '@/hooks/useB31SectionData';
import { B31WPListTable } from './B31WPListTable';
import { B31WPDescriptionTables } from './B31WPDescriptionTables';
import { B31DeliverablesTable, B31MilestonesTable, B31RisksTable } from './B31TablesEditor';
import { B31EffortMatrix } from './B31EffortMatrix';
import { B31SubcontractingTable } from './B31SubcontractingTable';
import { B31EquipmentTable } from './B31EquipmentTable';
import { PERTChartFigure } from './PERTChartFigure';
import { GanttChartFigure } from './GanttChartFigure';
import { DeliverableTaskMappingDialog } from './DeliverableTaskMappingDialog';
import { MilestoneTaskMappingDialog } from './MilestoneTaskMappingDialog';

const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";

interface Props {
  proposalId: string;
}

export function B31SectionContent({ proposalId }: Props) {
  const { wpData, participants, pertFigure, ganttFigure, subcontractingItems, equipmentItems, loading } = useB31SectionData(proposalId);

  // Compute personnel costs per participant from effort data
  const personnelCostByParticipant = useMemo(() => {
    const map = new Map<string, number>();
    const DEFAULT_RATE = 5000;
    wpData.forEach(wp => {
      wp.tasks.forEach(task => {
        task.effort?.forEach(e => {
          const participant = participants.find(p => p.id === e.participant_id);
          const rate = participant?.personnel_cost_rate || DEFAULT_RATE;
          map.set(e.participant_id, (map.get(e.participant_id) || 0) + (e.person_months || 0) * rate);
        });
      });
    });
    return map;
  }, [wpData, participants]);

  if (loading) return null;

  return (
    <div className="b31-tables-container space-y-4 [&_p]:!my-0 mt-[20px]">
      {/* Table 3.1.a – List of work packages */}
      <B31WPListTable wpData={wpData} participants={participants} proposalId={proposalId} />

      {/* Figure 3.1.a – PERT chart */}
      {pertFigure ? (
        <div>
          <PERTChartFigure
            proposalId={proposalId}
            figureNumber={pertFigure.figure_number}
            content={pertFigure.content as any}
            onContentChange={() => {}}
            canEdit={false}
          />
          <p className={`${tableStyles} italic mt-1`}>
            <span className="font-bold italic">Figure 3.1.a.</span> {pertFigure.caption || pertFigure.title}
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm italic">
          PERT chart will appear here once created in Figures
        </p>
      )}

      {/* Figure 3.1.b – Gantt chart */}
      {ganttFigure ? (
        <div>
          <div className="flex items-center justify-between mb-0">
            <div>{/* spacer */}</div>
            {ganttFigure && (
              <div className="print:hidden flex items-center gap-1 shrink-0">
                <DeliverableTaskMappingDialog proposalId={proposalId} />
                <MilestoneTaskMappingDialog proposalId={proposalId} />
              </div>
            )}
          </div>
          <GanttChartFigure
            proposalId={proposalId}
            figureNumber={ganttFigure.figure_number}
            content={ganttFigure.content as any}
            onContentChange={() => {}}
            canEdit={false}
          />
          <p className={`${tableStyles} italic mt-1`}>
            <span className="font-bold italic">Figure 3.1.b.</span> Gantt chart, showing timings of WPs{' '}
            <span style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', position: 'relative', top: '-1px', border: '1px solid #000000', borderRadius: '9999px', padding: '0 3px', fontSize: '9pt', fontWeight: 'bold', fontStyle: 'normal', lineHeight: 1, color: '#ffffff', backgroundColor: '#000000' }}>WPX</span>
            {', '}tasks{' '}
            <span style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', position: 'relative', top: '-1px', border: '1px solid #000000', borderRadius: '9999px', padding: '0 3px', fontSize: '9pt', fontWeight: 'bold', fontStyle: 'normal', lineHeight: 1, color: '#000000', backgroundColor: '#ffffff' }}>TX.X</span>
            {', '}deliverables{' '}
            <span style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', position: 'relative', top: '-1px', border: '1px solid #000000', borderRadius: '9999px', padding: '0 3px', fontSize: '9pt', fontWeight: 'bold', fontStyle: 'normal', lineHeight: 1, color: '#000000', backgroundColor: '#ffffff' }}>DX.X</span>
            {' '}&amp; milestones{' '}
            <span style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', position: 'relative', top: '-1px', border: '1px solid #000000', borderRadius: '9999px', padding: '0 3px', fontSize: '9pt', fontWeight: 'bold', fontStyle: 'normal', lineHeight: 1, color: '#000000', backgroundColor: '#ffffff' }}>MSX</span>
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm italic">
          Gantt chart will appear here once created in Figures
        </p>
      )}

      {/* Table 3.1.b – Work package descriptions */}
      <B31WPDescriptionTables wpData={wpData} participants={participants} proposalId={proposalId} />

      {/* Table 3.1.c – Deliverables */}
      <B31DeliverablesTable proposalId={proposalId} />

      {/* Table 3.1.d – Milestones */}
      <B31MilestonesTable proposalId={proposalId} />

      {/* Table 3.1.e – Critical risks */}
      <B31RisksTable proposalId={proposalId} />

      {/* Table 3.1.f – Effort matrix */}
      <B31EffortMatrix wpData={wpData} participants={participants} proposalId={proposalId} />

      {/* Table 3.1.g – Subcontracting (conditional) */}
      <B31SubcontractingTable items={subcontractingItems} participants={participants} proposalId={proposalId} />

      {/* Table 3.1.h – Equipment (conditional) */}
      <B31EquipmentTable
        equipmentItems={equipmentItems}
        participants={participants}
        personnelCostByParticipant={personnelCostByParticipant}
        proposalId={proposalId}
      />
    </div>
  );
}
