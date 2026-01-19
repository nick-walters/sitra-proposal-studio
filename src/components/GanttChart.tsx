import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Download, BarChart3 } from 'lucide-react';

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
  title: string;
  startMonth: number;
  endMonth: number;
  tasks: Task[];
}

interface GanttChartProps {
  projectDuration?: number;
  workPackages?: WorkPackage[];
  milestones?: Milestone[];
  reportingPeriods?: { number: number; startMonth: number; endMonth: number }[];
}

// Demo data matching the Horizon Europe template structure
const DEMO_WORK_PACKAGES: WorkPackage[] = [
  {
    number: 1,
    title: 'Project Management & Coordination',
    startMonth: 1,
    endMonth: 36,
    tasks: [
      { id: 't1-1', wpNumber: 1, taskNumber: 1, name: 'Overall project coordination', startMonth: 1, endMonth: 36, deliverables: [{ number: '1.1', month: 6 }] },
      { id: 't1-2', wpNumber: 1, taskNumber: 2, name: 'Quality assurance & risk mgmt', startMonth: 1, endMonth: 36 },
      { id: 't1-3', wpNumber: 1, taskNumber: 3, name: 'Financial & administrative mgmt', startMonth: 1, endMonth: 36, deliverables: [{ number: '1.2', month: 18 }, { number: '1.3', month: 36 }] },
    ],
  },
  {
    number: 2,
    title: 'Requirements & System Design',
    startMonth: 1,
    endMonth: 15,
    tasks: [
      { id: 't2-1', wpNumber: 2, taskNumber: 1, name: 'Stakeholder & user requirements', startMonth: 1, endMonth: 6, deliverables: [{ number: '2.1', month: 6 }] },
      { id: 't2-2', wpNumber: 2, taskNumber: 2, name: 'Technical specifications', startMonth: 4, endMonth: 10, deliverables: [{ number: '2.2', month: 10 }] },
      { id: 't2-3', wpNumber: 2, taskNumber: 3, name: 'System architecture design', startMonth: 8, endMonth: 15, deliverables: [{ number: '2.3', month: 15 }] },
    ],
  },
  {
    number: 3,
    title: 'Core Technology Development',
    startMonth: 6,
    endMonth: 30,
    tasks: [
      { id: 't3-1', wpNumber: 3, taskNumber: 1, name: 'Backend infrastructure dev', startMonth: 6, endMonth: 24 },
      { id: 't3-2', wpNumber: 3, taskNumber: 2, name: 'AI/ML model development', startMonth: 10, endMonth: 26, deliverables: [{ number: '3.1', month: 18 }] },
      { id: 't3-3', wpNumber: 3, taskNumber: 3, name: 'Frontend & UX development', startMonth: 12, endMonth: 28 },
      { id: 't3-4', wpNumber: 3, taskNumber: 4, name: 'System integration & testing', startMonth: 24, endMonth: 30, deliverables: [{ number: '3.2', month: 30 }] },
    ],
  },
  {
    number: 4,
    title: 'Pilot Implementation & Validation',
    startMonth: 18,
    endMonth: 36,
    tasks: [
      { id: 't4-1', wpNumber: 4, taskNumber: 1, name: 'Pilot site preparation', startMonth: 18, endMonth: 24 },
      { id: 't4-2', wpNumber: 4, taskNumber: 2, name: 'Pilot deployment & operation', startMonth: 24, endMonth: 33, deliverables: [{ number: '4.1', month: 30 }] },
      { id: 't4-3', wpNumber: 4, taskNumber: 3, name: 'Performance evaluation', startMonth: 30, endMonth: 36, deliverables: [{ number: '4.2', month: 36 }] },
    ],
  },
  {
    number: 5,
    title: 'Dissemination & Exploitation',
    startMonth: 1,
    endMonth: 36,
    tasks: [
      { id: 't5-1', wpNumber: 5, taskNumber: 1, name: 'Communication & outreach', startMonth: 1, endMonth: 36 },
      { id: 't5-2', wpNumber: 5, taskNumber: 2, name: 'Scientific dissemination', startMonth: 6, endMonth: 36, deliverables: [{ number: '5.1', month: 6 }] },
      { id: 't5-3', wpNumber: 5, taskNumber: 3, name: 'Exploitation & business dev', startMonth: 12, endMonth: 36, deliverables: [{ number: '5.2', month: 24 }, { number: '5.3', month: 36 }] },
    ],
  },
];

const DEMO_MILESTONES: Milestone[] = [
  { id: 'm1', number: 1, name: 'Requirements baseline approved', month: 6 },
  { id: 'm2', number: 2, name: 'Architecture finalized', month: 12 },
  { id: 'm3', number: 3, name: 'MVP released', month: 18 },
  { id: 'm4', number: 4, name: 'Pilots operational', month: 24 },
  { id: 'm5', number: 5, name: 'System validated', month: 30 },
  { id: 'm6', number: 6, name: 'Project completed', month: 36 },
];

const DEMO_REPORTING_PERIODS = [
  { number: 1, startMonth: 1, endMonth: 18 },
  { number: 2, startMonth: 19, endMonth: 36 },
];

// Colors for each WP - matching template style (lighter shades for cells)
const WP_COLORS = [
  { bg: 'bg-blue-200', border: 'border-blue-400', header: 'bg-blue-100' },
  { bg: 'bg-emerald-200', border: 'border-emerald-400', header: 'bg-emerald-100' },
  { bg: 'bg-amber-200', border: 'border-amber-400', header: 'bg-amber-100' },
  { bg: 'bg-purple-200', border: 'border-purple-400', header: 'bg-purple-100' },
  { bg: 'bg-rose-200', border: 'border-rose-400', header: 'bg-rose-100' },
  { bg: 'bg-cyan-200', border: 'border-cyan-400', header: 'bg-cyan-100' },
  { bg: 'bg-orange-200', border: 'border-orange-400', header: 'bg-orange-100' },
  { bg: 'bg-indigo-200', border: 'border-indigo-400', header: 'bg-indigo-100' },
];

export function GanttChart({
  projectDuration = 36,
  workPackages = DEMO_WORK_PACKAGES,
  milestones = DEMO_MILESTONES,
  reportingPeriods = DEMO_REPORTING_PERIODS,
}: GanttChartProps) {
  const [selectedDuration, setSelectedDuration] = useState(projectDuration);

  const months = Array.from({ length: selectedDuration }, (_, i) => i + 1);
  
  // Group months into years
  const years = useMemo(() => {
    const yrs: { year: number; months: number[] }[] = [];
    for (let i = 0; i < selectedDuration; i += 12) {
      yrs.push({
        year: Math.floor(i / 12) + 1,
        months: months.slice(i, Math.min(i + 12, selectedDuration)),
      });
    }
    return yrs;
  }, [selectedDuration, months]);

  // Get milestones for a specific month
  const getMilestonesForMonth = (month: number) => {
    return milestones.filter(m => m.month === month);
  };

  // Get reporting period for month
  const getReportingPeriod = (month: number) => {
    return reportingPeriods.find(rp => month >= rp.startMonth && month <= rp.endMonth);
  };

  const cellWidth = 14; // Very compact cells to fit on one page
  const labelWidth = 180; // Width for WP/Task labels

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Figure 3.1.b. Gantt Chart
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={String(selectedDuration)} onValueChange={(v) => setSelectedDuration(Number(v))}>
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
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
              <Download className="w-3 h-3" />
              Export
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-2 overflow-x-auto">
        <TooltipProvider>
          <div className="min-w-max text-[9px] font-sans" style={{ fontFamily: 'Times New Roman, serif' }}>
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

            {/* Empty separator row */}
            <div className="flex border-l">
              <div 
                className="shrink-0 border-r border-b"
                style={{ width: labelWidth, height: 4 }}
              />
              <div className="flex">
                {months.map(m => (
                  <div
                    key={m}
                    className="border-r border-b"
                    style={{ width: cellWidth, height: 4 }}
                  />
                ))}
              </div>
            </div>

            {/* Work Packages and Tasks */}
            {workPackages.map((wp, wpIndex) => {
              const colors = WP_COLORS[wpIndex % WP_COLORS.length];
              return (
                <div key={wp.number}>
                  {/* WP Header Row */}
                  <div className="flex border-l">
                    <div 
                      className={`shrink-0 border-r border-b ${colors.header} font-bold truncate flex items-center px-1`}
                      style={{ width: labelWidth, height: 16 }}
                    >
                      WP{wp.number}: {wp.title}
                    </div>
                    <div className="flex">
                      {months.map(m => {
                        const isInWP = m >= wp.startMonth && m <= wp.endMonth;
                        return (
                          <div
                            key={m}
                            className={`border-r border-b ${isInWP ? colors.bg : ''}`}
                            style={{ width: cellWidth, height: 16 }}
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
                        <span className="truncate">{task.name}</span>
                      </div>
                      <div className="flex">
                        {months.map(m => {
                          const isInTask = m >= task.startMonth && m <= task.endMonth;
                          const deliverable = task.deliverables?.find(d => d.month === m);
                          
                          return (
                            <div
                              key={m}
                              className={`border-r border-b flex items-center justify-center ${
                                isInTask ? colors.bg : ''
                              }`}
                              style={{ width: cellWidth, height: 16 }}
                            >
                              {deliverable && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="font-bold text-[7px] text-foreground">
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

                  {/* Empty row between WPs */}
                  <div className="flex border-l">
                    <div 
                      className="shrink-0 border-r border-b"
                      style={{ width: labelWidth, height: 4 }}
                    />
                    <div className="flex">
                      {months.map(m => (
                        <div
                          key={m}
                          className="border-r border-b"
                          style={{ width: cellWidth, height: 4 }}
                        />
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
                <div className="w-3 h-2 bg-blue-200 border border-blue-400" />
                <span>Task duration</span>
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
      </CardContent>
    </Card>
  );
}
