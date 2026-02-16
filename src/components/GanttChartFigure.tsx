import { useState, useMemo, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Download, BarChart3, Plus, Trash2, Image, FileDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { getContrastingTextColor, lightenColor } from '@/lib/wpColors';
import { exportAsPng, exportAsPptx } from '@/lib/figureExport';
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
  // Fetch wp_drafts with their tasks
  const { data: wpDraftsData } = useQuery({
    queryKey: ['wp-drafts-gantt', proposalId],
    queryFn: async () => {
      const { data: wps, error: wpError } = await supabase
        .from('wp_drafts')
        .select('id, number, short_name, title, color')
        .eq('proposal_id', proposalId)
        .order('order_index');
      if (wpError) throw wpError;

      // Fetch tasks for each WP
      const { data: tasks, error: taskError } = await supabase
        .from('wp_draft_tasks')
        .select('id, wp_draft_id, number, title, start_month, end_month')
        .in('wp_draft_id', wps.map(wp => wp.id))
        .order('order_index');
      if (taskError) throw taskError;

      // Fetch deliverables
      const { data: deliverables, error: delError } = await supabase
        .from('wp_draft_deliverables')
        .select('id, wp_draft_id, number, due_month')
        .in('wp_draft_id', wps.map(wp => wp.id));
      if (delError) throw delError;

      return { wps, tasks, deliverables };
    },
  });

  // Build work packages from wp_drafts data
  useEffect(() => {
    if (!wpDraftsData || content?.workPackages?.length) return;

    const { wps, tasks, deliverables } = wpDraftsData;

    const workPackages: WorkPackage[] = wps.map((wp) => {
      const wpTasks = tasks.filter(t => t.wp_draft_id === wp.id);
      const wpDeliverables = deliverables.filter(d => d.wp_draft_id === wp.id);

      // Calculate WP timing from tasks
      const taskStartMonths = wpTasks.filter(t => t.start_month).map(t => t.start_month!);
      const taskEndMonths = wpTasks.filter(t => t.end_month).map(t => t.end_month!);
      const startMonth = taskStartMonths.length > 0 ? Math.min(...taskStartMonths) : 1;
      const endMonth = taskEndMonths.length > 0 ? Math.max(...taskEndMonths) : 36;

      return {
        number: wp.number,
        shortName: wp.short_name || `WP${wp.number}`,
        title: wp.title || '',
        startMonth,
        endMonth,
        color: wp.color,
        tasks: wpTasks.map(t => ({
          id: t.id,
          wpNumber: wp.number,
          taskNumber: t.number,
          name: t.title || '',
          startMonth: t.start_month || 1,
          endMonth: t.end_month || 36,
          deliverables: wpDeliverables
            .filter(d => d.due_month && d.due_month >= (t.start_month || 1) && d.due_month <= (t.end_month || 36))
            .map(d => ({ number: `${wp.number}.${d.number}`, month: d.due_month! })),
        })),
      };
    });

    onContentChange({
      projectDuration: 36,
      workPackages,
      milestones: [],
      reportingPeriods: [
        { number: 1, startMonth: 1, endMonth: 18 },
        { number: 2, startMonth: 19, endMonth: 36 },
      ],
    });
  }, [wpDraftsData, content, onContentChange]);

  const projectDuration = content?.projectDuration || 36;
  const workPackages = content?.workPackages || [];
  const milestones = content?.milestones || [];
  const reportingPeriods = content?.reportingPeriods || [
    { number: 1, startMonth: 1, endMonth: 18 },
    { number: 2, startMonth: 19, endMonth: 36 },
  ];

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
      reportingPeriods: duration <= 24 
        ? [{ number: 1, startMonth: 1, endMonth: duration }]
        : [
            { number: 1, startMonth: 1, endMonth: Math.floor(duration / 2) },
            { number: 2, startMonth: Math.floor(duration / 2) + 1, endMonth: duration },
          ],
    });
  };

  const cellWidth = 14;
  const labelWidth = 180;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <BarChart3 className="w-4 h-4" />
          Figure {figureNumber}. Gantt Chart
        </h3>
        <div className="flex items-center gap-2">
          {canEdit && (
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
          )}
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
                if (chartRef.current) {
                  exportAsPptx(chartRef.current, `Gantt-Chart-Figure-${figureNumber}`);
                  toast.success('PPTX downloaded');
                }
              }}>
                <FileDown className="w-4 h-4 mr-2" />
                Download as PPTX
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <TooltipProvider>
        <div ref={chartRef} className="min-w-max text-[9px] font-serif overflow-x-auto" style={{ fontFamily: 'Times New Roman, serif' }}>
          {/* Reporting Period Row */}
          <div className="flex border-t border-l">
            <div 
              className="shrink-0 border-r border-b bg-muted/30 flex items-center justify-end pr-1 font-medium"
              style={{ width: labelWidth, height: 16 }}
            >
              Reporting period
            </div>
            {reportingPeriods.map((rp) => {
              const periodMonths = rp.endMonth - rp.startMonth + 1;
              return (
                <div
                  key={rp.number}
                  className="text-center font-semibold border-r border-b bg-muted/20 flex items-center justify-center"
                  style={{ width: periodMonths * cellWidth, height: 16 }}
                >
                  {rp.number}
                </div>
              );
            })}
          </div>

          {/* Year Row */}
          <div className="flex border-l">
            <div 
              className="shrink-0 border-r border-b bg-muted/30 flex items-center justify-end pr-1 font-medium"
              style={{ width: labelWidth, height: 16 }}
            >
              Year
            </div>
            {years.map(yr => (
              <div
                key={yr.year}
                className="text-center font-semibold border-r border-b bg-muted/20 flex items-center justify-center"
                style={{ width: yr.months.length * cellWidth, height: 16 }}
              >
                {yr.year}
              </div>
            ))}
          </div>

          {/* Month Row */}
          <div className="flex border-l">
            <div 
              className="shrink-0 border-r border-b bg-muted/30 flex items-center justify-end pr-1 font-medium"
              style={{ width: labelWidth, height: 16 }}
            >
              Month
            </div>
            <div className="flex">
              {months.map(m => (
                <div
                  key={m}
                  className="text-center border-r border-b bg-muted/10 flex items-center justify-center"
                  style={{ width: cellWidth, height: 16 }}
                >
                  {m}
                </div>
              ))}
            </div>
          </div>

          {/* Milestones Row */}
          <div className="flex border-l">
            <div 
              className="shrink-0 border-r border-b bg-muted/30 flex items-center justify-end pr-1 font-medium"
              style={{ width: labelWidth, height: 18 }}
            >
              Milestone
            </div>
            <div className="flex">
              {months.map(m => {
                const ms = getMilestonesForMonth(m);
                return (
                  <div
                    key={m}
                    className="border-r border-b flex items-center justify-center"
                    style={{ width: cellWidth, height: 18 }}
                  >
                    {ms.length > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="font-bold text-primary">
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

          {/* Separator */}
          <div className="flex border-l">
            <div className="shrink-0 border-r border-b" style={{ width: labelWidth, height: 4 }} />
            <div className="flex">
              {months.map(m => (
                <div key={m} className="border-r border-b" style={{ width: cellWidth, height: 4 }} />
              ))}
            </div>
          </div>

          {/* Work Packages and Tasks */}
          {workPackages.map((wp) => {
            // Use the WP's color from the database
            const bgColor = wp.color || '#2563EB';
            const lightBg = lightenColor(bgColor, 40);
            
            return (
              <div key={wp.number}>
                {/* WP Header Row */}
                <div className="flex border-l">
                  <div 
                    className="shrink-0 border-r border-b font-bold truncate flex items-center px-1"
                    style={{ width: labelWidth, height: 16, backgroundColor: lightBg }}
                  >
                    WP{wp.number}: {wp.shortName || wp.title}
                  </div>
                  <div className="flex">
                    {months.map(m => {
                      const isInWP = m >= wp.startMonth && m <= wp.endMonth;
                      return (
                        <div
                          key={m}
                          className="border-r border-b"
                          style={{ 
                            width: cellWidth, 
                            height: 16,
                            backgroundColor: isInWP ? bgColor : undefined,
                            opacity: isInWP ? 0.3 : 1,
                          }}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Task Rows */}
                {wp.tasks.map((task) => (
                  <div key={task.id} className="flex border-l hover:bg-muted/10">
                    <div 
                      className="shrink-0 border-r border-b bg-background truncate flex items-center pl-2 pr-1 text-muted-foreground"
                      style={{ width: labelWidth, height: 16 }}
                    >
                      <span className="font-medium text-foreground mr-1">T{task.wpNumber}.{task.taskNumber}:</span>
                      <span className="truncate">{task.name || '(untitled)'}</span>
                    </div>
                    <div className="flex">
                      {months.map(m => {
                        const isInTask = m >= task.startMonth && m <= task.endMonth;
                        const deliverable = task.deliverables?.find(d => d.month === m);
                        
                        return (
                          <div
                            key={m}
                            className="border-r border-b flex items-center justify-center"
                            style={{ 
                              width: cellWidth, 
                              height: 16,
                              backgroundColor: isInTask ? bgColor : undefined,
                              opacity: isInTask ? 0.6 : 1,
                            }}
                          >
                            {deliverable && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span 
                                    className="font-bold text-[7px]"
                                    style={{ color: isInTask ? getContrastingTextColor(bgColor) : undefined }}
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
                ))}

                {/* Spacer between WPs */}
                <div className="flex border-l">
                  <div className="shrink-0 border-r border-b" style={{ width: labelWidth, height: 4 }} />
                  <div className="flex">
                    {months.map(m => (
                      <div key={m} className="border-r border-b" style={{ width: cellWidth, height: 4 }} />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 px-1 text-[8px] text-muted-foreground border-t pt-2">
            <span className="font-semibold">Legend:</span>
            <div className="flex items-center gap-1">
              <div className="w-3 h-2 bg-primary/30 border border-primary/50" />
              <span>WP / Task duration</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-bold text-primary">1</span>
              <span>Milestone number</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-bold text-[7px]">1.1</span>
              <span>Deliverable number</span>
            </div>
          </div>
        </div>
      </TooltipProvider>
    </div>
  );
}
