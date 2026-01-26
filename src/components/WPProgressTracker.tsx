import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Check, Circle, BarChart3, Users, Package, AlertTriangle, Clock } from 'lucide-react';
import { WPColorSwatch } from '@/components/WPColorPicker';
import { useWPDrafts } from '@/hooks/useWPDrafts';
import { useWPProgress } from '@/hooks/useWPProgress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

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
      <Check className="h-4 w-4 text-green-600" />
    ) : (
      <Circle className="h-4 w-4 text-muted-foreground/40" />
    )
  );

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
                {totals.completedWPs} of {totals.totalWPs} WPs complete
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
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Work Package</TableHead>
                  <TableHead className="w-[60px] text-center">Method</TableHead>
                  <TableHead className="w-[60px] text-center">Obj</TableHead>
                  <TableHead className="w-[60px] text-center">Tasks</TableHead>
                  <TableHead className="w-[60px] text-center">Deliv</TableHead>
                  <TableHead className="w-[60px] text-center">Risks</TableHead>
                  <TableHead className="w-[80px] text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {progressData.map((wp) => (
                  <TableRow 
                    key={wp.wpId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => onNavigateToWP?.(wp.wpId)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <WPColorSwatch color={wp.color} size="sm" />
                        <span className="font-medium">WP{wp.wpNumber}</span>
                        {wp.shortName && (
                          <span className="text-muted-foreground">: {wp.shortName}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <CompletionIcon complete={wp.completion.methodology} />
                    </TableCell>
                    <TableCell className="text-center">
                      <CompletionIcon complete={wp.completion.objectives} />
                    </TableCell>
                    <TableCell className="text-center">
                      <CompletionIcon complete={wp.completion.tasks} />
                    </TableCell>
                    <TableCell className="text-center">
                      <CompletionIcon complete={wp.completion.deliverables} />
                    </TableCell>
                    <TableCell className="text-center">
                      <CompletionIcon complete={wp.completion.risks} />
                    </TableCell>
                    <TableCell className="text-center">
                      {wp.completion.overall ? (
                        <Badge variant="default" className="bg-green-600">Complete</Badge>
                      ) : (
                        <Badge variant="secondary">In Progress</Badge>
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
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard
              icon={<Clock className="h-4 w-4" />}
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
            <StatCard
              icon={<Users className="h-4 w-4" />}
              label="WPs with Lead"
              value={`${totals.wpsWithLead}/${totals.totalWPs}`}
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
