import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  AlertTriangle,
  Loader2,
  FileCheck,
  Users,
  Euro,
  FileText,
  Clock,
  Trophy,
  ThumbsDown,
  Undo,
} from 'lucide-react';
import { format } from 'date-fns';

interface CheckItem {
  id: string;
  label: string;
  description: string;
  check: () => boolean;
  icon: React.ComponentType<{ className?: string }>;
}

interface SubmissionWorkflowProps {
  proposal: Proposal | null;
  participants: Participant[];
  budgetItems: { amount: number }[];
  onSubmit: () => Promise<void>;
  onUpdateStatus: (status: ProposalStatus) => Promise<void>;
  canEdit: boolean;
  isAdmin: boolean;
}

export function SubmissionWorkflow({
  proposal,
  participants,
  budgetItems,
  onSubmit,
  onUpdateStatus,
  canEdit,
  isAdmin,
}: SubmissionWorkflowProps) {
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<ProposalStatus | ''>('');

  const totalBudget = budgetItems.reduce((sum, item) => sum + (item.amount || 0), 0);

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
  const allChecksPassed = passedChecks.length === checks.length;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit();
      setIsSubmitDialogOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

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

  const getStatusBadge = (status: ProposalStatus) => {
    switch (status) {
      case 'draft':
        return <Badge variant="secondary">Draft</Badge>;
      case 'submitted':
        return <Badge className="bg-blue-500">Submitted</Badge>;
      case 'funded':
        return <Badge className="bg-green-500">Funded</Badge>;
      case 'not_funded':
        return <Badge variant="destructive">Not Funded</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Current Status */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Proposal Status</CardTitle>
            {proposal?.status && getStatusBadge(proposal.status)}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {proposal?.status === 'submitted' && proposal.submittedAt && (
            <p className="text-sm text-muted-foreground">
              Submitted on {format(new Date(proposal.submittedAt), 'dd MMM yyyy, HH:mm')}
            </p>
          )}

          {/* Admin Status Controls */}
          {isAdmin && proposal?.status !== 'draft' && (
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
                  <Undo className="w-4 h-4" />
                  Revert to Draft
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submission Checklist - Only show for drafts */}
      {proposal?.status === 'draft' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Submission Checklist</CardTitle>
            <CardDescription>
              Complete these items before submitting your proposal
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Progress */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Completion</span>
                <span className="font-medium">
                  {passedChecks.length}/{checks.length} items
                </span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            <Separator />

            {/* Checklist Items */}
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

            <Separator />

            {/* Submit Button */}
            {canEdit && (
              <div className="space-y-3">
                {!allChecksPassed && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Complete all checklist items before submitting.
                    </AlertDescription>
                  </Alert>
                )}
                <Button
                  onClick={() => setIsSubmitDialogOpen(true)}
                  disabled={!allChecksPassed}
                  className="w-full gap-2"
                  size="lg"
                >
                  <Send className="w-4 h-4" />
                  Submit Proposal
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Submit Confirmation Dialog */}
      <Dialog open={isSubmitDialogOpen} onOpenChange={setIsSubmitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Proposal</DialogTitle>
            <DialogDescription>
              Are you sure you want to submit this proposal? Once submitted, editing will be disabled.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Title</span>
                <span className="font-medium">{proposal?.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Acronym</span>
                <span className="font-medium">{proposal?.acronym}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Participants</span>
                <span className="font-medium">{participants.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Budget</span>
                <span className="font-medium">€{totalBudget.toLocaleString()}</span>
              </div>
            </div>

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This action cannot be undone by editors. Only administrators can revert a submitted proposal to draft.
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSubmitDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Confirm Submission
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
