import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Calendar } from '@/components/ui/calendar';
import { LogoUpload } from '@/components/LogoUpload';
import { SubmissionWorkflow } from '@/components/SubmissionWorkflow';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Proposal, Participant, ParticipantMember, PARTICIPANT_TYPE_LABELS, WORK_PROGRAMMES, DESTINATIONS, PROPOSAL_STATUS_LABELS, PROPOSAL_TYPE_LABELS, ProposalType, ProposalStatus, getDestinationsForWorkProgramme } from '@/types/proposal';
import { supabase } from '@/integrations/supabase/client';
import {
  ExternalLink,
  Calendar as CalendarIcon,
  Euro,
  Users,
  Building2,
  MapPin,
  Clock,
  FileText,
  Target,
  TrendingUp,
  Pencil,
  Check,
  X,
  Mail,
  Hash,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface ProposalSummaryPageProps {
  proposal: Proposal;
  participants: Participant[];
  participantMembers: ParticipantMember[];
  budgetItems: { amount: number; participantId: string }[];
  onUpdateProposal?: (updates: Partial<Proposal>) => Promise<void>;
  onSubmit?: () => Promise<void>;
  onUpdateStatus?: (status: ProposalStatus) => Promise<void>;
  canEdit?: boolean;
  isAdmin?: boolean;
}

interface TeamMember {
  id: string;
  fullName: string;
  email?: string;
  roleInProject?: string;
  personMonths?: number;
  participantId: string;
  organisation: string;
  organisationShortName?: string;
  organisationLogo?: string;
  // Additional collaborator fields
  isCollaborator?: boolean;
  collaboratorRole?: string;
}

export function ProposalSummaryPage({
  proposal,
  participants: realParticipants,
  participantMembers: realMembers,
  budgetItems,
  onUpdateProposal,
  onSubmit,
  onUpdateStatus,
  canEdit = true,
  isAdmin = false,
}: ProposalSummaryPageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedProposal, setEditedProposal] = useState(proposal);
  const [availableDestinations, setAvailableDestinations] = useState(
    proposal.workProgramme ? getDestinationsForWorkProgramme(proposal.workProgramme) : []
  );
  const [collaborators, setCollaborators] = useState<Array<{
    id: string;
    userId: string;
    role: string;
    email?: string;
    fullName?: string;
  }>>([]);

  // Fetch collaborators (users with roles on this proposal)
  useEffect(() => {
    async function fetchCollaborators() {
      const { data: roles, error } = await supabase
        .from('user_roles')
        .select('id, user_id, role')
        .eq('proposal_id', proposal.id);

      if (error) {
        console.error('Error fetching collaborators:', error);
        return;
      }

      if (roles && roles.length > 0) {
        const userIds = roles.map(r => r.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds);

        const collaboratorList = roles.map(role => {
          const profile = profiles?.find(p => p.id === role.user_id);
          return {
            id: role.id,
            userId: role.user_id,
            role: role.role,
            email: profile?.email,
            fullName: profile?.full_name,
          };
        });
        setCollaborators(collaboratorList);
      }
    }

    fetchCollaborators();
  }, [proposal.id]);

  useEffect(() => {
    if (editedProposal.workProgramme) {
      setAvailableDestinations(getDestinationsForWorkProgramme(editedProposal.workProgramme));
    }
  }, [editedProposal.workProgramme]);

  const workProgramme = WORK_PROGRAMMES.find(wp => wp.id === proposal.workProgramme);
  const destination = DESTINATIONS.find(d => d.id === proposal.destination);

  const participants = realParticipants;
  
  // Merge team members with collaborator info
  const teamMembers: TeamMember[] = realMembers.map(m => {
    const participant = participants.find(p => p.id === m.participantId);
    const collaborator = collaborators.find(c => c.email === m.email);
    return {
      id: m.id,
      fullName: m.fullName,
      email: m.email,
      roleInProject: m.roleInProject,
      personMonths: m.personMonths,
      participantId: m.participantId,
      organisation: participant?.organisationName || 'Unknown',
      organisationShortName: participant?.organisationShortName || '',
      organisationLogo: participant?.logoUrl,
      isCollaborator: !!collaborator,
      collaboratorRole: collaborator?.role,
    };
  });

  // Add collaborators who aren't in team members list
  collaborators.forEach(collab => {
    if (!teamMembers.find(m => m.email === collab.email)) {
      teamMembers.push({
        id: collab.id,
        fullName: collab.fullName || collab.email || 'Unknown',
        email: collab.email,
        roleInProject: undefined,
        personMonths: undefined,
        participantId: '',
        organisation: '',
        organisationShortName: '',
        isCollaborator: true,
        collaboratorRole: collab.role,
      });
    }
  });

  // Calculate total budget from items
  const totalBudgetFromItems = budgetItems.reduce((sum, item) => sum + item.amount, 0);

  // Calculate days until deadline
  const daysUntilDeadline = proposal.deadline
    ? Math.ceil((new Date(proposal.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Calculate completion percentages (demo values)
  const completionStats = {
    partA: 75,
    partB: 45,
    budget: 90,
    ethics: 100,
  };

  const handleSave = async () => {
    if (onUpdateProposal) {
      await onUpdateProposal(editedProposal);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedProposal(proposal);
    setIsEditing(false);
  };

  const handleLogoChange = (url: string | null) => {
    setEditedProposal({ ...editedProposal, logoUrl: url || undefined });
  };

  // Check if user can edit (admin or owner) - isAdmin already includes owner check from useProposalData
  const userCanEdit = canEdit && isAdmin;

  return (
    <div className="flex-1 overflow-auto p-6 bg-muted/30">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="mb-2">
          <h1 className="text-2xl font-bold text-foreground">Proposal overview</h1>
          <p className="text-muted-foreground mt-1">Central hub for proposal metadata and consortium information</p>
        </div>

        {/* Header with Project Logo and Basic Info */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Project identity
              </CardTitle>
              {userCanEdit && (
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={handleCancel}>
                        <X className="w-4 h-4 mr-1" />
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleSave}>
                        <Check className="w-4 h-4 mr-1" />
                        Save
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                      <Pencil className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-start gap-6">
              {/* Project Logo */}
              <div className="flex-shrink-0">
                {isEditing ? (
                  <LogoUpload
                    currentUrl={editedProposal.logoUrl || null}
                    proposalAcronym={editedProposal.acronym}
                    proposalTitle={editedProposal.title}
                    onUpload={handleLogoChange}
                  />
                ) : (
                  <div className="w-24 h-24 rounded-xl bg-muted border flex items-center justify-center overflow-hidden">
                    {proposal.logoUrl ? (
                      <img src={proposal.logoUrl} alt={proposal.acronym} className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-3xl font-bold text-primary">{proposal.acronym.substring(0, 2)}</div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-4">
                {/* Acronym & Type & Status */}
                <div className="flex items-center gap-2 flex-wrap">
                  {isEditing ? (
                    <Input
                      value={editedProposal.acronym}
                      onChange={(e) => setEditedProposal({ ...editedProposal, acronym: e.target.value })}
                      className="text-lg font-semibold w-40"
                      placeholder="Acronym"
                    />
                  ) : (
                    <Badge variant="outline" className="text-lg px-3 py-1 font-semibold">
                      {proposal.acronym}
                    </Badge>
                  )}
                  
                  {isEditing ? (
                    <Select
                      value={editedProposal.type}
                      onValueChange={(v) => setEditedProposal({ ...editedProposal, type: v as ProposalType })}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="RIA">RIA</SelectItem>
                        <SelectItem value="IA">IA</SelectItem>
                        <SelectItem value="CSA">CSA</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="secondary">
                      {PROPOSAL_TYPE_LABELS[proposal.type]}
                    </Badge>
                  )}
                  
                  <Badge 
                    variant={proposal.status === 'draft' ? 'outline' : proposal.status === 'funded' ? 'default' : 'secondary'}
                    className={proposal.status === 'funded' ? 'bg-success text-success-foreground' : ''}
                  >
                    {PROPOSAL_STATUS_LABELS[proposal.status]}
                  </Badge>
                </div>

                {/* Title */}
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Title</label>
                  {isEditing ? (
                    <Input
                      value={editedProposal.title}
                      onChange={(e) => setEditedProposal({ ...editedProposal, title: e.target.value })}
                      className="text-xl font-bold"
                      placeholder="Full proposal title"
                    />
                  ) : (
                    <h2 className="text-xl font-bold text-foreground">{proposal.title}</h2>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* Work Programme & Destination */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Work programme</label>
                {isEditing ? (
                  <Select
                    value={editedProposal.workProgramme || ''}
                    onValueChange={(v) => setEditedProposal({ ...editedProposal, workProgramme: v, destination: undefined })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select work programme" />
                    </SelectTrigger>
                    <SelectContent>
                      {WORK_PROGRAMMES.map(wp => (
                        <SelectItem key={wp.id} value={wp.id}>
                          {wp.abbreviation} - {wp.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="font-medium">
                    {workProgramme ? `${workProgramme.abbreviation} - ${workProgramme.fullName}` : 'Not specified'}
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Destination</label>
                {isEditing ? (
                  <Select
                    value={editedProposal.destination || ''}
                    onValueChange={(v) => setEditedProposal({ ...editedProposal, destination: v })}
                    disabled={!editedProposal.workProgramme}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select destination" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableDestinations.map(d => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.abbreviation} - {d.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="font-medium">
                    {destination ? `${destination.abbreviation} - ${destination.fullName}` : 'Not specified'}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Topic & Funding Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              Call & topic information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Topic ID</label>
                {isEditing ? (
                  <Input
                    value={editedProposal.topicId || ''}
                    onChange={(e) => setEditedProposal({ ...editedProposal, topicId: e.target.value })}
                    placeholder="e.g. HORIZON-CL5-2026-D1-01"
                  />
                ) : (
                  <p className="font-medium">{proposal.topicId || 'Not specified'}</p>
                )}
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Topic link (Funding & Tenders Portal)</label>
                {isEditing ? (
                  <Input
                    value={editedProposal.topicUrl || ''}
                    onChange={(e) => setEditedProposal({ ...editedProposal, topicUrl: e.target.value })}
                    placeholder="https://ec.europa.eu/info/funding-tenders/..."
                  />
                ) : proposal.topicUrl ? (
                  <Button
                    variant="link"
                    className="p-0 h-auto font-medium text-primary"
                    onClick={() => window.open(proposal.topicUrl, '_blank')}
                  >
                    View on Portal <ExternalLink className="w-3 h-3 ml-1" />
                  </Button>
                ) : (
                  <span className="font-medium text-muted-foreground">Not set</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Key Dates - MOVED ABOVE BUDGET */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5" />
              Key dates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Deadline</label>
                {isEditing ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !editedProposal.deadline && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {editedProposal.deadline ? format(editedProposal.deadline, 'PPP') : 'Select date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-50 bg-popover" align="start">
                      <Calendar
                        mode="single"
                        selected={editedProposal.deadline}
                        onSelect={(date) => setEditedProposal({ ...editedProposal, deadline: date })}
                        disabled={(date) => date < new Date()}
                      />
                    </PopoverContent>
                  </Popover>
                ) : (
                  <div>
                    <p className="font-medium text-lg">
                      {proposal.deadline ? format(proposal.deadline, 'dd MMM yyyy') : 'Not set'}
                    </p>
                    {daysUntilDeadline !== null && daysUntilDeadline > 0 && (
                      <p className="text-sm text-warning font-medium">{daysUntilDeadline} days remaining</p>
                    )}
                  </div>
                )}
              </div>
              
              {/* Decision fields only for non-draft proposals */}
              {proposal.status !== 'draft' && (
                <>
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">Submission date</label>
                    <p className="font-medium">
                      {proposal.submittedAt ? format(proposal.submittedAt, 'dd MMM yyyy') : 'Not recorded'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">Decision date</label>
                    {isEditing ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !editedProposal.decisionDate && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {editedProposal.decisionDate ? format(editedProposal.decisionDate, 'PPP') : 'Select date'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 z-50 bg-popover" align="start">
                          <Calendar
                            mode="single"
                            selected={editedProposal.decisionDate}
                            onSelect={(date) => setEditedProposal({ ...editedProposal, decisionDate: date })}
                          />
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <p className="font-medium">
                        {proposal.decisionDate ? format(proposal.decisionDate, 'dd MMM yyyy') : 'Pending'}
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Budget Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Euro className="w-5 h-5" />
              Budget information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Budget available (topic)</label>
                {isEditing ? (
                  <Input
                    type="number"
                    value={editedProposal.totalBudget || ''}
                    onChange={(e) => setEditedProposal({ ...editedProposal, totalBudget: parseFloat(e.target.value) || undefined })}
                    placeholder="e.g. 5000000"
                  />
                ) : (
                  <p className="font-medium text-lg">
                    {proposal.totalBudget ? `€${proposal.totalBudget.toLocaleString()}` : 'Not specified'}
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Budget applied for</label>
                <p className="font-medium text-lg">€{totalBudgetFromItems.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">(from budget sheet)</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Projects to be funded</label>
                {isEditing ? (
                  <Input
                    value={editedProposal.expectedProjects || ''}
                    onChange={(e) => setEditedProposal({ ...editedProposal, expectedProjects: e.target.value })}
                    placeholder="e.g. 1-3"
                  />
                ) : (
                  <p className="font-medium">{proposal.expectedProjects || 'Not specified'}</p>
                )}
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Budget type</label>
                {isEditing ? (
                  <Select
                    value={editedProposal.budgetType}
                    onValueChange={(v: 'traditional' | 'lump_sum') => setEditedProposal({ ...editedProposal, budgetType: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="traditional">Standard</SelectItem>
                      <SelectItem value="lump_sum">Lump Sum</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant={proposal.budgetType === 'lump_sum' ? 'default' : 'secondary'}>
                    {proposal.budgetType === 'lump_sum' ? 'Lump Sum' : 'Standard'}
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Euro className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Budget applied</p>
                  <p className="text-xl font-bold">€{totalBudgetFromItems.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-success" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Participants</p>
                  <p className="text-xl font-bold">{participants.length} organisations</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-secondary/50 flex items-center justify-center">
                  <Users className="w-5 h-5 text-secondary-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Team members</p>
                  <p className="text-xl font-bold">{teamMembers.length} people</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Project duration</p>
                  <p className="text-xl font-bold">36 months</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Completion Progress */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Proposal completion
            </CardTitle>
            <CardDescription>Track your progress across all sections</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Part A - Administrative</span>
                  <span className="font-medium">{completionStats.partA}%</span>
                </div>
                <Progress value={completionStats.partA} className="h-2" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Part B - Technical</span>
                  <span className="font-medium">{completionStats.partB}%</span>
                </div>
                <Progress value={completionStats.partB} className="h-2" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Budget</span>
                  <span className="font-medium">{completionStats.budget}%</span>
                </div>
                <Progress value={completionStats.budget} className="h-2" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Ethics self-assessment</span>
                  <span className="font-medium">{completionStats.ethics}%</span>
                </div>
                <Progress value={completionStats.ethics} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Submission Workflow */}
        {onSubmit && onUpdateStatus && (
          <SubmissionWorkflow
            proposal={proposal}
            participants={participants}
            budgetItems={budgetItems}
            onSubmit={onSubmit}
            onUpdateStatus={onUpdateStatus}
            canEdit={canEdit}
            isAdmin={isAdmin}
          />
        )}

        {/* Consortium Partners - MERGED: Logos + Partner details in one section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Consortium partners
            </CardTitle>
            <CardDescription>Participating organisations with contact details and PIC numbers</CardDescription>
          </CardHeader>
          <CardContent>
            {participants.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {participants.map((participant, index) => (
                  <div
                    key={participant.id}
                    className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div className="w-14 h-14 rounded-lg bg-white border flex items-center justify-center overflow-hidden flex-shrink-0">
                      {participant.logoUrl ? (
                        <img
                          src={participant.logoUrl}
                          alt={participant.organisationShortName || participant.organisationName}
                          className="w-12 h-12 object-contain"
                        />
                      ) : (
                        <span className="text-lg font-bold text-muted-foreground">{index + 1}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm">
                          {participant.organisationShortName || participant.organisationName}
                        </p>
                        <Badge variant="outline" className="text-xs">
                          {PARTICIPANT_TYPE_LABELS[participant.organisationType].split(' ')[0]}
                        </Badge>
                        {participant.isSme && (
                          <Badge variant="secondary" className="text-xs">SME</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {participant.organisationName}
                      </p>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          <span>{participant.country || 'Country not set'}</span>
                        </div>
                        {participant.picNumber && (
                          <div className="flex items-center gap-1">
                            <Hash className="w-3 h-3" />
                            <span>PIC: {participant.picNumber}</span>
                          </div>
                        )}
                        {participant.contactEmail && (
                          <div className="flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            <a href={`mailto:${participant.contactEmail}`} className="hover:underline text-primary">
                              {participant.contactEmail}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No participants added yet. Add participants in the A2 section.</p>
            )}
          </CardContent>
        </Card>

        {/* Team - MERGED: Collaborators + Team Members in one section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Team
            </CardTitle>
            <CardDescription>
              Collaborators and team members working on this proposal
              {teamMembers.filter(m => m.personMonths).length > 0 && (
                <> ({teamMembers.reduce((sum, m) => sum + (m.personMonths || 0), 0)} total person-months)</>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {teamMembers.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {teamMembers.map((member) => (
                  <HoverCard key={member.id} openDelay={200} closeDelay={100}>
                    <HoverCardTrigger asChild>
                      <div className="flex items-center gap-3 p-3 rounded-lg border bg-card cursor-pointer hover:bg-muted/50 transition-colors">
                        <Avatar className="w-10 h-10">
                          {member.organisationLogo ? (
                            <AvatarImage src={member.organisationLogo} alt={member.organisationShortName} />
                          ) : null}
                          <AvatarFallback className="bg-primary/10 text-primary">
                            {member.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{member.fullName}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {member.roleInProject || member.organisationShortName || member.organisation}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {member.collaboratorRole && (
                            <Badge variant={member.collaboratorRole === 'owner' ? 'default' : member.collaboratorRole === 'admin' ? 'secondary' : 'outline'} className="text-xs capitalize">
                              {member.collaboratorRole}
                            </Badge>
                          )}
                          {member.personMonths && (
                            <span className="text-xs text-muted-foreground">{member.personMonths} PM</span>
                          )}
                        </div>
                      </div>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-80" side="top">
                      <div className="flex gap-4">
                        <Avatar className="w-12 h-12">
                          <AvatarFallback className="bg-primary/10 text-primary text-lg">
                            {member.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="space-y-1 flex-1">
                          <h4 className="text-sm font-semibold">{member.fullName}</h4>
                          {member.email && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Mail className="w-3 h-3" />
                              <span>{member.email}</span>
                            </div>
                          )}
                          {member.organisation && (
                            <p className="text-xs text-muted-foreground">{member.organisation}</p>
                          )}
                          <div className="flex items-center gap-2 pt-1 flex-wrap">
                            {member.roleInProject && (
                              <Badge variant="outline" className="text-xs">{member.roleInProject}</Badge>
                            )}
                            {member.collaboratorRole && (
                              <Badge variant={member.collaboratorRole === 'owner' ? 'default' : 'secondary'} className="text-xs capitalize">
                                {member.collaboratorRole}
                              </Badge>
                            )}
                            {member.personMonths && (
                              <span className="text-xs text-muted-foreground">{member.personMonths} person-months</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No team members added yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
