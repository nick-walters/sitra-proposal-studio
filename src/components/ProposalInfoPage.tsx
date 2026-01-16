import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Proposal, Participant, ParticipantMember, PARTICIPANT_TYPE_LABELS } from '@/types/proposal';
import {
  ExternalLink,
  Calendar,
  Euro,
  Users,
  Building2,
  MapPin,
  Mail,
  Clock,
  FileText,
} from 'lucide-react';
import { format } from 'date-fns';

interface ProposalInfoPageProps {
  proposal: Proposal;
  participants: Participant[];
  participantMembers: ParticipantMember[];
  onUpdateProposal: (updates: Partial<Proposal>) => void;
  canEdit: boolean;
}

export function ProposalInfoPage({
  proposal,
  participants,
  participantMembers,
  onUpdateProposal,
  canEdit,
}: ProposalInfoPageProps) {
  return (
    <div className="flex-1 overflow-auto p-6 bg-muted/30">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Proposal Information</h1>
            <p className="text-muted-foreground">Overview and consortium summary</p>
          </div>
          <Badge variant="outline" className="text-lg px-4 py-2">
            {proposal.acronym}
          </Badge>
        </div>

        {/* Topic Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Topic Information
            </CardTitle>
            <CardDescription>
              Link to the Funding & Tenders Portal topic page
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="topicId">Topic ID</Label>
                <Input
                  id="topicId"
                  placeholder="e.g., HORIZON-CL5-2024-D1-01"
                  value={proposal.topicId || ''}
                  onChange={(e) => onUpdateProposal({ topicId: e.target.value })}
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="topicUrl">Topic URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="topicUrl"
                    placeholder="https://ec.europa.eu/..."
                    value={proposal.topicUrl || ''}
                    onChange={(e) => onUpdateProposal({ topicUrl: e.target.value })}
                    disabled={!canEdit}
                  />
                  {proposal.topicUrl && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => window.open(proposal.topicUrl, '_blank')}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Brief description of the proposal..."
                value={proposal.description || ''}
                onChange={(e) => onUpdateProposal({ description: e.target.value })}
                disabled={!canEdit}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Key Details */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Euro className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Budget</p>
                  <p className="text-lg font-semibold">
                    {proposal.totalBudget
                      ? `€${proposal.totalBudget.toLocaleString()}`
                      : 'Not set'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Deadline</p>
                  <p className="text-lg font-semibold">
                    {proposal.deadline
                      ? format(proposal.deadline, 'dd MMM yyyy')
                      : 'Not set'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-success" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Participants</p>
                  <p className="text-lg font-semibold">{participants.length} organisations</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Budget Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Budget Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="totalBudget">Total Budget (€)</Label>
                <Input
                  id="totalBudget"
                  type="number"
                  placeholder="e.g., 5000000"
                  value={proposal.totalBudget || ''}
                  onChange={(e) => onUpdateProposal({ totalBudget: parseFloat(e.target.value) || undefined })}
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deadline">Submission Deadline</Label>
                <Input
                  id="deadline"
                  type="date"
                  value={proposal.deadline ? format(proposal.deadline, 'yyyy-MM-dd') : ''}
                  onChange={(e) => onUpdateProposal({ deadline: e.target.value ? new Date(e.target.value) : undefined })}
                  disabled={!canEdit}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Consortium Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Consortium Summary
            </CardTitle>
            <CardDescription>
              Participating organisations and their roles
            </CardDescription>
          </CardHeader>
          <CardContent>
            {participants.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Building2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No participants added yet.</p>
                <p className="text-sm">Add participants in Part A - Participant Information.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {participants.map((participant, index) => {
                  const members = participantMembers.filter(
                    (m) => m.participantId === participant.id
                  );

                  return (
                    <div
                      key={participant.id}
                      className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                          {participant.logoUrl ? (
                            <img
                              src={participant.logoUrl}
                              alt={participant.organisationName}
                              className="w-10 h-10 object-contain"
                            />
                          ) : (
                            <span className="text-lg font-bold text-muted-foreground">
                              {index + 1}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold">
                              {participant.organisationName}
                            </h4>
                            {participant.organisationShortName && (
                              <span className="text-muted-foreground">
                                ({participant.organisationShortName})
                              </span>
                            )}
                            <Badge variant="secondary">
                              {PARTICIPANT_TYPE_LABELS[participant.organisationType]}
                            </Badge>
                            {participant.isSme && (
                              <Badge variant="outline" className="text-primary border-primary">
                                SME
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                            {participant.country && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5" />
                                {participant.country}
                              </span>
                            )}
                            {participant.contactEmail && (
                              <span className="flex items-center gap-1">
                                <Mail className="w-3.5 h-3.5" />
                                {participant.contactEmail}
                              </span>
                            )}
                          </div>
                          {members.length > 0 && (
                            <div className="mt-3">
                              <p className="text-xs font-medium text-muted-foreground mb-2">
                                Team Members ({members.length})
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {members.map((member) => (
                                  <div
                                    key={member.id}
                                    className="flex items-center gap-1.5 text-sm bg-muted px-2 py-1 rounded"
                                  >
                                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                                      <span className="text-xs font-medium text-primary">
                                        {member.fullName.split(' ').map((n) => n[0]).join('')}
                                      </span>
                                    </div>
                                    <span>{member.fullName}</span>
                                    {member.roleInProject && (
                                      <span className="text-muted-foreground">
                                        - {member.roleInProject}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Created:</span>
                <span>{format(proposal.createdAt, 'dd MMM yyyy')}</span>
              </div>
              <Separator orientation="vertical" className="h-4" />
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Last updated:</span>
                <span>{format(proposal.updatedAt, 'dd MMM yyyy, HH:mm')}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
