import { useState, useMemo, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Download, BarChart3, Plus, Trash2, Image, FileDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { getContrastingTextColor, lightenColor } from '@/lib/wpColors';
import { exportAsPng, exportGanttAsPptx, type GanttExportData } from '@/lib/figureExport';
import { toast } from 'sonner';

interface Task {
  id: string;
  wpNumber: number;
  taskNumber: number;
  name: string;
  startMonth: number;
  endMonth: number;
  deliverables?: { number: string; month: number }[];
  milestones?: { number: number; name: string; month: number }[];
}

interface Milestone {
  id: string;
  number: number;
  name: string;
  month: number;
}

interface WorkPackage {
  number: number;
  shortName: string;
  title: string;
  startMonth: number;
  endMonth: number;
  color: string;
  tasks: Task[];
}

interface GanttContent {
  projectDuration?: number;
  workPackages?: WorkPackage[];
  milestones?: Milestone[];
  reportingPeriods?: { number: number; startMonth: number; endMonth: number }[];
}

interface GanttChartFigureProps {
  figureNumber: string;
  proposalId: string;
  content: GanttContent | null;
  onContentChange: (content: GanttContent) => void;
  canEdit: boolean;
}

// 18cm = 680.315px at 96dpi. We use this as the total chart width.
const TOTAL_WIDTH_PX = 680;
const MIN_CELL_WIDTH = 7;
const MARGIN_GAP = 15; // gap between month columns and right margin

export function GanttChartFigure({
  figureNumber,
  proposalId,
  content,
  onContentChange,
  canEdit,
}: GanttChartFigureProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  // Fetch proposal-level reporting periods
  const { data: proposalData } = useQuery({
    queryKey: ['proposal-rp', proposalId],
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

  // Fetch wp_drafts with their tasks, deliverables, and milestones dynamically
  const { data: wpDraftsData } = useQuery({
    queryKey: ['wp-drafts-gantt', proposalId],
    queryFn: async () => {
      const [
        { data: wps, error: wpError },
        { data: tasks, error: taskError },
        { data: deliverables, error: delError },
        { data: msData, error: msError },
      ] = await Promise.all([
        supabase
          .from('wp_drafts')
          .select('id, number, short_name, title, color')
          .eq('proposal_id', proposalId)
          .order('order_index'),
        supabase
          .from('wp_draft_tasks')
          .select('id, wp_draft_id, number, title, start_month, end_month')
          .order('order_index'),
        supabase
          .from('b31_deliverables')
          .select('id, wp_number, number, due_month, task_id')
          .eq('proposal_id', proposalId),
        supabase
          .from('b31_milestones')
          .select('id, number, name, due_month, task_id')
          .eq('proposal_id', proposalId)
          .order('number'),
      ]);
      if (wpError) throw wpError;
      if (taskError) throw taskError;
      if (delError) throw delError;
      if (msError) throw msError;

      const wpIds = new Set(wps!.map(wp => wp.id));
      const filteredTasks = (tasks || []).filter(t => wpIds.has(t.wp_draft_id));

      return { wps: wps!, tasks: filteredTasks, deliverables: deliverables || [], milestones: msData || [] };
    },
  });

  const dynamicData = useMemo(() => {
    if (!wpDraftsData) return { workPackages: [] as WorkPackage[], milestones: [] as Milestone[] };

    const { wps, tasks, deliverables, milestones: msRows } = wpDraftsData;

    const workPackages: WorkPackage[] = wps.map((wp) => {
      const wpTasks = tasks.filter(t => t.wp_draft_id === wp.id);
      const wpDeliverables = deliverables.filter(d => d.wp_number === wp.number);

      const taskStartMonths = wpTasks.filter(t => t.start_month != null).map(t => t.start_month!);
      const taskEndMonths = wpTasks.filter(t => t.end_month != null).map(t => t.end_month!);
      const startMonth = taskStartMonths.length > 0 ? Math.min(...taskStartMonths) : null;
      const endMonth = taskEndMonths.length > 0 ? Math.max(...taskEndMonths) : null;

      return {
        number: wp.number,
        shortName: wp.short_name || `WP${wp.number}`,
        title: wp.title || '',
        startMonth: startMonth ?? 1,
        endMonth: endMonth ?? 1,
        color: wp.color,
        tasks: wpTasks
          .filter(t => t.start_month != null && t.end_month != null)
          .map(t => ({
            id: t.id,
            wpNumber: wp.number,
            taskNumber: t.number,
            name: t.title || '',
            startMonth: t.start_month!,
            endMonth: t.end_month!,
            deliverables: wpDeliverables
              .filter(d => d.task_id === t.id && d.due_month != null)
              .map(d => ({ number: d.number, month: d.due_month! })),
            milestones: msRows
              .filter(m => m.task_id === t.id && m.due_month != null)
              .map(m => ({ number: m.number, name: m.name, month: m.due_month! })),
          })),
      };
    });

    const msMapped: Milestone[] = msRows
      .filter(m => m.due_month != null)
      .map(m => ({ id: m.id, number: m.number, name: m.name, month: m.due_month! }));

    return { workPackages, milestones: msMapped };
  }, [wpDraftsData]);

  const projectDuration = proposalData?.duration || content?.projectDuration || 36;
  const workPackages = dynamicData.workPackages;
  const milestones = dynamicData.milestones;
  
  const reportingPeriods = useMemo(() => {
    const rpData = (proposalData?.reporting_periods as any[]) || content?.reportingPeriods;
    if (rpData && rpData.length > 0) return rpData;
    const periods: { number: number; startMonth: number; endMonth: number }[] = [];
    let start = 1;
    let num = 1;
    while (start <= projectDuration) {
      const end = Math.min(start + 17, projectDuration);
      periods.push({ number: num, startMonth: start, endMonth: end });
      start = end + 1;
      num++;
    }
    return periods;
  }, [proposalData?.reporting_periods, content?.reportingPeriods, projectDuration]);

  const months = Array.from({ length: projectDuration }, (_, i) => i + 1);
  
  const years = useMemo(() => {
    const yrs: { year: number; months: number[] }[] = [];
    for (let i = 0; i < projectDuration; i += 12) {
      yrs.push({
        year: Math.floor(i / 12) + 1,
        months: months.slice(i, Math.min(i + 12, projectDuration)),
      });
    }
    return yrs;
  }, [projectDuration, months]);

  const handleDurationChange = (duration: number) => {
    onContentChange({ ...content, projectDuration: duration });
  };

  // Calculate cell width: use minimal width for month columns to maximize label space
  const minQuarterWidth = 21;
  const cellWidth = Math.max(MIN_CELL_WIDTH, Math.ceil(minQuarterWidth / 3));
  const timelineWidth = cellWidth * projectDuration;
  const labelWidth = TOTAL_WIDTH_PX - timelineWidth - MARGIN_GAP;

  // Border colors - lighter greys
  const borderLight = '#e5e5e5';
  const borderQuarter = '#b3b3b3';
  const borderYear = '#000000';
  const borderDark = '#000000';

  const getMonthRightBorder = (month: number, yearColor?: string) => {
    if (month % 12 === 0) return yearColor || borderYear;
    if (month % 3 === 0) return borderQuarter;
    return borderLight;
  };

  const getFilledCellRightBorder = (month: number, yearColor?: string) => {
    if (month % 12 === 0) return `1px solid ${yearColor || borderYear}`;
    if (month % 3 === 0) return `1px solid ${borderQuarter}`;
    return 'none';
  };

  const headerLabelStyle = "font-bold italic";
  const fontStyle: React.CSSProperties = { fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', width: '18cm', maxWidth: '100%', boxSizing: 'border-box' };


  return (
    <div className={canEdit ? "space-y-4" : ""}>
      {canEdit && (
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Figure {figureNumber}. Gantt Chart
          </h3>
           <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                  <Download className="w-3 h-3" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {
                  if (chartRef.current) {
                    exportAsPng(chartRef.current, `Gantt-Chart-Figure-${figureNumber}`);
                    toast.success('PNG downloaded');
                  }
                }}>
                  <Image className="w-4 h-4 mr-2" />
                  Download as PNG
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  const exportData: GanttExportData = {
                    projectDuration,
                    workPackages: workPackages.map(wp => ({
                      number: wp.number,
                      shortName: wp.shortName,
                      color: wp.color,
                      startMonth: wp.startMonth,
                      endMonth: wp.endMonth,
                      tasks: wp.tasks.map(t => ({
                        wpNumber: t.wpNumber,
                        taskNumber: t.taskNumber,
                        name: t.name,
                        startMonth: t.startMonth,
                        endMonth: t.endMonth,
                      })),
                    })),
                    milestones: milestones.map(m => ({ number: m.number, name: m.name, month: m.month })),
                  };
                  exportGanttAsPptx(exportData, `Gantt-Chart-Figure-${figureNumber}`);
                  toast.success('PPTX downloaded');
                }}>
                  <FileDown className="w-4 h-4 mr-2" />
                  Download as PPTX
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      <TooltipProvider>
        <div ref={chartRef} className="overflow-hidden" style={fontStyle}>
          {/* Header block: RP, Year, Month rows with unified outer border */}
          <div className="flex">
            {/* Labels column */}
            <div className="shrink-0" style={{ width: labelWidth, paddingTop: 2 }}>
              <div className={`flex items-center justify-end ${headerLabelStyle}`} style={{ height: 18, padding: '0 2px' }}>
                Reporting period
              </div>
              <div className={`flex items-center justify-end ${headerLabelStyle}`} style={{ height: 18, padding: '0 2px' }}>
                Year
              </div>
              <div className={`flex items-center justify-end ${headerLabelStyle}`} style={{ height: 18, padding: '0 2px' }}>
                Quarter
              </div>
            </div>
            {/* Grid column with outer border - shifted left with gap on right */}
            <div style={{ border: `1px solid ${borderDark}`, width: timelineWidth, flexShrink: 0, marginRight: MARGIN_GAP }}>
              {/* Reporting Period Row */}
              <div className="flex">
                {reportingPeriods.map((rp, rpIdx) => {
                  const periodMonths = rp.endMonth - rp.startMonth + 1;
                  return (
                    <div
                      key={rp.number}
                      className="text-center font-bold flex items-center justify-center"
                      style={{ width: periodMonths * cellWidth, height: 18, borderLeft: rpIdx > 0 ? `1px solid ${borderDark}` : undefined }}
                    >
                      {rp.number}
                    </div>
                  );
                })}
              </div>
              {/* Year Row */}
              <div className="flex" style={{ borderTop: `1px solid ${borderDark}` }}>
                {years.map((yr, yrIdx) => (
                  <div
                    key={yr.year}
                    className="text-center font-bold flex items-center justify-center"
                    style={{ width: yr.months.length * cellWidth, height: 18, borderLeft: yrIdx > 0 ? `1px solid ${borderDark}` : undefined }}
                  >
                    {yr.year}
                  </div>
                ))}
              </div>
              {/* Month Row - quarterly groups */}
              <div className="flex" style={{ borderTop: `1px solid ${borderDark}` }}>
                {Array.from({ length: Math.ceil(projectDuration / 3) }, (_, qi) => {
                  const startM = qi * 3 + 1;
                  const endM = Math.min(qi * 3 + 3, projectDuration);
                  const count = endM - startM + 1;
                  const isFirstQuarter = qi === 0;
                  const isYearBoundary = (startM - 1) % 12 === 0;
                  const leftBorderColor = isFirstQuarter ? undefined : (isYearBoundary ? borderDark : borderQuarter);
                  return (
                    <div
                      key={qi}
                      className="flex items-center justify-center"
                      style={{ width: cellWidth * count, height: 18, padding: 0, borderLeft: leftBorderColor ? `1px solid ${leftBorderColor}` : undefined }}
                    >
                      <span style={{ fontSize: '11pt' }}>Q{(qi % 4) + 1}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>


          {/* Slim spacer after header - non-editable */}
          <div style={{ height: 2 }} aria-hidden="true" />

          {/* Work Packages and Tasks */}
          {workPackages.map((wp, wpIdx) => {
            const wpColor = wp.color || '#2563EB';
            const taskColor = '#d4d4d4';
            
            const wpId = wpDraftsData?.wps.find(w => w.number === wp.number)?.id;
            const untimedTasks = (wpDraftsData?.tasks || [])
              .filter(t => t.wp_draft_id === wpId)
              .filter(t => t.start_month == null || t.end_month == null);
            
            return (
              <div key={wp.number}>
                {/* Slim spacer between WPs - non-editable */}
                {wpIdx > 0 && (
                  <div style={{ height: 2 }} aria-hidden="true" />
                )}

                {/* WP Header Row - full width bubble extending to margin */}
                <div className="flex relative" style={{ height: 18 }}>
                  <div 
                    className="absolute flex items-center font-bold text-white truncate rounded-full"
                    style={{ backgroundColor: wpColor, border: `1.5px solid ${wpColor}`, fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', fontWeight: 700, padding: '0 6px', pointerEvents: 'none', top: 0, bottom: 0, left: 0, right: 0 }}
                  >
                    WP{wp.number}: {wp.shortName}{wp.title ? ` – ${wp.title}` : ''}
                  </div>
                </div>

                {/* Task Rows */}
                {wp.tasks.map((task, taskIdx) => {
                  // Pre-compute bubble positions for this task
                  const taskBubbles: { month: number; label: string; color: string; tooltipTitle: string; type: 'del' | 'ms'; sortNum: string }[] = [];
                  task.deliverables?.forEach(d => taskBubbles.push({ month: d.month, label: `D${d.number.replace(/^D/, '')}`, color: wpColor, tooltipTitle: `Deliverable D${d.number}`, type: 'del', sortNum: d.number }));
                  task.milestones?.forEach(ms => taskBubbles.push({ month: ms.month, label: `${ms.number}`, color: '#000000', tooltipTitle: `MS${ms.number}: ${ms.name}`, type: 'ms', sortNum: String(ms.number) }));

                  // Sort: by month, D before MS at same month, then numerically
                  taskBubbles.sort((a, b) => {
                    if (a.month !== b.month) return a.month - b.month;
                    if (a.type !== b.type) return a.type === 'del' ? -1 : 1;
                    return a.sortNum.localeCompare(b.sortNum, undefined, { numeric: true });
                  });

                  const pointDepth = 5;
                  const estimateBubbleW = (label: string) => Math.max(10, label.length * 4 + 6);

                  const msDiamondSize = 17;
                  type PBubble = typeof taskBubbles[0] & { leftX: number; width: number; bodyW: number; triSide: 'right' | 'left' };
                  const positioned: PBubble[] = taskBubbles.map(b => {
                    if (b.type === 'ms') {
                      return {
                        ...b,
                        bodyW: msDiamondSize,
                        width: msDiamondSize,
                        leftX: 0,
                        triSide: 'left' as const,
                      };
                    }
                    const bodyW = estimateBubbleW(b.label);
                    return {
                      ...b,
                      bodyW,
                      width: bodyW + pointDepth,
                      leftX: 0,
                      triSide: 'right' as const,
                    };
                  });

                  // targetX = right border of the month cell (end of month)
                  // Subtract 0.5 to align tip with the center of the 1px cell border
                  const getTargetX = (month: number) => month * cellWidth - 0.5;

                  // Group by month and position
                  const monthGroups = new Map<number, number[]>();
                  positioned.forEach((b, idx) => {
                    if (!monthGroups.has(b.month)) monthGroups.set(b.month, []);
                    monthGroups.get(b.month)!.push(idx);
                  });

                  monthGroups.forEach((indices) => {
                    const tX = getTargetX(positioned[indices[0]].month);
                    if (indices.length === 1) {
                      const b = positioned[indices[0]];
                      if (b.type === 'ms') {
                        // MS: right of month boundary, triangle points left
                        b.leftX = tX;
                        b.triSide = 'left';
                      } else {
                        // D: left of month boundary, triangle points right
                        b.leftX = tX - b.width;
                        b.triSide = 'right';
                      }
                    } else {
                      // Two at same month: first left-aligns to tX, second right-aligns from tX
                      const left = positioned[indices[0]];
                      const right = positioned[indices[1]];
                      left.leftX = tX - left.width;
                      left.triSide = 'right';
                      right.leftX = tX;
                      right.triSide = 'left';
                      // Any extras just stack to the right
                      let nextX = right.leftX + right.width + 1;
                      for (let i = 2; i < indices.length; i++) {
                        positioned[indices[i]].leftX = nextX;
                        positioned[indices[i]].triSide = 'left';
                        nextX += positioned[indices[i]].width + 1;
                      }
                    }
                  });

                  // Resolve overlaps between different-month bubbles
                  for (let ni = 1; ni < positioned.length; ni++) {
                    const prev = positioned[ni - 1];
                    const curr = positioned[ni];
                    if (prev.month === curr.month) continue;
                    const overlap = (prev.leftX + prev.width + 1) - curr.leftX;
                    if (overlap > 0) {
                      if (prev.type === 'ms' && curr.type === 'del') {
                        // D has priority: keep D in default position (pointing right, left of boundary)
                        // MS flips to point right, pushed left of D
                        const currTX = getTargetX(curr.month);
                        curr.leftX = currTX - curr.width;
                        curr.triSide = 'right';
                        const prevTX = getTargetX(prev.month);
                        prev.leftX = Math.min(prevTX - prev.width, curr.leftX - prev.width - 1);
                        prev.triSide = 'right';
                      } else if (prev.type === 'del' && curr.type === 'ms') {
                        // D has priority: keep D in default position (pointing right, left of boundary)
                        // MS flips to point left, pushed right of D
                        const prevTX = getTargetX(prev.month);
                        prev.leftX = prevTX - prev.width;
                        prev.triSide = 'right';
                        const currTX = getTargetX(curr.month);
                        curr.leftX = Math.max(currTX, prev.leftX + prev.width + 1);
                        curr.triSide = 'left';
                      } else {
                        // Same type: earlier points right, later points left (existing behavior)
                        const prevTX = getTargetX(prev.month);
                        prev.leftX = prevTX - prev.width;
                        prev.triSide = 'right';
                        const currTX = getTargetX(curr.month);
                        curr.leftX = currTX;
                        curr.triSide = 'left';
                      }
                    }
                  }

                  // Allow bubbles to extend left of timeline (negative leftX is OK)

                  const rowHeight = 18;
                  const titleWidth = labelWidth - 38 - 6;

                  return (
                    <div key={task.id} className="flex" style={{ position: 'relative' }}>
                      {/* Task number bubble */}
                      <div 
                        className="shrink-0 flex items-center justify-center"
                        style={{ width: 38, height: rowHeight, marginLeft: 6 }}
                      >
                        <span
                          className="inline-flex items-center justify-center rounded-full font-bold"
                          style={{ backgroundColor: '#fff', color: wpColor, border: `1.5px solid ${wpColor}`, fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', fontWeight: 700, lineHeight: 1, padding: '0px 4px', whiteSpace: 'nowrap', verticalAlign: 'baseline' }}
                        >
                          T{task.wpNumber}.{task.taskNumber}
                        </span>
                      </div>
                      {/* Task title - use clip to allow bubbles to visually overlap */}
                      <div 
                        className="shrink-0 flex items-center"
                        style={{ width: titleWidth, height: rowHeight, padding: '0 2px', borderRight: `1px solid ${wpColor}`, overflow: 'visible', position: 'relative' }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: '100%' }}>{task.name}</span>
                      </div>
                      <div className="flex" style={{ position: 'relative', marginRight: MARGIN_GAP }}>
                        {/* Render month cells */}
                        {months.map(m => {
                          const isInTask = m >= task.startMonth && m <= task.endMonth;
                          return (
                            <div
                              key={m}
                              style={{ 
                                width: cellWidth, 
                                height: rowHeight,
                                backgroundColor: isInTask ? taskColor : undefined,
                                borderRight: isInTask ? getFilledCellRightBorder(m, wpColor) : `1px solid ${getMonthRightBorder(m, wpColor)}`,
                              }}
                            />
                          );
                        })}
                        {/* Render positioned bubbles */}
                        {positioned.map((b, idx) => {
                          const topPos = rowHeight / 2;
                          const bH = 10;
                          const r = bH / 2;
                          const isRight = b.triSide === 'right';

                          const isDel = b.type === 'del';
                          const isMs = b.type === 'ms';
                          let svgPath: string;
                          let shapeW: number;
                          let shapeH: number;
                          if (isMs) {
                            // Milestone: right-angled isosceles triangle
                            shapeW = msDiamondSize;
                            shapeH = msDiamondSize;
                            svgPath = isRight
                              ? `M 0,0 L ${shapeW},${shapeH / 2} L 0,${shapeH} Z`
                              : `M 0,${shapeH / 2} L ${shapeW},0 L ${shapeW},${shapeH} Z`;
                          } else {
                            shapeW = b.width;
                            shapeH = bH;
                            // Deliverable: square on non-arrow side, pointed on arrow side
                            svgPath = isRight
                              ? `M 0,0 L ${shapeW - pointDepth},0 L ${shapeW},${shapeH / 2} L ${shapeW - pointDepth},${shapeH} L 0,${shapeH} Z`
                              : `M ${pointDepth},0 L ${shapeW},0 L ${shapeW},${shapeH} L ${pointDepth},${shapeH} L 0,${shapeH / 2} Z`;
                          }

                          return (
                            <Tooltip key={`${b.type}-${idx}`}>
                              <TooltipTrigger asChild>
                                <span
                                  style={{
                                    position: 'absolute',
                                    top: topPos,
                                    left: b.leftX - (isDel ? 1 : 0),
                                    transform: 'translateY(-50%)',
                                    width: shapeW,
                                    height: shapeH,
                                    zIndex: 10,
                                  }}
                                >
                                  <svg
                                    width={shapeW}
                                    height={shapeH}
                                    viewBox={`0 0 ${shapeW} ${shapeH}`}
                                    style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
                                  >
                                    <path
                                      d={svgPath}
                                      fill={isMs ? '#000000' : '#ffffff'}
                                      stroke={isMs ? 'none' : b.color}
                                      strokeWidth={isMs ? 0 : 1.5}
                                      strokeLinejoin={isMs ? 'miter' : 'round'}
                                    />
                                  </svg>
                                  <span
                                    style={{
                                      position: 'absolute',
                                      top: isMs ? -1 : -0.5,
                                      left: isMs ? (isRight ? -1 : Math.round(shapeW * 0.3)) : (isRight ? (isDel ? 1 : 0) : pointDepth),
                                      width: isMs ? (isRight ? Math.round(shapeW * 0.7) : Math.round(shapeW * 0.7)) : b.bodyW,
                                      height: shapeH,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontFamily: "'Times New Roman', Times, serif",
                                      fontSize: '8pt',
                                      fontWeight: 700,
                                      lineHeight: 1,
                                      color: isMs ? '#ffffff' : b.color,
                                      letterSpacing: isMs ? '-0.5px' : undefined,
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {b.label}
                                  </span>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs font-medium">{b.tooltipTitle}</p>
                                <p className="text-xs text-muted-foreground">Month {b.month}</p>
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Untimed task rows */}
                {untimedTasks.map((task, utIdx) => {
                  return (
                    <div key={task.id} className="flex">
                      {/* Task number bubble */}
                      <div 
                        className="shrink-0 flex items-center justify-center"
                        style={{ width: 38, height: 18, marginLeft: 6 }}
                      >
                        <span
                          className="inline-flex items-center justify-center rounded-full font-bold"
                          style={{ backgroundColor: '#fff', color: wpColor, border: `1.5px solid ${wpColor}`, fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', fontWeight: 700, lineHeight: 1, padding: '0px 4px', whiteSpace: 'nowrap', verticalAlign: 'baseline' }}
                        >
                          T{wp.number}.{task.number}
                        </span>
                      </div>
                      {/* Task title */}
                      <div 
                        className="shrink-0 flex items-center overflow-hidden"
                        style={{ width: labelWidth - 38 - 6, height: 18, padding: '0 2px', borderRight: `1px solid ${wpColor}` }}
                      >
                        <span className="text-muted-foreground" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
                      </div>
                      <div className="flex" style={{ marginRight: MARGIN_GAP }}>
                        {months.map(m => (
                          <div
                            key={m}
                            style={{ 
                              width: cellWidth, 
                              height: 18,
                              borderRight: `1px solid ${getMonthRightBorder(m, wpColor)}`,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Bottom border under months columns only */}
                <div className="flex">
                  <div className="shrink-0" style={{ width: labelWidth - 1 }} />
                  <div style={{ width: months.length * cellWidth + 1, height: 0, borderBottom: `1px solid ${wpColor}` }} />
                </div>
              </div>
            );
          })}


        </div>
      </TooltipProvider>
    </div>
  );
}
