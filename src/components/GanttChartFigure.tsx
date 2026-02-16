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
const MIN_CELL_WIDTH = 8;

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

  // Calculate cell width: quarter labels need ~40px at 11pt with zero padding
  const minQuarterWidth = 40;
  const cellWidth = Math.max(MIN_CELL_WIDTH, Math.ceil(minQuarterWidth / 3));
  const timelineWidth = cellWidth * projectDuration;
  const labelWidth = TOTAL_WIDTH_PX - timelineWidth;

  // Border colors - lighter greys
  const borderLight = '#e5e5e5';
  const borderQuarter = '#b3b3b3';
  const borderYear = '#000000';
  const borderDark = '#000000';

  const getMonthRightBorder = (month: number) => {
    if (month % 12 === 0) return borderYear;
    if (month % 3 === 0) return borderQuarter;
    return borderLight;
  };

  const getFilledCellRightBorder = (month: number) => {
    if (month % 12 === 0) return `1px solid ${borderYear}`;
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
            <Select 
              value={String(projectDuration)} 
              onValueChange={(v) => handleDurationChange(Number(v))}
            >
              <SelectTrigger className="w-24 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24">24 months</SelectItem>
                <SelectItem value="36">36 months</SelectItem>
                <SelectItem value="48">48 months</SelectItem>
                <SelectItem value="60">60 months</SelectItem>
              </SelectContent>
            </Select>
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
            <div className="shrink-0" style={{ width: labelWidth }}>
              <div className={`flex items-center justify-end ${headerLabelStyle}`} style={{ height: 18, padding: '0 2px' }}>
                Reporting period
              </div>
              <div className={`flex items-center justify-end ${headerLabelStyle}`} style={{ height: 18, padding: '0 2px' }}>
                Year
              </div>
              <div className={`flex items-center justify-end ${headerLabelStyle}`} style={{ height: 18, padding: '0 2px' }}>
                Month
              </div>
            </div>
            {/* Grid column with outer border */}
            <div style={{ border: `1px solid ${borderDark}`, width: timelineWidth, flexShrink: 0 }}>
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
                  const isLastQuarter = qi >= Math.ceil(projectDuration / 3) - 1;
                  const isYearBoundary = endM % 12 === 0;
                  const rightBorderColor = isLastQuarter ? undefined : (isYearBoundary ? borderDark : borderQuarter);
                  return (
                    <div
                      key={qi}
                      className="flex items-center justify-center"
                      style={{ width: cellWidth * count, height: 18, padding: 0, borderRight: rightBorderColor ? `1px solid ${rightBorderColor}` : undefined }}
                    >
                      <span style={{ fontSize: '11pt' }}>{startM}–{endM}</span>
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

                {/* WP Header Row */}
                <div className="flex relative" style={{ borderLeft: `1px solid ${wpColor}`, borderTop: `1px solid ${wpColor}` }}>
                  <div 
                    className="shrink-0"
                    style={{ width: labelWidth, height: 18, backgroundColor: wpColor, borderRight: `1px solid ${wpColor}`, borderBottom: `1px solid ${wpColor}` }}
                  />
                  <div className="flex">
                    {months.map(m => (
                      <div
                        key={m}
                        style={{ 
                          width: cellWidth, 
                          height: 18,
                          backgroundColor: wpColor,
                          borderRight: `1px solid ${wpColor}`,
                          borderBottom: `1px solid ${wpColor}`,
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 0, borderRight: `1px solid ${wpColor}` }} />
                  <div 
                    className="absolute inset-0 flex items-center font-bold text-white truncate"
                    style={{ padding: '0 2px', pointerEvents: 'none' }}
                  >
                    WP{wp.number}{wp.title ? `: ${wp.title}` : ''}
                  </div>
                </div>

                {/* Task Rows */}
                {wp.tasks.map((task, taskIdx) => {
                  const isLastRow = untimedTasks.length === 0 && taskIdx === wp.tasks.length - 1;
                  const bottomBorder = isLastRow ? `1px solid ${borderDark}` : `1px solid ${borderLight}`;
                  return (
                    <div key={task.id} className="flex" style={{ borderLeft: `1px solid ${borderDark}`, position: 'relative' }}>
                      <div 
                        className="shrink-0 flex items-center overflow-hidden"
                        style={{ width: labelWidth, height: 18, padding: '0 2px', borderRight: `1px solid ${borderDark}`, borderBottom: bottomBorder }}
                      >
                        <span className="font-medium shrink-0 mr-1" style={{ whiteSpace: 'nowrap' }}>T{task.wpNumber}.{task.taskNumber}:</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.name}</span>
                      </div>
                      <div className="flex" style={{ position: 'relative' }}>
                        {/* Render month cells */}
                        {months.map(m => {
                          const isInTask = m >= task.startMonth && m <= task.endMonth;
                          return (
                            <div
                              key={m}
                              style={{ 
                                width: cellWidth, 
                                height: 18,
                                backgroundColor: isInTask ? taskColor : undefined,
                                borderRight: isInTask ? getFilledCellRightBorder(m) : `1px solid ${getMonthRightBorder(m)}`,
                                borderBottom: bottomBorder,
                              }}
                            />
                          );
                        })}
                        {/* Render bubbles with collision avoidance */}
                        {(() => {
                          // Collect all bubbles for this task
                          const bubbles: { month: number; label: string; color: string; tooltipTitle: string; type: 'del' | 'ms' }[] = [];
                          task.deliverables?.forEach(d => bubbles.push({ month: d.month, label: d.number.replace(/^D/, ''), color: '#16a34a', tooltipTitle: `Deliverable D${d.number}`, type: 'del' }));
                          task.milestones?.forEach(ms => bubbles.push({ month: ms.month, label: String(ms.number), color: '#dc2626', tooltipTitle: `MS${ms.number}: ${ms.name}`, type: 'ms' }));
                          if (bubbles.length === 0) return null;

                          // Sort by month
                          bubbles.sort((a, b) => a.month - b.month);

                          // Estimate bubble width in px (char width ~5.5px at 9pt + 6px horizontal padding + 2px border)
                          const estimateBubbleWidth = (label: string) => Math.max(10, label.length * 5.5 + 8);
                          
                          // Compute positions: center of each bubble's month cell
                          const positioned = bubbles.map(b => ({
                            ...b,
                            centerX: (b.month - 1) * cellWidth + cellWidth / 2,
                            width: estimateBubbleWidth(b.label),
                          }));

                          // Resolve overlaps: group bubbles that would overlap and spread them
                          for (let i = 1; i < positioned.length; i++) {
                            const prev = positioned[i - 1];
                            const curr = positioned[i];
                            const minGap = (prev.width + curr.width) / 2 + 0.67;
                            if (curr.centerX - prev.centerX < minGap) {
                              // Find the full cluster
                              let clusterStart = i - 1;
                              let clusterEnd = i;
                              while (clusterEnd + 1 < positioned.length) {
                                const next = positioned[clusterEnd + 1];
                                const last = positioned[clusterEnd];
                                const gap = (last.width + next.width) / 2 + 0.67;
                                if (next.centerX - last.centerX < gap) {
                                  clusterEnd++;
                                } else break;
                              }
                              // Spread cluster evenly around their midpoint
                              const clusterItems = positioned.slice(clusterStart, clusterEnd + 1);
                              const midX = (clusterItems[0].centerX + clusterItems[clusterItems.length - 1].centerX) / 2;
                              const totalWidth = clusterItems.reduce((sum, item, idx) => {
                                if (idx === 0) return item.width;
                                return sum + 0.67 + item.width;
                              }, 0);
                              let x = midX - totalWidth / 2;
                              for (let j = clusterStart; j <= clusterEnd; j++) {
                                positioned[j].centerX = x + positioned[j].width / 2;
                                x += positioned[j].width + 0.67;
                              }
                              i = clusterEnd;
                            }
                          }

                          return positioned.map((b, idx) => (
                            <Tooltip key={`${b.type}-${idx}`}>
                              <TooltipTrigger asChild>
                                <span
                                  className="font-bold"
                                  style={{
                                    position: 'absolute',
                                    top: '50%',
                                    left: b.centerX,
                                    transform: 'translate(-50%, -50%)',
                                    fontSize: '9pt',
                                    lineHeight: 1,
                                    backgroundColor: '#ffffff',
                                    color: b.color,
                                    border: `1px solid ${b.color}`,
                                    borderRadius: '9999px',
                                    padding: '0 3px',
                                    whiteSpace: 'nowrap',
                                    zIndex: 10,
                                  }}
                                >
                                  {b.label}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs font-medium">{b.tooltipTitle}</p>
                                <p className="text-xs text-muted-foreground">Month {b.month}</p>
                              </TooltipContent>
                            </Tooltip>
                          ));
                        })()}
                      </div>
                    </div>
                  );
                })}

                {/* Untimed task rows */}
                {untimedTasks.map((task, utIdx) => {
                  const isLastRow = utIdx === untimedTasks.length - 1;
                  const bottomBorder = isLastRow ? `1px solid ${borderDark}` : `1px solid ${borderLight}`;
                  return (
                    <div key={task.id} className="flex" style={{ borderLeft: `1px solid ${borderDark}` }}>
                      <div 
                        className="shrink-0 flex items-center overflow-hidden"
                        style={{ width: labelWidth, height: 18, padding: '0 2px', borderRight: `1px solid ${borderDark}`, borderBottom: bottomBorder }}
                      >
                        <span className="font-medium shrink-0 mr-1" style={{ whiteSpace: 'nowrap' }}>T{wp.number}.{task.number}:</span>
                        <span className="text-muted-foreground" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
                      </div>
                      <div className="flex">
                        {months.map(m => (
                          <div
                            key={m}
                            style={{ 
                              width: cellWidth, 
                              height: 18,
                              borderRight: `1px solid ${getMonthRightBorder(m)}`,
                              borderBottom: bottomBorder,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

        </div>
      </TooltipProvider>
    </div>
  );
}
