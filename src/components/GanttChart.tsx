import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Download, ZoomIn, ZoomOut, Flag, FileText, Diamond } from 'lucide-react';

interface Task {
  id: string;
  wpNumber: number;
  taskNumber: number;
  name: string;
  startMonth: number;
  endMonth: number;
  leadPartner?: string;
}

interface Deliverable {
  id: string;
  wpNumber: number;
  deliverableNumber: number;
  name: string;
  month: number;
  type: 'R' | 'DEM' | 'DEC' | 'DATA' | 'DMP' | 'ORDP' | 'ETHICS' | 'SECURITY' | 'OTHER';
}

interface Milestone {
  id: string;
  number: number;
  name: string;
  month: number;
  wpNumbers: number[];
}

interface GanttChartProps {
  projectDuration?: number; // in months
  tasks?: Task[];
  deliverables?: Deliverable[];
  milestones?: Milestone[];
  workPackages?: { number: number; title: string; startMonth: number; endMonth: number }[];
}

// Demo data matching Horizon Europe template
const DEMO_WORK_PACKAGES = [
  { number: 1, title: 'Project Management', startMonth: 1, endMonth: 36 },
  { number: 2, title: 'Requirements & Architecture', startMonth: 1, endMonth: 12 },
  { number: 3, title: 'Core Platform Development', startMonth: 6, endMonth: 30 },
  { number: 4, title: 'Pilot Implementation', startMonth: 18, endMonth: 36 },
  { number: 5, title: 'Dissemination & Exploitation', startMonth: 1, endMonth: 36 },
];

const DEMO_TASKS: Task[] = [
  { id: 't1-1', wpNumber: 1, taskNumber: 1, name: 'Coordination', startMonth: 1, endMonth: 36, leadPartner: 'TUM' },
  { id: 't1-2', wpNumber: 1, taskNumber: 2, name: 'Quality Assurance', startMonth: 1, endMonth: 36, leadPartner: 'CEA' },
  { id: 't2-1', wpNumber: 2, taskNumber: 1, name: 'User Requirements', startMonth: 1, endMonth: 6, leadPartner: 'POLIMI' },
  { id: 't2-2', wpNumber: 2, taskNumber: 2, name: 'System Architecture', startMonth: 4, endMonth: 10, leadPartner: 'TUM' },
  { id: 't2-3', wpNumber: 2, taskNumber: 3, name: 'Technical Specifications', startMonth: 8, endMonth: 12, leadPartner: 'KTH' },
  { id: 't3-1', wpNumber: 3, taskNumber: 1, name: 'Backend Development', startMonth: 6, endMonth: 24, leadPartner: 'CEA' },
  { id: 't3-2', wpNumber: 3, taskNumber: 2, name: 'Frontend Development', startMonth: 10, endMonth: 26, leadPartner: 'NTUA' },
  { id: 't3-3', wpNumber: 3, taskNumber: 3, name: 'Integration & Testing', startMonth: 20, endMonth: 30, leadPartner: 'SIEMENS' },
  { id: 't4-1', wpNumber: 4, taskNumber: 1, name: 'Pilot Planning', startMonth: 18, endMonth: 22, leadPartner: 'POLIMI' },
  { id: 't4-2', wpNumber: 4, taskNumber: 2, name: 'Pilot Execution', startMonth: 22, endMonth: 32, leadPartner: 'KTH' },
  { id: 't4-3', wpNumber: 4, taskNumber: 3, name: 'Evaluation', startMonth: 30, endMonth: 36, leadPartner: 'TUM' },
  { id: 't5-1', wpNumber: 5, taskNumber: 1, name: 'Communication', startMonth: 1, endMonth: 36, leadPartner: 'SIEMENS' },
  { id: 't5-2', wpNumber: 5, taskNumber: 2, name: 'Exploitation Planning', startMonth: 12, endMonth: 36, leadPartner: 'TUM' },
];

const DEMO_DELIVERABLES: Deliverable[] = [
  { id: 'd1', wpNumber: 1, deliverableNumber: 1, name: 'Project Handbook', month: 3, type: 'R' },
  { id: 'd2', wpNumber: 2, deliverableNumber: 1, name: 'Requirements Report', month: 6, type: 'R' },
  { id: 'd3', wpNumber: 2, deliverableNumber: 2, name: 'Architecture Design', month: 12, type: 'R' },
  { id: 'd4', wpNumber: 3, deliverableNumber: 1, name: 'Platform v1.0', month: 18, type: 'DEM' },
  { id: 'd5', wpNumber: 3, deliverableNumber: 2, name: 'Platform v2.0', month: 30, type: 'DEM' },
  { id: 'd6', wpNumber: 4, deliverableNumber: 1, name: 'Pilot Results', month: 33, type: 'R' },
  { id: 'd7', wpNumber: 5, deliverableNumber: 1, name: 'Dissemination Plan', month: 6, type: 'R' },
  { id: 'd8', wpNumber: 5, deliverableNumber: 2, name: 'Exploitation Strategy', month: 24, type: 'R' },
  { id: 'd9', wpNumber: 5, deliverableNumber: 3, name: 'Final Report', month: 36, type: 'R' },
];

const DEMO_MILESTONES: Milestone[] = [
  { id: 'm1', number: 1, name: 'Requirements Frozen', month: 6, wpNumbers: [2] },
  { id: 'm2', number: 2, name: 'Architecture Complete', month: 12, wpNumbers: [2] },
  { id: 'm3', number: 3, name: 'MVP Released', month: 18, wpNumbers: [3] },
  { id: 'm4', number: 4, name: 'Pilots Started', month: 22, wpNumbers: [4] },
  { id: 'm5', number: 5, name: 'Platform Finalized', month: 30, wpNumbers: [3, 4] },
  { id: 'm6', number: 6, name: 'Project Completion', month: 36, wpNumbers: [1, 4, 5] },
];

const WP_COLORS = [
  'bg-primary',
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-purple-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-orange-500',
];

export function GanttChart({
  projectDuration = 36,
  tasks = DEMO_TASKS,
  deliverables = DEMO_DELIVERABLES,
  milestones = DEMO_MILESTONES,
  workPackages = DEMO_WORK_PACKAGES,
}: GanttChartProps) {
  const [zoom, setZoom] = useState<'compact' | 'normal' | 'detailed'>('compact');
  const [showDeliverables, setShowDeliverables] = useState(true);
  const [showMilestones, setShowMilestones] = useState(true);

  const months = Array.from({ length: projectDuration }, (_, i) => i + 1);
  
  // Group months into semesters/years for compact view
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

  // Group tasks by WP
  const tasksByWP = useMemo(() => {
    const grouped: Record<number, Task[]> = {};
    tasks.forEach(task => {
      if (!grouped[task.wpNumber]) grouped[task.wpNumber] = [];
      grouped[task.wpNumber].push(task);
    });
    return grouped;
  }, [tasks]);

  const cellWidth = zoom === 'compact' ? 'w-4' : zoom === 'normal' ? 'w-6' : 'w-8';
  const cellWidthPx = zoom === 'compact' ? 16 : zoom === 'normal' ? 24 : 32;
  const headerHeight = 'h-8';
  const rowHeight = 'h-5';

  const getDeliverableForMonth = (wpNumber: number, month: number) => {
    return deliverables.filter(d => d.wpNumber === wpNumber && d.month === month);
  };

  const getMilestoneForMonth = (month: number) => {
    return milestones.filter(m => m.month === month);
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            Gantt Chart
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={zoom} onValueChange={(v) => setZoom(v as any)}>
              <SelectTrigger className="w-28 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="compact">Compact</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="detailed">Detailed</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-8 gap-1">
              <Download className="w-3 h-3" />
              <span className="text-xs">Export</span>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-2 overflow-x-auto">
        <TooltipProvider>
          <div className="min-w-max">
            {/* Header: Years */}
            <div className="flex border-b">
              <div className="w-48 shrink-0 px-2 py-1 text-[10px] font-medium text-muted-foreground border-r bg-muted/30">
                Work Package / Task
              </div>
              <div className="flex">
                {years.map(yr => (
                  <div
                    key={yr.year}
                    className="text-center text-[10px] font-semibold border-r bg-muted/50"
                    style={{ width: yr.months.length * cellWidthPx }}
                  >
                    Year {yr.year}
                  </div>
                ))}
              </div>
            </div>

            {/* Header: Months */}
            <div className="flex border-b">
              <div className="w-48 shrink-0 border-r bg-muted/30" />
              <div className="flex">
                {months.map(m => (
                  <div
                    key={m}
                    className={`${cellWidth} ${headerHeight} flex items-center justify-center text-[8px] text-muted-foreground border-r`}
                  >
                    {zoom !== 'compact' ? m : m % 3 === 0 ? m : ''}
                  </div>
                ))}
              </div>
            </div>

            {/* Milestones Row */}
            {showMilestones && (
              <div className="flex border-b bg-muted/20">
                <div className="w-48 shrink-0 px-2 py-0.5 text-[10px] font-medium border-r flex items-center gap-1">
                  <Diamond className="w-3 h-3 text-amber-500" />
                  Milestones
                </div>
                <div className="flex relative">
                  {months.map(m => {
                    const ms = getMilestoneForMonth(m);
                    return (
                      <div
                        key={m}
                        className={`${cellWidth} ${rowHeight} border-r flex items-center justify-center`}
                      >
                        {ms.map(milestone => (
                          <Tooltip key={milestone.id}>
                            <TooltipTrigger>
                              <Diamond className="w-3 h-3 text-amber-500 fill-amber-500" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs font-medium">MS{milestone.number}: {milestone.name}</p>
                              <p className="text-xs text-muted-foreground">Month {milestone.month}</p>
                            </TooltipContent>
                          </Tooltip>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Work Packages and Tasks */}
            {workPackages.map((wp) => (
              <div key={wp.number}>
                {/* WP Header Row */}
                <div className="flex border-b bg-muted/40">
                  <div className="w-48 shrink-0 px-2 py-0.5 text-[10px] font-semibold border-r truncate">
                    WP{wp.number}: {wp.title}
                  </div>
                  <div className="flex relative">
                    {months.map(m => {
                      const isInWP = m >= wp.startMonth && m <= wp.endMonth;
                      const dels = showDeliverables ? getDeliverableForMonth(wp.number, m) : [];
                      return (
                        <div
                          key={m}
                          className={`${cellWidth} ${rowHeight} border-r relative ${
                            isInWP ? `${WP_COLORS[wp.number % WP_COLORS.length]} opacity-30` : ''
                          }`}
                        >
                          {dels.map(d => (
                            <Tooltip key={d.id}>
                              <TooltipTrigger className="absolute inset-0 flex items-center justify-center">
                                <FileText className="w-2.5 h-2.5 text-foreground" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs font-medium">D{wp.number}.{d.deliverableNumber}: {d.name}</p>
                                <p className="text-xs text-muted-foreground">Month {d.month} • Type: {d.type}</p>
                              </TooltipContent>
                            </Tooltip>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Task Rows */}
                {tasksByWP[wp.number]?.map((task) => (
                  <div key={task.id} className="flex border-b hover:bg-muted/20">
                    <div className="w-48 shrink-0 px-2 py-0.5 text-[9px] border-r truncate pl-4 text-muted-foreground">
                      T{task.wpNumber}.{task.taskNumber}: {task.name}
                    </div>
                    <div className="flex">
                      {months.map(m => {
                        const isInTask = m >= task.startMonth && m <= task.endMonth;
                        const isStart = m === task.startMonth;
                        const isEnd = m === task.endMonth;
                        return (
                          <div
                            key={m}
                            className={`${cellWidth} ${rowHeight} border-r flex items-center`}
                          >
                            {isInTask && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div
                                    className={`h-2 w-full ${WP_COLORS[wp.number % WP_COLORS.length]} ${
                                      isStart ? 'rounded-l' : ''
                                    } ${isEnd ? 'rounded-r' : ''}`}
                                  />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs font-medium">T{task.wpNumber}.{task.taskNumber}: {task.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    M{task.startMonth}-M{task.endMonth} • Lead: {task.leadPartner}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {/* Legend */}
            <div className="flex items-center gap-4 mt-3 px-2 text-[9px] text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="w-4 h-2 bg-primary rounded" />
                <span>Task Duration</span>
              </div>
              <div className="flex items-center gap-1">
                <Diamond className="w-3 h-3 text-amber-500 fill-amber-500" />
                <span>Milestone</span>
              </div>
              <div className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                <span>Deliverable</span>
              </div>
            </div>
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
