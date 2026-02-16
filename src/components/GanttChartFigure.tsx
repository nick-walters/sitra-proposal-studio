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
          .from('wp_draft_deliverables')
          .select('id, wp_draft_id, number, due_month'),
        supabase
          .from('b31_milestones')
          .select('id, number, name, due_month')
          .eq('proposal_id', proposalId)
          .order('number'),
      ]);
      if (wpError) throw wpError;
      if (taskError) throw taskError;
      if (delError) throw delError;
      if (msError) throw msError;

      const wpIds = new Set(wps!.map(wp => wp.id));
      const filteredTasks = (tasks || []).filter(t => wpIds.has(t.wp_draft_id));
      const filteredDeliverables = (deliverables || []).filter(d => wpIds.has(d.wp_draft_id));

      return { wps: wps!, tasks: filteredTasks, deliverables: filteredDeliverables, milestones: msData || [] };
    },
  });

  // Always compute work packages and milestones dynamically from DB
  const dynamicData = useMemo(() => {
    if (!wpDraftsData) return { workPackages: [] as WorkPackage[], milestones: [] as Milestone[] };

    const { wps, tasks, deliverables, milestones: msRows } = wpDraftsData;

    const workPackages: WorkPackage[] = wps.map((wp) => {
      const wpTasks = tasks.filter(t => t.wp_draft_id === wp.id);
      const wpDeliverables = deliverables.filter(d => d.wp_draft_id === wp.id);

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
              .filter(d => d.due_month != null)
              .map(d => ({ number: `${wp.number}.${d.number}`, month: d.due_month! })),
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
  
  // Use proposal-level reporting periods, fall back to content, then default
  const reportingPeriods = useMemo(() => {
    const rpData = (proposalData?.reporting_periods as any[]) || content?.reportingPeriods;
    if (rpData && rpData.length > 0) return rpData;
    // Default: 18-month periods
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

  const getMilestonesForMonth = (month: number) => {
    return milestones.filter(m => m.month === month);
  };

  const handleDurationChange = (duration: number) => {
    onContentChange({
      ...content,
      projectDuration: duration,
    });
  };

  const cellWidth = 11;
  const labelWidth = 220;

  // Border color helpers
  const borderLight = '#d4d4d4';
  const borderQuarter = '#999999';
  const borderYear = '#000000';
  const borderDark = '#000000';

  const getMonthRightBorder = (month: number) => {
    if (month % 12 === 0) return borderYear;
    if (month % 3 === 0) return borderQuarter;
    return borderLight;
  };

  const getFilledCellRightBorder = (month: number, color: string) => {
    if (month % 12 === 0) return `1px solid ${borderYear}`;
    if (month % 3 === 0) return `1px solid ${borderQuarter}`;
    return 'none';
  };

  const headerLabelStyle = "font-bold italic";
  const fontStyle: React.CSSProperties = { fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt' };

  // Truncate task name without trailing space before ellipsis
  const truncateTaskName = (name: string, maxLen = 28) => {
    if (!name || name.length <= maxLen) return name;
    const trimmed = name.substring(0, maxLen).trimEnd();
    return trimmed + '...';
  };

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
        <div ref={chartRef} className="min-w-max overflow-x-auto" style={fontStyle}>
          {/* Reporting Period Row */}
          <div className="flex" style={{ borderTop: `1px solid ${borderDark}`, borderLeft: `1px solid ${borderDark}` }}>
            <div 
              className={`shrink-0 flex items-center justify-end ${headerLabelStyle}`}
              style={{ width: labelWidth, height: 18, padding: '0 0.85pt', borderRight: `1px solid ${borderDark}`, borderBottom: `1px solid ${borderDark}` }}
            >
              Reporting period
            </div>
            {reportingPeriods.map((rp) => {
              const periodMonths = rp.endMonth - rp.startMonth + 1;
              return (
                <div
                  key={rp.number}
                  className="text-center font-bold flex items-center justify-center"
                  style={{ width: periodMonths * cellWidth, height: 18, borderRight: `1px solid ${borderDark}`, borderBottom: `1px solid ${borderDark}` }}
                >
                  {rp.number}
                </div>
              );
            })}
          </div>

          {/* Year Row */}
          <div className="flex" style={{ borderLeft: `1px solid ${borderDark}` }}>
            <div 
              className={`shrink-0 flex items-center justify-end ${headerLabelStyle}`}
              style={{ width: labelWidth, height: 18, padding: '0 0.85pt', borderRight: `1px solid ${borderDark}`, borderBottom: `1px solid ${borderDark}` }}
            >
              Year
            </div>
            {years.map(yr => (
              <div
                key={yr.year}
                className="text-center font-bold flex items-center justify-center"
                style={{ width: yr.months.length * cellWidth, height: 18, borderRight: `1px solid ${borderDark}`, borderBottom: `1px solid ${borderDark}` }}
              >
                {yr.year}
              </div>
            ))}
          </div>

          {/* Month Row - rotated numbers */}
          <div className="flex" style={{ borderLeft: `1px solid ${borderDark}` }}>
            <div 
              className={`shrink-0 flex items-center justify-end ${headerLabelStyle}`}
              style={{ width: labelWidth, height: 28, padding: '0 0.85pt', borderRight: `1px solid ${borderDark}`, borderBottom: `1px solid ${borderDark}` }}
            >
              Month
            </div>
            <div className="flex">
              {months.map(m => (
                <div
                  key={m}
                  className="flex items-center justify-center"
                  style={{ width: cellWidth, height: 28, borderRight: `1px solid ${getMonthRightBorder(m)}`, borderBottom: `1px solid ${borderDark}` }}
                >
                  <span style={{ fontSize: '7pt', writingMode: 'vertical-rl', transform: 'rotate(180deg)', lineHeight: 1 }}>
                    {m}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Milestones Row */}
          <div className="flex" style={{ borderLeft: `1px solid ${borderDark}` }}>
            <div 
              className={`shrink-0 flex items-center justify-end ${headerLabelStyle}`}
              style={{ width: labelWidth, height: 18, padding: '0 0.85pt', borderRight: `1px solid ${borderDark}`, borderBottom: `1px solid ${borderDark}` }}
            >
              Milestone
            </div>
            <div className="flex">
              {months.map(m => {
                const ms = getMilestonesForMonth(m);
                return (
                  <div
                    key={m}
                    className="flex items-center justify-center"
                    style={{ width: cellWidth, height: 18, borderRight: `1px solid ${getMonthRightBorder(m)}`, borderBottom: `1px solid ${borderDark}` }}
                  >
                    {ms.length > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="font-bold" style={{ fontSize: '7pt' }}>
                            {ms.map(mil => mil.number).join('|')}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {ms.map(mil => (
                            <div key={mil.id} className="text-xs">
                              <span className="font-semibold">MS{mil.number}:</span> {mil.name}
                            </div>
                          ))}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Spacer row after header - no left/right borders */}
          <div style={{ height: 4 }} />

          {/* Work Packages and Tasks */}
          {workPackages.map((wp, wpIdx) => {
            const wpColor = wp.color || '#2563EB';
            const taskColor = lightenColor(wpColor, 40);
            const hasTimedTasks = wp.tasks.length > 0;
            
            const untimedTasks = (wpDraftsData?.tasks || [])
              .filter(t => t.wp_draft_id === wpDraftsData?.wps.find(w => w.number === wp.number)?.id)
              .filter(t => t.start_month == null || t.end_month == null);
            const totalRows = wp.tasks.length + untimedTasks.length;
            
            return (
              <div key={wp.number}>
                {/* Spacer row between WPs - no left/right borders */}
                {wpIdx > 0 && (
                  <div style={{ height: 4 }} />
                )}

                {/* WP Header Row - fully filled with WP color, borders in WP color */}
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
                  {/* Right border in WP color */}
                  <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 0, borderRight: `1px solid ${wpColor}` }} />
                  {/* Overlay title spanning the full row */}
                  <div 
                    className="absolute inset-0 flex items-center font-bold text-white truncate"
                    style={{ padding: '0 2px', pointerEvents: 'none' }}
                  >
                    WP{wp.number}: {wp.title || wp.shortName}
                  </div>
                </div>

                {/* Task Rows */}
                {wp.tasks.map((task, taskIdx) => {
                  const isLastRow = untimedTasks.length === 0 && taskIdx === wp.tasks.length - 1;
                  const bottomBorder = isLastRow ? `1px solid ${borderDark}` : `1px solid ${borderLight}`;
                  return (
                    <div key={task.id} className="flex" style={{ borderLeft: `1px solid ${borderDark}` }}>
                      <div 
                        className="shrink-0 truncate flex items-center"
                        style={{ width: labelWidth, height: 18, padding: '0 2px', borderRight: `1px solid ${borderDark}`, borderBottom: bottomBorder }}
                      >
                        <span className="font-medium mr-1" style={{ whiteSpace: 'nowrap' }}>T{task.wpNumber}.{task.taskNumber}:</span>
                        <span className="truncate">{truncateTaskName(task.name) || '(untitled)'}</span>
                      </div>
                      <div className="flex">
                        {months.map(m => {
                          const isInTask = m >= task.startMonth && m <= task.endMonth;
                          const deliverable = task.deliverables?.find(d => d.month === m);
                          
                          return (
                            <div
                              key={m}
                              className="flex items-center justify-center"
                              style={{ 
                                width: cellWidth, 
                                height: 18,
                                backgroundColor: isInTask ? taskColor : undefined,
                                borderRight: isInTask ? getFilledCellRightBorder(m, taskColor) : `1px solid ${getMonthRightBorder(m)}`,
                                borderBottom: bottomBorder,
                              }}
                            >
                              {deliverable && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span 
                                      className="font-bold"
                                      style={{ fontSize: '6pt', color: isInTask ? getContrastingTextColor(taskColor) : undefined }}
                                    >
                                      {deliverable.number}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs font-medium">Deliverable D{deliverable.number}</p>
                                    <p className="text-xs text-muted-foreground">Month {m}</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          );
                        })}
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
                        className="shrink-0 truncate flex items-center"
                        style={{ width: labelWidth, height: 18, padding: '0 2px', borderRight: `1px solid ${borderDark}`, borderBottom: bottomBorder }}
                      >
                        <span className="font-medium mr-1" style={{ whiteSpace: 'nowrap' }}>T{wp.number}.{task.number}:</span>
                        <span className="truncate text-muted-foreground">{truncateTaskName(task.title) || '(untitled)'}</span>
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
