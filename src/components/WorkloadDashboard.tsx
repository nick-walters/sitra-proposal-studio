import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { format, isPast, isToday, differenceInDays, addDays, startOfWeek, endOfWeek } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface WorkloadDashboardProps {
  proposalId: string;
}

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

export function WorkloadDashboard({ proposalId }: WorkloadDashboardProps) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      // Get proposal template
      const { data: templateData } = await supabase
        .from('proposal_templates')
        .select('id')
        .eq('proposal_id', proposalId)
        .maybeSingle();

      if (!templateData) {
        setAssignments([]);
        setHasRun(true);
        setLoading(false);
        return;
      }

      const { data: sectionsData } = await supabase
        .from('proposal_template_sections')
        .select('section_number, assigned_to, due_date')
        .eq('proposal_template_id', templateData.id) as any;

      const { data: sectionContent } = await supabase
        .from('section_content')
        .select('section_id, content')
        .eq('proposal_id', proposalId);

      const assignedSections: any[] = (sectionsData || []).filter((s: any) => s.assigned_to);
      const userIds: string[] = [...new Set(assignedSections.map((a: any) => a.assigned_to as string).filter(Boolean))];
      let profileMap: Record<string, { full_name: string; avatar_url: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', userIds);
        (profiles || []).forEach(p => { profileMap[p.id] = { full_name: p.full_name || '', avatar_url: p.avatar_url }; });
      }

      const contentMap: Record<string, string> = {};
      (sectionContent || []).forEach((c: any) => { contentMap[c.section_id] = c.content || ''; });

      const results: Assignment[] = assignedSections.map((sa: any) => {
        const sectionId = sa.section_number?.toLowerCase().replace(/\./g, '-') || '';
        const content = contentMap[sectionId] || '';
        const wordCount = content.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
        const profile = sa.assigned_to ? profileMap[sa.assigned_to] : null;
        return {
          sectionNumber: sa.section_number || '',
          sectionTitle: sa.section_number || '',
          assignedTo: sa.assigned_to,
          assignedToName: profile?.full_name || null,
          assignedToAvatar: profile?.avatar_url || null,
          dueDate: sa.due_date,
          hasContent: wordCount > 50,
          wordCount,
        };
      });

      setAssignments(results);
      setHasRun(true);
    } catch (error) {
      console.error('Workload dashboard error:', error);
      toast.error('Failed to load workload data');
    } finally {
      setLoading(false);
    }
  };

  // Group by assignee
  const byAssignee = useMemo(() => {
    const groups: Record<string, {
      name: string;
      avatar: string | null;
      sections: Assignment[];
      overdue: number;
      dueSoon: number;
      completed: number;
    }> = {};

    assignments.forEach(a => {
      const key = a.assignedTo || 'unassigned';
      if (!groups[key]) {
        groups[key] = { name: a.assignedToName || 'Unassigned', avatar: a.assignedToAvatar, sections: [], overdue: 0, dueSoon: 0, completed: 0 };
      }
      groups[key].sections.push(a);
      if (a.hasContent) {
        groups[key].completed++;
      } else if (a.dueDate) {
        const due = new Date(a.dueDate);
        if (isPast(due) && !isToday(due)) groups[key].overdue++;
        else if (differenceInDays(due, new Date()) <= 7) groups[key].dueSoon++;
      }
    });

    return Object.entries(groups).sort((a, b) => b[1].overdue - a[1].overdue);
  }, [assignments]);

  // Timeline - next 4 weeks
  const timeline = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 4 }, (_, w) => {
      const weekStart = startOfWeek(addDays(today, w * 7), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(addDays(today, w * 7), { weekStartsOn: 1 });
      const items = assignments.filter(a => {
        if (!a.dueDate) return false;
        const due = new Date(a.dueDate);
        return due >= weekStart && due <= weekEnd;
      });
      return { start: weekStart, end: weekEnd, items };
    });
  }, [assignments]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button onClick={loadData} disabled={loading} variant="outline" size="sm" className="gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {hasRun ? 'Refresh' : 'Load data'}
        </Button>
      </div>

      {!hasRun && !loading && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Click "Load data" to view workload assignments</p>
          </CardContent>
        </Card>
      )}

      {hasRun && assignments.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No section assignments found. Assign sections to team members first.</p>
          </CardContent>
        </Card>
      )}

      {hasRun && assignments.length > 0 && (
        <>
          {/* Workload by person */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Workload by Team Member</CardTitle>
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
                    <p className="text-xs text-muted-foreground">{data.sections.length} section{data.sections.length !== 1 ? 's' : ''}</p>
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
                              item.hasContent ? "bg-green-50 dark:bg-green-950/20" : isOverdue ? "bg-destructive/10" : "bg-muted/50"
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
        </>
      )}
    </div>
  );
}
