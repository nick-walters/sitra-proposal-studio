import { useMemo } from 'react';
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
import { PERTChartFigure } from './PERTChartFigure';
import { GanttChartFigure } from './GanttChartFigure';


interface Props {
  proposalId: string;
}

export function B31SectionContent({ proposalId }: Props) {
  const { wpData, participants, pertFigure, ganttFigure, subcontractingItems, equipmentItems, loading } = useB31SectionData(proposalId);
  const { data: proposalDuration } = useQuery({
    queryKey: ['proposal-duration', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase.from('proposals').select('duration').eq('id', proposalId).single();
      if (error) throw error;
      return data?.duration || 36;
    },
  });
  const projectDuration = proposalDuration || 36;

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
        <div>
          <GanttChartFigure
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
            defaultCaption="Gantt chart, showing timings of WPs"
            suffix={<>
              <span style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'baseline', border: '1.5px solid #000000', borderRadius: '9999px', padding: '0px 5px', fontSize: '11pt', fontFamily: "'Times New Roman', Times, serif", fontWeight: 'bold', fontStyle: 'normal', lineHeight: 1, color: '#ffffff', backgroundColor: '#000000' }}>WPX</span>
              {', '}tasks{' '}
              <span style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'baseline', border: '1.5px solid #000000', borderRadius: '9999px', padding: '0px 5px', fontSize: '11pt', fontFamily: "'Times New Roman', Times, serif", fontWeight: 'bold', fontStyle: 'normal', lineHeight: 1, color: '#000000', backgroundColor: '#ffffff' }}>TX.X</span>
              {', '}deliverables{' '}
              <svg width={32} height={12} viewBox="0 0 32 12" style={{ display: 'inline-block', verticalAlign: 'baseline', overflow: 'visible' }}>
                <path d="M 0,0 L 26,0 L 32,6 L 26,12 L 0,12 Z" fill="#ffffff" stroke="#000000" strokeWidth={1.5} strokeLinejoin="round" />
                <text x={13} y={9.5} textAnchor="middle" fontFamily="'Times New Roman', Times, serif" fontSize="8pt" fontWeight={700} fill="#000000">DX.X</text>
              </svg>
              {' '}&amp; milestones{' '}
              <svg width={14} height={14} viewBox="0 0 14 14" style={{ display: 'inline-block', verticalAlign: 'baseline', overflow: 'visible' }}>
                <path d="M 0,0 L 14,7 L 0,14 Z" fill="#000000" />
                <text x={5} y={10.5} textAnchor="middle" fontFamily="'Times New Roman', Times, serif" fontSize="8pt" fontWeight={700} fill="#ffffff" letterSpacing="-0.5">X</text>
              </svg>
            </>}
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
