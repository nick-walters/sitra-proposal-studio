import { useState, useEffect, useMemo } from 'react';
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

function computeDefaultReportingPeriods(duration: number) {
  const periods: { number: number; startMonth: number; endMonth: number }[] = [];
  const rpLength = 18;
  let start = 1;
  let num = 1;
  while (start <= duration) {
    periods.push({ number: num, startMonth: start, endMonth: Math.min(start + rpLength - 1, duration) });
    start += rpLength;
    num++;
  }
  return periods;
}

function B31IntroText({ proposalId, wpCount }: { proposalId: string; wpCount: number }) {
  const { data: proposalData } = useQuery({
    queryKey: ['b31-intro-data', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select('acronym, duration, reporting_periods, acronym_segments')
        .eq('id', proposalId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const acronym = proposalData?.acronym || 'ACRONYM';
  const duration = proposalData?.duration || 36;
  const acronymSegments = (proposalData?.acronym_segments as any[]) || null;
  const reportingPeriods = (proposalData?.reporting_periods as any[]) || computeDefaultReportingPeriods(duration);
  const rpCount = reportingPeriods.length;

  const storageKey = `b31-intro-${proposalId}`;
  const [customText, setCustomText] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  // Build the default template text
  const defaultText = `${acronym} consists of ${wpCount} WPs organised into ${rpCount} reporting period${rpCount !== 1 ? 's' : ''} over ${duration} months.`;

  useEffect(() => {
    // Load custom text from DB (section_content custom field)
    supabase
      .from('section_content')
      .select('content')
      .eq('proposal_id', proposalId)
      .eq('section_id', 'b31-intro-text')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.content) setCustomText(data.content);
      });
  }, [proposalId]);

  const displayText = customText ?? defaultText;

  const handleSave = async (newText: string) => {
    setCustomText(newText);
    setEditing(false);
    // Upsert to DB
    const { data: existing } = await supabase
      .from('section_content')
      .select('id')
      .eq('proposal_id', proposalId)
      .eq('section_id', 'b31-intro-text')
      .maybeSingle();
    
    if (existing) {
      await supabase.from('section_content').update({ content: newText }).eq('id', existing.id);
    } else {
      await supabase.from('section_content').insert({ proposal_id: proposalId, section_id: 'b31-intro-text', content: newText });
    }
  };

  const handleReset = () => {
    setCustomText(null);
    // Delete custom text from DB
    supabase.from('section_content').delete().eq('proposal_id', proposalId).eq('section_id', 'b31-intro-text').then(() => {});
  };

  // Render the acronym with colored segments
  const renderAcronym = () => {
    if (acronymSegments && acronymSegments.length > 0) {
      return (
        <strong style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900 }}>
          {acronymSegments.map((seg: any, i: number) => (
            <span key={i} style={{ color: seg.color }}>{seg.text}</span>
          ))}
        </strong>
      );
    }
    return <strong style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900 }}>{acronym}</strong>;
  };

  // If user has custom text, show it as editable plain text
  if (customText !== null) {
    return (
      <p
        className="cursor-text hover:bg-muted/20 transition-colors"
        style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', textAlign: 'justify' }}
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => {
          const newText = e.currentTarget.textContent || '';
          if (newText !== customText) handleSave(newText);
        }}
        dangerouslySetInnerHTML={{ __html: customText }}
      />
    );
  }

  // Default: show dynamic text with colored acronym
  return (
    <p
      style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', textAlign: 'justify' }}
      className="cursor-text hover:bg-muted/20 transition-colors"
      contentEditable
      suppressContentEditableWarning
      onBlur={(e) => {
        const newText = e.currentTarget.textContent || '';
        if (newText !== defaultText) handleSave(newText);
      }}
    >
      {renderAcronym()} consists of {wpCount} WPs organised into {rpCount} reporting period{rpCount !== 1 ? 's' : ''} over {duration} months.
    </p>
  );
}

export function B31SectionContent({ proposalId }: Props) {
  const { wpData, participants, pertFigure, ganttFigure, subcontractingByParticipant, equipmentByParticipant, loading } = useB31SectionData(proposalId);
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
    <div className="b31-tables-container space-y-4 [&_p]:!my-0 mt-[20px]">
      {/* Dynamic intro text */}
      <B31IntroText proposalId={proposalId} wpCount={wpData.length} />

      {/* Table 3.1.a – List of work packages */}
      <B31WPListTable wpData={wpData} participants={participants} proposalId={proposalId} />

      {/* Figure 3.1.a – PERT chart */}
      {pertFigure ? (
         <div data-figure-type="pert">
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
        <div data-figure-type="gantt">
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
              <svg width={32} height={12} viewBox="0 0 32 12" style={{ display: 'inline-block', verticalAlign: 'baseline', overflow: 'visible', position: 'relative', top: '2px' }}>
                <path d="M 0,0 L 26,0 L 32,6 L 26,12 L 0,12 Z" fill="#ffffff" stroke="#000000" strokeWidth={1.5} strokeLinejoin="round" />
                <text x={13} y={9.5} textAnchor="middle" fontFamily="'Times New Roman', Times, serif" fontSize="8pt" fontWeight={700} fontStyle="normal" fill="#000000">DX.X</text>
              </svg>
              {' '}&amp; milestones{' '}
              <svg width={17} height={17} viewBox="0 0 17 17" style={{ display: 'inline-block', verticalAlign: 'baseline', overflow: 'visible', position: 'relative', top: '2px' }}>
                <path d="M 17,0 L 0,8.5 L 17,17 Z" fill="#000000" />
                <text x={11} y={12.5} textAnchor="middle" fontFamily="'Times New Roman', Times, serif" fontSize="8pt" fontWeight={700} fontStyle="normal" fill="#ffffff" letterSpacing="-0.5">X</text>
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
      <B31SubcontractingTable items={subcontractingByParticipant} participants={participants} proposalId={proposalId} />

      {/* Table 3.1.h – Equipment (conditional) */}
      <B31EquipmentTable
        items={equipmentByParticipant}
        participants={participants}
        proposalId={proposalId}
      />
    </div>
  );
}
