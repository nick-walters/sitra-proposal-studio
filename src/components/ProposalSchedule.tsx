import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Proposal, Participant, ProposalStatus } from '@/types/proposal';
import {
  Send,
  CheckCircle2,
  XCircle,
  Loader2,
  FileCheck,
  Users,
  Euro,
  FileText,
  Clock,
  Trophy,
  ThumbsDown,
  TrendingUp,
} from 'lucide-react';
import { format } from 'date-fns';

interface CheckItem {
  id: string;
  label: string;
  description: string;
  check: () => boolean;
  icon: React.ComponentType<{ className?: string }>;
}

interface CompletionStats {
  partA: number;
  partB: number;
  budget: number;
  ethics: number;
}

interface ProposalScheduleProps {
  proposal: Proposal | null;
  participants: Participant[];
  budgetItems: { amount: number }[];
  onSubmit: () => Promise<void>;
  onUpdateStatus: (status: ProposalStatus) => Promise<void>;
  canEdit: boolean;
  isAdmin: boolean;
  completionStats?: CompletionStats;
  isEditing?: boolean;
  onStatsChange?: (stats: CompletionStats) => void;
}

export function ProposalSchedule({
  proposal,
  participants,
  budgetItems,
  onSubmit,
  onUpdateStatus,
  canEdit,
  isAdmin,
  completionStats = { partA: 0, partB: 0, budget: 0, ethics: 0 },
  isEditing = false,
  onStatsChange,
}: ProposalScheduleProps) {
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<ProposalStatus | ''>('');
  const [editedStats, setEditedStats] = useState(completionStats);

  const totalBudget = budgetItems.reduce((sum, item) => sum + (item.amount || 0), 0);

  // Determine if user can edit this section (admins and owners only)
  const userCanEdit = canEdit && isAdmin;

  // Sync editedStats when completionStats prop changes or when editing stops
  useEffect(() => {
    if (!isEditing) {
      setEditedStats(completionStats);
    }
  }, [completionStats, isEditing]);

  // Notify parent of stats changes when editing
  const handleStatsChange = (newStats: CompletionStats) => {
    setEditedStats(newStats);
    onStatsChange?.(newStats);
  };

  // Get the stats to display (edited when editing, actual otherwise)
  const displayStats = isEditing ? editedStats : completionStats;

  const checks: CheckItem[] = [
    {
      id: 'title',
      label: 'Proposal Title',
      description: 'A title has been provided',
      check: () => !!proposal?.title && proposal.title.length > 0,
      icon: FileText,
    },
    {
      id: 'participants',
      label: 'Participants',
      description: 'At least one participant organisation added',
      check: () => participants.length > 0,
      icon: Users,
    },
    {
      id: 'budget',
      label: 'Budget',
      description: 'Budget items have been added',
      check: () => totalBudget > 0,
      icon: Euro,
    },
    {
      id: 'deadline',
      label: 'Deadline',
      description: 'Submission deadline is set',
      check: () => !!proposal?.deadline,
      icon: Clock,
    },
    {
      id: 'topic',
      label: 'Topic Information',
      description: 'Topic ID has been specified',
      check: () => !!proposal?.topicId && proposal.topicId.length > 0,
      icon: FileCheck,
    },
  ];

  const passedChecks = checks.filter((c) => c.check());
  const progress = (passedChecks.length / checks.length) * 100;

  const handleStatusUpdate = async () => {
    if (!selectedStatus) return;
    setUpdatingStatus(true);
    try {
      await onUpdateStatus(selectedStatus);
      setIsStatusDialogOpen(false);
      setSelectedStatus('');
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Combined: Proposal Completion & Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Proposal schedule
          </CardTitle>
          <CardDescription>Track your progress and readiness for submission</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Section Completion Progress */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground">Section completion</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Part A - Administrative</span>
                  <span className="font-medium">{displayStats.partA}%</span>
                </div>
                {isEditing ? (
                  <Slider
                    value={[editedStats.partA]}
                    onValueChange={(value) => setEditedStats({ ...editedStats, partA: value[0] })}
                    max={100}
                    step={5}
                    className="h-2"
                  />
                ) : (
                  <Progress value={displayStats.partA} className="h-2" />
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Part B - Technical</span>
                  <span className="font-medium">{displayStats.partB}%</span>
                </div>
                {isEditing ? (
                  <Slider
                    value={[editedStats.partB]}
                    onValueChange={(value) => setEditedStats({ ...editedStats, partB: value[0] })}
                    max={100}
                    step={5}
                    className="h-2"
                  />
                ) : (
                  <Progress value={displayStats.partB} className="h-2" />
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Budget</span>
                  <span className="font-medium">{displayStats.budget}%</span>
                </div>
                {isEditing ? (
                  <Slider
                    value={[editedStats.budget]}
                    onValueChange={(value) => setEditedStats({ ...editedStats, budget: value[0] })}
                    max={100}
                    step={5}
                    className="h-2"
                  />
                ) : (
                  <Progress value={displayStats.budget} className="h-2" />
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Ethics self-assessment</span>
                  <span className="font-medium">{displayStats.ethics}%</span>
                </div>
                {isEditing ? (
                  <Slider
                    value={[editedStats.ethics]}
                    onValueChange={(value) => setEditedStats({ ...editedStats, ethics: value[0] })}
                    max={100}
                    step={5}
                    className="h-2"
                  />
                ) : (
                  <Progress value={displayStats.ethics} className="h-2" />
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Checklist Items */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-muted-foreground">Submission checklist</h4>
              <span className="text-sm text-muted-foreground">
                {passedChecks.length}/{checks.length} complete
              </span>
            </div>
            <Progress value={progress} className="h-2" />
            <div className="space-y-3">
              {checks.map((check) => {
                const passed = check.check();
                const Icon = check.icon;
                return (
                  <div
                    key={check.id}
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        passed ? 'bg-green-500/10' : 'bg-muted'
                      }`}
                    >
                      {passed ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : (
                        <Icon className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className={`font-medium ${passed ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {check.label}
                      </p>
                      <p className="text-sm text-muted-foreground">{check.description}</p>
                    </div>
                    {passed ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-muted-foreground/50" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Admin Status Controls */}
          {userCanEdit && proposal?.status !== 'draft' && (
            <>
              <Separator />
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsStatusDialogOpen(true)}
                  className="gap-2"
                >
                  Update Status
                </Button>
                {proposal?.status === 'submitted' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onUpdateStatus('draft')}
                    className="gap-2"
                  >
                    Revert to Draft
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Status Update Dialog (Admin Only) */}
      <Dialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Proposal Status</DialogTitle>
            <DialogDescription>
              Change the status of this proposal. This affects editing permissions.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Select value={selectedStatus} onValueChange={(v) => setSelectedStatus(v as ProposalStatus)}>
              <SelectTrigger>
                <SelectValue placeholder="Select new status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Draft (Editable)
                  </div>
                </SelectItem>
                <SelectItem value="submitted">
                  <div className="flex items-center gap-2">
                    <Send className="w-4 h-4" />
                    Submitted
                  </div>
                </SelectItem>
                <SelectItem value="funded">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4" />
                    Funded
                  </div>
                </SelectItem>
                <SelectItem value="not_funded">
                  <div className="flex items-center gap-2">
                    <ThumbsDown className="w-4 h-4" />
                    Not Funded
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsStatusDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleStatusUpdate}
              disabled={updatingStatus || !selectedStatus}
              className="gap-2"
            >
              {updatingStatus && <Loader2 className="w-4 h-4 animate-spin" />}
              Update Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
