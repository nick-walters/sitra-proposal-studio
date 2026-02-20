import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import {
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  User,
  BarChart3,
} from 'lucide-react';
import { format, isPast, isToday, differenceInDays, addDays, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { cn } from '@/lib/utils';

interface Assignment {
  sectionNumber: string;
  sectionTitle: string;
  assignedTo: string | null;
  assignedToName: string | null;
  assignedToAvatar: string | null;
  dueDate: string | null;
  hasContent: boolean;
  wordCount: number;
}

interface WorkloadDashboardProps {
  assignments: Assignment[];
}

export function WorkloadDashboard({ assignments }: WorkloadDashboardProps) {
  // Group by assignee
  const byAssignee = useMemo(() => {
    const groups: Record<string, {
      name: string;
      avatar: string | null;
      sections: Assignment[];
      overdue: number;
      dueSoon: number;
      completed: number;
      totalEffort: number;
    }> = {};

    assignments.forEach(a => {
      const key = a.assignedTo || 'unassigned';
      if (!groups[key]) {
        groups[key] = {
          name: a.assignedToName || 'Unassigned',
          avatar: a.assignedToAvatar,
          sections: [],
          overdue: 0,
          dueSoon: 0,
          completed: 0,
          totalEffort: 0,
        };
      }
      groups[key].sections.push(a);
      groups[key].totalEffort += a.wordCount;

      if (a.hasContent) {
        groups[key].completed++;
      } else if (a.dueDate) {
        const due = new Date(a.dueDate);
        if (isPast(due) && !isToday(due)) {
          groups[key].overdue++;
        } else if (differenceInDays(due, new Date()) <= 7) {
          groups[key].dueSoon++;
        }
      }
    });

    return Object.entries(groups).sort((a, b) => b[1].overdue - a[1].overdue);
  }, [assignments]);

  // Timeline view data - next 4 weeks
  const timeline = useMemo(() => {
    const today = new Date();
    const weeks: { start: Date; end: Date; items: Assignment[] }[] = [];

    for (let w = 0; w < 4; w++) {
      const weekStart = startOfWeek(addDays(today, w * 7), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(addDays(today, w * 7), { weekStartsOn: 1 });
      const items = assignments.filter(a => {
        if (!a.dueDate) return false;
        const due = new Date(a.dueDate);
        return due >= weekStart && due <= weekEnd;
      });
      weeks.push({ start: weekStart, end: weekEnd, items });
    }

    return weeks;
  }, [assignments]);

  if (assignments.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No assignments with deadlines to display</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Workload by person */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Workload by Team Member
          </CardTitle>
          <CardDescription>
            Section assignments and deadline status per collaborator
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {byAssignee.map(([key, data]) => (
            <div key={key} className="flex items-center gap-3 p-3 border rounded-lg">
              <Avatar className="h-8 w-8">
                <AvatarImage src={data.avatar || undefined} />
                <AvatarFallback className="text-xs">
                  {data.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{data.name}</p>
                <p className="text-xs text-muted-foreground">
                  {data.sections.length} section{data.sections.length !== 1 ? 's' : ''} assigned
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {data.overdue > 0 && (
                  <Badge variant="destructive" className="text-[10px] gap-0.5">
                    <AlertTriangle className="w-3 h-3" /> {data.overdue}
                  </Badge>
                )}
                {data.dueSoon > 0 && (
                  <Badge variant="outline" className="text-[10px] gap-0.5 border-amber-500 text-amber-600">
                    <Clock className="w-3 h-3" /> {data.dueSoon}
                  </Badge>
                )}
                {data.completed > 0 && (
                  <Badge variant="outline" className="text-[10px] gap-0.5 border-green-500 text-green-600">
                    <CheckCircle2 className="w-3 h-3" /> {data.completed}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Upcoming Deadlines
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {timeline.map((week, idx) => (
            <div key={idx}>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                {idx === 0 ? 'This week' : idx === 1 ? 'Next week' : format(week.start, 'MMM d')} – {format(week.end, 'MMM d')}
              </p>
              {week.items.length === 0 ? (
                <p className="text-xs text-muted-foreground/50 pl-2">No deadlines</p>
              ) : (
                <div className="space-y-1">
                  {week.items.map((item, i) => {
                    const isOverdue = item.dueDate && isPast(new Date(item.dueDate)) && !isToday(new Date(item.dueDate));
                    return (
                      <div
                        key={i}
                        className={cn(
                          "flex items-center gap-2 px-2 py-1.5 rounded text-sm",
                          item.hasContent
                            ? "bg-green-50 dark:bg-green-950/20"
                            : isOverdue
                              ? "bg-destructive/10"
                              : "bg-muted/50"
                        )}
                      >
                        <span className="text-xs text-muted-foreground w-12">
                          {item.dueDate ? format(new Date(item.dueDate), 'MMM d') : ''}
                        </span>
                        <span className="font-medium text-xs">{item.sectionNumber}</span>
                        <span className="text-xs truncate flex-1">{item.sectionTitle}</span>
                        {item.assignedToName && (
                          <span className="text-[10px] text-muted-foreground">{item.assignedToName}</span>
                        )}
                        {item.hasContent ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
                        ) : isOverdue ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
