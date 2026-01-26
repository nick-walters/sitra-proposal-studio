import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Check, Circle, BarChart3, Users, Package, AlertTriangle, ListChecks } from 'lucide-react';
import { WPColorSwatch } from '@/components/WPColorPicker';
import { useWPDrafts } from '@/hooks/useWPDrafts';
import { useWPProgress } from '@/hooks/useWPProgress';
import { Skeleton } from '@/components/ui/skeleton';

interface WPProgressTrackerProps {
  proposalId: string;
  onNavigateToWP?: (wpId: string) => void;
}

export function WPProgressTracker({ proposalId, onNavigateToWP }: WPProgressTrackerProps) {
  const { wpDrafts, loading } = useWPDrafts(proposalId);
  const { progressData, totals } = useWPProgress(wpDrafts);

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const CompletionIcon = ({ complete }: { complete: boolean }) => (
    complete ? (
      <Check className="h-4 w-4 text-green-600 mx-auto" />
    ) : (
      <Circle className="h-4 w-4 text-muted-foreground/40 mx-auto" />
    )
  );

  // Empty state when no WP drafts exist
  if (wpDrafts.length === 0) {
    return (
      <div className="space-y-6 p-6">
        <div>
          <h2 className="text-2xl font-bold">WP Progress Tracker</h2>
          <p className="text-muted-foreground">Track completion status of work package drafts</p>
        </div>

        <Card className="border-dashed">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Package className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">No Work Packages Yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-4">
                Create work packages in the "Proposal overview" page to start tracking progress. 
                Each WP tracks methodology, objectives, tasks, deliverables, risks, and interactions.
              </p>
              <div className="flex flex-col gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Check className="h-3 w-3 text-green-600" />
                  <span>Methodology (50+ words)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-3 w-3 text-green-600" />
                  <span>Objectives (30+ words)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-3 w-3 text-green-600" />
                  <span>At least one task, deliverable, risk, and interaction</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-2xl font-bold">WP Progress Tracker</h2>
        <p className="text-muted-foreground">Track completion status of work package drafts</p>
      </div>

      {/* Overall Progress */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Overall Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Progress value={totals.overallProgress} className="h-3" />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {totals.completedWPs} of {totals.totalWPs} WPs on track
              </span>
              <span className="font-medium">{totals.overallProgress}%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-WP Completion Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Per-WP Completion</CardTitle>
          <CardDescription>Click any WP to navigate directly to its editor</CardDescription>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-bold">Work Package</TableHead>
                  <TableHead className="text-center font-bold">Methodology</TableHead>
                  <TableHead className="text-center font-bold">Objectives</TableHead>
                  <TableHead className="text-center font-bold">Tasks</TableHead>
                  <TableHead className="text-center font-bold">Deliverables</TableHead>
                  <TableHead className="text-center font-bold">Risks</TableHead>
                  <TableHead className="text-center font-bold">Interactions</TableHead>
                  <TableHead className="text-center font-bold">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {progressData.map((wp) => (
                  <TableRow 
                    key={wp.wpId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => onNavigateToWP?.(wp.wpId)}
                  >
                    <TableCell className="py-1.5">
                      <div className="flex items-center gap-2">
                        <WPColorSwatch color={wp.color} size="sm" />
                        <span className="font-medium">WP{wp.wpNumber}:</span>
                        {wp.shortName && (
                          <span className="text-muted-foreground">{wp.shortName}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center py-1.5">
                      <CompletionIcon complete={wp.completion.methodology} />
                    </TableCell>
                    <TableCell className="text-center py-1.5">
                      <CompletionIcon complete={wp.completion.objectives} />
                    </TableCell>
                    <TableCell className="text-center py-1.5">
                      <CompletionIcon complete={wp.completion.tasks} />
                    </TableCell>
                    <TableCell className="text-center py-1.5">
                      <CompletionIcon complete={wp.completion.deliverables} />
                    </TableCell>
                    <TableCell className="text-center py-1.5">
                      <CompletionIcon complete={wp.completion.risks} />
                    </TableCell>
                    <TableCell className="text-center py-1.5">
                      <CompletionIcon complete={wp.completion.interactions} />
                    </TableCell>
                    <TableCell className="text-center py-1.5">
                      {wp.completion.overall ? (
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-green-200">On Track</Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200">In Progress</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Check className="h-3 w-3 text-green-600" />
              <span>Has content</span>
            </div>
            <div className="flex items-center gap-1">
              <Circle className="h-3 w-3 text-muted-foreground/40" />
              <span>Empty/incomplete</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Proposal Totals */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Proposal Totals</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={<ListChecks className="h-4 w-4" />}
              label="Total Tasks"
              value={totals.totalTasks}
              subValue={`${totals.tasksWithTiming} with timing`}
            />
            <StatCard
              icon={<Package className="h-4 w-4" />}
              label="Total Deliverables"
              value={totals.totalDeliverables}
            />
            <StatCard
              icon={<AlertTriangle className="h-4 w-4" />}
              label="Total Risks"
              value={totals.totalRisks}
            />
            <StatCard
              icon={<Users className="h-4 w-4" />}
              label="Total Person-Months"
              value={totals.totalPersonMonths.toFixed(1)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subValue?: string;
}

function StatCard({ icon, label, value, subValue }: StatCardProps) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {subValue && (
        <div className="text-xs text-muted-foreground">{subValue}</div>
      )}
    </div>
  );
}
