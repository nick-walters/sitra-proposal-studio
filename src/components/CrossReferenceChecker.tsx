import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Link2, 
  FileText, 
  Target, 
  Milestone, 
  ListChecks,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CrossReferenceCheckerProps {
  proposalId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface Issue {
  id: string;
  type: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  detail?: string;
}

export function CrossReferenceChecker({ proposalId, isOpen, onClose }: CrossReferenceCheckerProps) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const runCheck = async () => {
    setLoading(true);
    setIssues([]);
    const found: Issue[] = [];

    try {
      // 1. Check deliverables have valid WP and task references
      const { data: deliverables } = await supabase
        .from('b31_deliverables')
        .select('number, name, wp_number, task_id, lead_participant_id')
        .eq('proposal_id', proposalId);

      const { data: wpDrafts } = await supabase
        .from('wp_drafts')
        .select('id, number, short_name, title')
        .eq('proposal_id', proposalId);

      const { data: tasks } = await supabase
        .from('wp_draft_tasks')
        .select('id, number, title, wp_draft_id')
        .in('wp_draft_id', (wpDrafts || []).map(w => w.id));

      const { data: milestones } = await supabase
        .from('b31_milestones')
        .select('number, name, due_month, task_id, wps')
        .eq('proposal_id', proposalId);

      const { data: participants } = await supabase
        .from('participants')
        .select('id, organisation_short_name, participant_number')
        .eq('proposal_id', proposalId);

      const { data: risks } = await supabase
        .from('b31_risks')
        .select('number, description, wps')
        .eq('proposal_id', proposalId);

      const wpNumbers = new Set((wpDrafts || []).map(w => w.number));
      const taskIds = new Set((tasks || []).map(t => t.id));
      const participantIds = new Set((participants || []).map(p => p.id));

      // Check deliverables
      (deliverables || []).forEach(d => {
        if (d.wp_number && !wpNumbers.has(d.wp_number)) {
          found.push({
            id: `del-wp-${d.number}`,
            type: 'error',
            category: 'Deliverables',
            message: `D${d.number} "${d.name}" references non-existent WP${d.wp_number}`,
          });
        }
        if (d.task_id && !taskIds.has(d.task_id)) {
          found.push({
            id: `del-task-${d.number}`,
            type: 'error',
            category: 'Deliverables',
            message: `D${d.number} "${d.name}" references a deleted task`,
          });
        }
        if (d.lead_participant_id && !participantIds.has(d.lead_participant_id)) {
          found.push({
            id: `del-part-${d.number}`,
            type: 'error',
            category: 'Deliverables',
            message: `D${d.number} "${d.name}" has a lead participant that no longer exists`,
          });
        }
        if (!d.name || d.name.trim() === '') {
          found.push({
            id: `del-empty-${d.number}`,
            type: 'warning',
            category: 'Deliverables',
            message: `D${d.number} has no title`,
          });
        }
      });

      // Check milestones
      (milestones || []).forEach(m => {
        if (m.task_id && !taskIds.has(m.task_id)) {
          found.push({
            id: `ms-task-${m.number}`,
            type: 'error',
            category: 'Milestones',
            message: `MS${m.number} "${m.name}" references a deleted task`,
          });
        }
        if (!m.due_month) {
          found.push({
            id: `ms-due-${m.number}`,
            type: 'warning',
            category: 'Milestones',
            message: `MS${m.number} "${m.name}" has no due month`,
          });
        }
        if (!m.name || m.name.trim() === '') {
          found.push({
            id: `ms-empty-${m.number}`,
            type: 'warning',
            category: 'Milestones',
            message: `MS${m.number} has no title`,
          });
        }
      });

      // Check WPs without tasks or effort
      const { data: effortData } = await supabase
        .from('member_wp_allocations')
        .select('work_package_id, person_months')
        .in('work_package_id', (wpDrafts || []).map(w => w.id));

      const wpTaskMap = new Map<string, number>();
      (tasks || []).forEach(t => {
        wpTaskMap.set(t.wp_draft_id, (wpTaskMap.get(t.wp_draft_id) || 0) + 1);
      });

      const wpEffortMap = new Map<string, number>();
      (effortData || []).forEach(e => {
        wpEffortMap.set(e.work_package_id, (wpEffortMap.get(e.work_package_id) || 0) + e.person_months);
      });

      (wpDrafts || []).forEach(wp => {
        const taskCount = wpTaskMap.get(wp.id) || 0;
        const effort = wpEffortMap.get(wp.id) || 0;
        if (taskCount === 0) {
          found.push({
            id: `wp-notask-${wp.number}`,
            type: 'warning',
            category: 'Work Packages',
            message: `WP${wp.number} "${wp.short_name || wp.title || ''}" has no tasks defined`,
          });
        }
        if (effort === 0) {
          found.push({
            id: `wp-noeffort-${wp.number}`,
            type: 'warning',
            category: 'Work Packages',
            message: `WP${wp.number} "${wp.short_name || wp.title || ''}" has no effort allocated`,
          });
        }
        if (!wp.title || wp.title.trim() === '') {
          found.push({
            id: `wp-notitle-${wp.number}`,
            type: 'warning',
            category: 'Work Packages',
            message: `WP${wp.number} has no title`,
          });
        }
      });

      // Check risks reference valid WPs
      (risks || []).forEach(r => {
        if (r.wps) {
          const refWps = r.wps.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
          refWps.forEach(wpNum => {
            if (!wpNumbers.has(wpNum)) {
              found.push({
                id: `risk-wp-${r.number}-${wpNum}`,
                type: 'error',
                category: 'Risks',
                message: `Risk ${r.number} references non-existent WP${wpNum}`,
              });
            }
          });
        }
      });

      // Check orphaned deliverables (no WP assigned)
      (deliverables || []).forEach(d => {
        if (!d.wp_number) {
          found.push({
            id: `del-orphan-${d.number}`,
            type: 'warning',
            category: 'Deliverables',
            message: `D${d.number} "${d.name}" is not assigned to any work package`,
          });
        }
      });

    } catch (error) {
      console.error('Cross-reference check error:', error);
      toast.error('Failed to run cross-reference check');
    }

    setIssues(found);
    setLoading(false);
    setHasRun(true);

    if (found.length === 0) {
      toast.success('All cross-references are valid!');
    } else {
      const errors = found.filter(i => i.type === 'error').length;
      const warnings = found.filter(i => i.type === 'warning').length;
      toast.info(`Found ${errors} error(s) and ${warnings} warning(s)`);
    }
  };

  const errorCount = issues.filter(i => i.type === 'error').length;
  const warningCount = issues.filter(i => i.type === 'warning').length;

  const groupedIssues = useMemo(() => {
    const groups: Record<string, Issue[]> = {};
    issues.forEach(issue => {
      if (!groups[issue.category]) groups[issue.category] = [];
      groups[issue.category].push(issue);
    });
    return groups;
  }, [issues]);

  const categoryIcons: Record<string, React.ReactNode> = {
    'Deliverables': <Target className="w-4 h-4" />,
    'Milestones': <Milestone className="w-4 h-4" />,
    'Work Packages': <ListChecks className="w-4 h-4" />,
    'Risks': <AlertTriangle className="w-4 h-4" />,
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-primary" />
            Cross-Reference Integrity Check
          </DialogTitle>
          <DialogDescription>
            Validates WP references, deliverable-task mappings, milestone links, and risk references
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 min-h-0 flex flex-col">
          <Button onClick={runCheck} disabled={loading} className="w-full gap-2">
            {loading ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Checking...</>
            ) : (
              <><RefreshCw className="w-4 h-4" /> Run Integrity Check</>
            )}
          </Button>

          {hasRun && issues.length === 0 && (
            <Card className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800">
              <CardContent className="pt-6 flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
                <div>
                  <p className="font-medium text-green-700 dark:text-green-400">All references valid</p>
                  <p className="text-sm text-green-600 dark:text-green-500">No broken references or orphaned items found.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {hasRun && issues.length > 0 && (
            <>
              <div className="flex items-center gap-3">
                {errorCount > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <XCircle className="w-3 h-3" /> {errorCount} error{errorCount !== 1 ? 's' : ''}
                  </Badge>
                )}
                {warningCount > 0 && (
                  <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600">
                    <AlertTriangle className="w-3 h-3" /> {warningCount} warning{warningCount !== 1 ? 's' : ''}
                  </Badge>
                )}
              </div>

              <ScrollArea className="flex-1 max-h-[400px]">
                <div className="space-y-4 pr-4">
                  {Object.entries(groupedIssues).map(([category, categoryIssues]) => (
                    <div key={category}>
                      <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                        {categoryIcons[category] || <FileText className="w-4 h-4" />}
                        {category} ({categoryIssues.length})
                      </h4>
                      <div className="space-y-1.5">
                        {categoryIssues.map(issue => (
                          <div
                            key={issue.id}
                            className={`flex items-start gap-2 p-2 rounded-md text-sm ${
                              issue.type === 'error'
                                ? 'bg-destructive/10 text-destructive'
                                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400'
                            }`}
                          >
                            {issue.type === 'error' ? (
                              <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                            )}
                            <span>{issue.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
