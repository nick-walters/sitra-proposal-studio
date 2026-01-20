import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { LogoUpload } from '@/components/LogoUpload';
import { GanttChart } from '@/components/GanttChart';
import { ConsortiumMap } from '@/components/ConsortiumMap';
import { SubmissionWorkflow } from '@/components/SubmissionWorkflow';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Proposal, Participant, ParticipantMember, PARTICIPANT_TYPE_LABELS, WORK_PROGRAMMES, DESTINATIONS, PROPOSAL_STATUS_LABELS, PROPOSAL_TYPE_LABELS, ProposalType, ProposalStatus, getDestinationsForWorkProgramme } from '@/types/proposal';
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
  Globe,
  Pencil,
  Check,
  X,
  Mail,
  Hash,
  Tag,
  Info,
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

// Demo data for team members with organisations
const DEMO_TEAM_MEMBERS = [
  {
    id: '1',
    fullName: 'Dr. Maria Schmidt',
    email: 'maria.schmidt@tum.de',
    roleInProject: 'Project Coordinator',
    personMonths: 24,
    participantId: 'demo-1',
    organisation: 'Technical University of Munich',
    organisationShortName: 'TUM',
    organisationLogo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Logo_of_the_Technical_University_of_Munich.svg/200px-Logo_of_the_Technical_University_of_Munich.svg.png',
  },
  {
    id: '2',
    fullName: 'Prof. Jean-Pierre Dubois',
    email: 'jp.dubois@cea.fr',
    roleInProject: 'WP1 Leader',
    personMonths: 18,
    participantId: 'demo-2',
    organisation: 'CEA',
    organisationShortName: 'CEA',
    organisationLogo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/CEA_logotype2012.png/200px-CEA_logotype2012.png',
  },
  {
    id: '3',
    fullName: 'Dr. Anna Kowalska',
    email: 'a.kowalska@polimi.it',
    roleInProject: 'WP2 Leader',
    personMonths: 15,
    participantId: 'demo-3',
    organisation: 'Politecnico di Milano',
    organisationShortName: 'POLIMI',
    organisationLogo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Logo_Politecnico_Milano.png/200px-Logo_Politecnico_Milano.png',
  },
  {
    id: '4',
    fullName: 'Dr. Erik Johansson',
    email: 'erik.johansson@kth.se',
    roleInProject: 'Technical Lead',
    personMonths: 20,
    participantId: 'demo-4',
    organisation: 'KTH Royal Institute of Technology',
    organisationShortName: 'KTH',
    organisationLogo: 'https://upload.wikimedia.org/wikipedia/en/thumb/e/e0/KTH_Royal_Institute_of_Technology_logo.svg/200px-KTH_Royal_Institute_of_Technology_logo.svg.png',
  },
  {
    id: '5',
    fullName: 'Dr. Sofia Papadopoulos',
    email: 's.papadopoulos@ntua.gr',
    roleInProject: 'Research Lead',
    personMonths: 12,
    participantId: 'demo-5',
    organisation: 'National Technical University of Athens',
    organisationShortName: 'NTUA',
    organisationLogo: 'https://upload.wikimedia.org/wikipedia/en/thumb/8/8c/NTUA_logo.svg/150px-NTUA_logo.svg.png',
  },
  {
    id: '6',
    fullName: 'Mr. Henrik Nielsen',
    email: 'h.nielsen@siemens.com',
    roleInProject: 'Industry Liaison',
    personMonths: 10,
    participantId: 'demo-6',
    organisation: 'Siemens AG',
    organisationShortName: 'SIEMENS',
    organisationLogo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Siemens-logo.svg/200px-Siemens-logo.svg.png',
  },
];

// Demo participants
const DEMO_PARTICIPANTS: Participant[] = [
  {
    id: 'demo-1',
    proposalId: 'demo',
    organisationName: 'Technical University of Munich',
    organisationShortName: 'TUM',
    country: 'Germany',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Logo_of_the_Technical_University_of_Munich.svg/200px-Logo_of_the_Technical_University_of_Munich.svg.png',
    organisationType: 'beneficiary',
    isSme: false,
    participantNumber: 1,
  },
  {
    id: 'demo-2',
    proposalId: 'demo',
    organisationName: 'CEA',
    organisationShortName: 'CEA',
    country: 'France',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/CEA_logotype2012.png/200px-CEA_logotype2012.png',
    organisationType: 'beneficiary',
    isSme: false,
    participantNumber: 2,
  },
  {
    id: 'demo-3',
    proposalId: 'demo',
    organisationName: 'Politecnico di Milano',
    organisationShortName: 'POLIMI',
    country: 'Italy',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Logo_Politecnico_Milano.png/200px-Logo_Politecnico_Milano.png',
    organisationType: 'beneficiary',
    isSme: false,
    participantNumber: 3,
  },
  {
    id: 'demo-4',
    proposalId: 'demo',
    organisationName: 'KTH Royal Institute of Technology',
    organisationShortName: 'KTH',
    country: 'Sweden',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/e/e0/KTH_Royal_Institute_of_Technology_logo.svg/200px-KTH_Royal_Institute_of_Technology_logo.svg.png',
    organisationType: 'beneficiary',
    isSme: false,
    participantNumber: 4,
  },
  {
    id: 'demo-5',
    proposalId: 'demo',
    organisationName: 'National Technical University of Athens',
    organisationShortName: 'NTUA',
    country: 'Greece',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/8/8c/NTUA_logo.svg/150px-NTUA_logo.svg.png',
    organisationType: 'beneficiary',
    isSme: false,
    participantNumber: 5,
  },
  {
    id: 'demo-6',
    proposalId: 'demo',
    organisationName: 'Siemens AG',
    organisationShortName: 'SIEMENS',
    country: 'Germany',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Siemens-logo.svg/200px-Siemens-logo.svg.png',
    organisationType: 'beneficiary',
    isSme: false,
    participantNumber: 6,
  },
];

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

  useEffect(() => {
    if (editedProposal.workProgramme) {
      setAvailableDestinations(getDestinationsForWorkProgramme(editedProposal.workProgramme));
    }
  }, [editedProposal.workProgramme]);

  const workProgramme = WORK_PROGRAMMES.find(wp => wp.id === proposal.workProgramme);
  const destination = DESTINATIONS.find(d => d.id === proposal.destination);

  // Use demo data if no real data exists
  const participants = realParticipants.length > 0 ? realParticipants : DEMO_PARTICIPANTS;
  
  const teamMembers = realMembers.length > 0 
    ? realMembers.map(m => {
        const participant = participants.find(p => p.id === m.participantId);
        return {
          ...m,
          organisation: participant?.organisationName || 'Unknown',
          organisationShortName: participant?.organisationShortName || '',
          organisationLogo: participant?.logoUrl,
        };
      })
    : DEMO_TEAM_MEMBERS;

  // Calculate total budget from items
  const totalBudgetFromItems = budgetItems.reduce((sum, item) => sum + item.amount, 0);
  const displayBudget = proposal.totalBudget || totalBudgetFromItems || 4500000;

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

  return (
    <div className="flex-1 overflow-auto p-6 bg-muted/30">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header with Project Logo and Basic Info */}
        <Card>
          <CardContent className="pt-6">
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
                {/* Edit toggle */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isEditing ? (
                      <Input
                        value={editedProposal.acronym}
                        onChange={(e) => setEditedProposal({ ...editedProposal, acronym: e.target.value })}
                        className="text-lg font-semibold w-40"
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
                  
                  {canEdit && (
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

                {/* Title */}
                {isEditing ? (
                  <Input
                    value={editedProposal.title}
                    onChange={(e) => setEditedProposal({ ...editedProposal, title: e.target.value })}
                    className="text-2xl font-bold"
                    placeholder="Proposal title"
                  />
                ) : (
                  <h1 className="text-2xl font-bold text-foreground">{proposal.title}</h1>
                )}

                {/* Description */}
                {isEditing ? (
                  <Textarea
                    value={editedProposal.description || ''}
                    onChange={(e) => setEditedProposal({ ...editedProposal, description: e.target.value })}
                    placeholder="Brief description of the proposal"
                    rows={2}
                  />
                ) : (
                  proposal.description && (
                    <p className="text-muted-foreground line-clamp-2">{proposal.description}</p>
                  )
                )}

                {/* Work Programme & Destination */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">Work Programme</label>
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
              </div>
            </div>
          </CardContent>
        </Card>

        {/* General Information (A0 fields from Horizon Europe forms) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="w-5 h-5" />
              General Information
            </CardTitle>
            <CardDescription>As per Horizon Europe Standard Application Form (Section 1)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Abstract */}
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Abstract</label>
              {isEditing ? (
                <Textarea
                  value={editedProposal.description || ''}
                  onChange={(e) => setEditedProposal({ ...editedProposal, description: e.target.value })}
                  placeholder="Short, precise description of project objectives, methodology, and relevance to the Work Programme..."
                  rows={5}
                  className="resize-none"
                />
              ) : (
                <p className="text-sm text-foreground bg-muted/30 p-3 rounded-md">
                  {proposal.description || 'No abstract provided. Add a brief description of project objectives, methodology, and relevance to the Work Programme.'}
                </p>
              )}
            </div>

            <Separator />

            {/* Project Duration & Keywords Grid */}
            <div className="grid gap-6 sm:grid-cols-2">
              {/* Project Duration */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Project Duration
                </label>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-lg px-3 py-1">
                    36 months
                  </Badge>
                  <span className="text-sm text-muted-foreground">(Standard duration)</span>
                </div>
              </div>

              {/* Keywords */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                  <Tag className="w-4 h-4" />
                  Keywords
                </label>
                <div className="flex flex-wrap gap-2">
                  {proposal.workProgramme && (
                    <Badge variant="secondary" className="text-xs">
                      {workProgramme?.abbreviation || proposal.workProgramme}
                    </Badge>
                  )}
                  {proposal.destination && (
                    <Badge variant="secondary" className="text-xs">
                      {destination?.abbreviation || proposal.destination}
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-xs">
                    {PROPOSAL_TYPE_LABELS[proposal.type]}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats & Dates */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Euro className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Budget</p>
                  <p className="text-xl font-bold">€{displayBudget.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                  <CalendarIcon className="w-5 h-5 text-warning" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Deadline</p>
                  {isEditing ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full justify-start text-left font-normal">
                          {editedProposal.deadline ? format(editedProposal.deadline, 'PPP') : 'Select date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={editedProposal.deadline}
                          onSelect={(date) => setEditedProposal({ ...editedProposal, deadline: date })}
                        />
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <>
                      <p className="text-xl font-bold">
                        {proposal.deadline ? format(proposal.deadline, 'dd MMM yyyy') : 'Not set'}
                      </p>
                      {daysUntilDeadline !== null && daysUntilDeadline > 0 && (
                        <p className="text-xs text-muted-foreground">{daysUntilDeadline} days left</p>
                      )}
                    </>
                  )}
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
                  <p className="text-sm text-muted-foreground">Team Members</p>
                  <p className="text-xl font-bold">{teamMembers.length} people</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Topic Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              Call & Topic Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Topic ID</p>
                {isEditing ? (
                  <Input
                    value={editedProposal.topicId || ''}
                    onChange={(e) => setEditedProposal({ ...editedProposal, topicId: e.target.value })}
                    placeholder="e.g., HORIZON-CL5-2026-D1-01"
                  />
                ) : (
                  <p className="font-medium">{proposal.topicId || 'Not specified'}</p>
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Topic URL</p>
                {isEditing ? (
                  <Input
                    value={editedProposal.topicUrl || ''}
                    onChange={(e) => setEditedProposal({ ...editedProposal, topicUrl: e.target.value })}
                    placeholder="https://..."
                  />
                ) : proposal.topicUrl ? (
                  <Button
                    variant="link"
                    className="p-0 h-auto font-medium"
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

        {/* Completion Progress */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Proposal Completion
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
                  <span>Ethics Self-Assessment</span>
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

        {/* Consortium Map */}
        <ConsortiumMap participants={participants} />

        {/* Gantt Chart */}
        <GanttChart projectDuration={36} />

        {/* Consortium Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              Consortium Partners
            </CardTitle>
            <CardDescription>Participating organisations with contact details and PIC numbers</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {participants.map((participant, index) => (
                <div
                  key={participant.id}
                  className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0 border">
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
          </CardContent>
        </Card>

        {/* Team Members */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Team Members
            </CardTitle>
            <CardDescription>
              All team members involved in the project ({teamMembers.reduce((sum, m) => sum + (m.personMonths || 0), 0)} total person-months)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {teamMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer group"
                >
                  <Avatar className="w-12 h-12 flex-shrink-0 border">
                    {member.organisationLogo ? (
                      <AvatarImage
                        src={member.organisationLogo}
                        alt={member.organisationShortName}
                        className="object-contain p-1"
                      />
                    ) : null}
                    <AvatarFallback className="text-sm font-bold bg-primary/10 text-primary">
                      {member.fullName.split(' ').map(n => n[0]).join('').toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm group-hover:text-primary transition-colors">
                        {member.fullName}
                      </p>
                      {member.personMonths && (
                        <Badge variant="secondary" className="text-xs">
                          {member.personMonths} PM
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {member.roleInProject || 'Team Member'}
                    </p>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Building2 className="w-3 h-3" />
                        <span>{member.organisationShortName || member.organisation}</span>
                      </div>
                      {member.email && (
                        <div className="flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          <a href={`mailto:${member.email}`} className="hover:underline text-primary">
                            {member.email}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
