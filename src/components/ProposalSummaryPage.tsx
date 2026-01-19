import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Proposal, Participant, ParticipantMember, PARTICIPANT_TYPE_LABELS, WORK_PROGRAMMES, DESTINATIONS, PROPOSAL_STATUS_LABELS, PROPOSAL_TYPE_LABELS } from '@/types/proposal';
import {
  ExternalLink,
  Calendar,
  Euro,
  Users,
  Building2,
  MapPin,
  Clock,
  FileText,
  Target,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Globe,
  Briefcase,
} from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';

interface ProposalSummaryPageProps {
  proposal: Proposal;
  participants: Participant[];
  participantMembers: ParticipantMember[];
  budgetItems: { amount: number; participantId: string }[];
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
const DEMO_PARTICIPANTS = [
  {
    id: 'demo-1',
    organisationName: 'Technical University of Munich',
    organisationShortName: 'TUM',
    country: 'Germany',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Logo_of_the_Technical_University_of_Munich.svg/200px-Logo_of_the_Technical_University_of_Munich.svg.png',
    organisationType: 'beneficiary' as const,
    isSme: false,
    participantNumber: 1,
  },
  {
    id: 'demo-2',
    organisationName: 'CEA',
    organisationShortName: 'CEA',
    country: 'France',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/CEA_logotype2012.png/200px-CEA_logotype2012.png',
    organisationType: 'beneficiary' as const,
    isSme: false,
    participantNumber: 2,
  },
  {
    id: 'demo-3',
    organisationName: 'Politecnico di Milano',
    organisationShortName: 'POLIMI',
    country: 'Italy',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Logo_Politecnico_Milano.png/200px-Logo_Politecnico_Milano.png',
    organisationType: 'beneficiary' as const,
    isSme: false,
    participantNumber: 3,
  },
  {
    id: 'demo-4',
    organisationName: 'KTH Royal Institute of Technology',
    organisationShortName: 'KTH',
    country: 'Sweden',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/e/e0/KTH_Royal_Institute_of_Technology_logo.svg/200px-KTH_Royal_Institute_of_Technology_logo.svg.png',
    organisationType: 'beneficiary' as const,
    isSme: false,
    participantNumber: 4,
  },
  {
    id: 'demo-5',
    organisationName: 'National Technical University of Athens',
    organisationShortName: 'NTUA',
    country: 'Greece',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/8/8c/NTUA_logo.svg/150px-NTUA_logo.svg.png',
    organisationType: 'beneficiary' as const,
    isSme: false,
    participantNumber: 5,
  },
  {
    id: 'demo-6',
    organisationName: 'Siemens AG',
    organisationShortName: 'SIEMENS',
    country: 'Germany',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Siemens-logo.svg/200px-Siemens-logo.svg.png',
    organisationType: 'beneficiary' as const,
    isSme: false,
    participantNumber: 6,
  },
];

export function ProposalSummaryPage({
  proposal,
  participants: realParticipants,
  participantMembers: realMembers,
  budgetItems,
}: ProposalSummaryPageProps) {
  const workProgramme = WORK_PROGRAMMES.find(wp => wp.id === proposal.workProgramme);
  const destination = DESTINATIONS.find(d => d.id === proposal.destination);

  // Use demo data if no real data exists
  const participants = realParticipants.length > 0 ? realParticipants : DEMO_PARTICIPANTS.map(p => ({
    ...p,
    proposalId: proposal.id,
  }));
  
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

  return (
    <div className="flex-1 overflow-auto p-6 bg-muted/30">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header with Project Logo */}
        <div className="flex items-start gap-6">
          {/* Project Logo */}
          <div className="w-24 h-24 rounded-xl bg-card border flex items-center justify-center overflow-hidden flex-shrink-0">
            {proposal.logoUrl ? (
              <img src={proposal.logoUrl} alt={proposal.acronym} className="w-full h-full object-cover" />
            ) : (
              <div className="text-3xl font-bold text-primary">{proposal.acronym.substring(0, 2)}</div>
            )}
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <Badge variant="outline" className="text-lg px-3 py-1 font-semibold">
                {proposal.acronym}
              </Badge>
              <Badge variant="secondary">
                {PROPOSAL_TYPE_LABELS[proposal.type]}
              </Badge>
              <Badge 
                variant={proposal.status === 'draft' ? 'outline' : proposal.status === 'funded' ? 'default' : 'secondary'}
                className={proposal.status === 'funded' ? 'bg-success text-success-foreground' : ''}
              >
                {PROPOSAL_STATUS_LABELS[proposal.status]}
              </Badge>
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">{proposal.title}</h1>
            {proposal.description && (
              <p className="text-muted-foreground line-clamp-2">{proposal.description}</p>
            )}
          </div>
        </div>

        {/* Quick Stats Grid */}
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
                  <Calendar className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Deadline</p>
                  <p className="text-xl font-bold">
                    {proposal.deadline ? format(proposal.deadline, 'dd MMM yyyy') : 'Not set'}
                  </p>
                  {daysUntilDeadline !== null && daysUntilDeadline > 0 && (
                    <p className="text-xs text-muted-foreground">{daysUntilDeadline} days left</p>
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

        {/* Topic & Programme Information */}
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
                <p className="text-sm text-muted-foreground mb-1">Work Programme</p>
                <p className="font-medium">
                  {workProgramme ? `${workProgramme.fullName} (${workProgramme.abbreviation})` : 'Not specified'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Destination</p>
                <p className="font-medium">
                  {destination ? `${destination.fullName} (${destination.abbreviation})` : 'Not specified'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Topic ID</p>
                <p className="font-medium">{proposal.topicId || 'HORIZON-CL5-2026-D1-01'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Topic URL</p>
                {proposal.topicUrl ? (
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

        {/* Consortium Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              Consortium Overview
            </CardTitle>
            <CardDescription>Participating organisations and their countries</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {participants.map((participant, index) => (
                <div
                  key={participant.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                    {participant.logoUrl ? (
                      <img
                        src={participant.logoUrl}
                        alt={participant.organisationShortName || participant.organisationName}
                        className="w-8 h-8 object-contain"
                      />
                    ) : (
                      <span className="text-sm font-bold text-muted-foreground">{index + 1}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">
                      {participant.organisationShortName || participant.organisationName}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <MapPin className="w-3 h-3" />
                      <span>{participant.country || 'Country not set'}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs flex-shrink-0">
                    {PARTICIPANT_TYPE_LABELS[participant.organisationType].split(' ')[0]}
                  </Badge>
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
            <CardDescription>All team members and their organisations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {teamMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  {/* Member Avatar */}
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-semibold text-primary">
                      {member.fullName.split(' ').map(n => n[0]).join('').toUpperCase()}
                    </span>
                  </div>

                  {/* Member Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{member.fullName}</p>
                    <p className="text-sm text-muted-foreground truncate">{member.roleInProject || 'Team Member'}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {/* Organisation Logo */}
                      <div className="w-5 h-5 rounded bg-muted flex items-center justify-center overflow-hidden">
                        {member.organisationLogo ? (
                          <img
                            src={member.organisationLogo}
                            alt={member.organisationShortName}
                            className="w-4 h-4 object-contain"
                          />
                        ) : (
                          <Building2 className="w-3 h-3 text-muted-foreground" />
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground truncate">
                        {member.organisationShortName || member.organisation}
                      </span>
                    </div>
                  </div>

                  {/* Person Months */}
                  {member.personMonths && (
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg font-semibold text-primary">{member.personMonths}</p>
                      <p className="text-xs text-muted-foreground">PM</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
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
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Created:</span>
                <span className="font-medium">{format(proposal.createdAt, 'dd MMM yyyy')}</span>
              </div>
              <Separator orientation="vertical" className="h-4" />
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Last updated:</span>
                <span className="font-medium">{format(proposal.updatedAt, 'dd MMM yyyy, HH:mm')}</span>
              </div>
              {proposal.submittedAt && (
                <>
                  <Separator orientation="vertical" className="h-4" />
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Submitted:</span>
                    <span className="font-medium">{format(proposal.submittedAt, 'dd MMM yyyy')}</span>
                  </div>
                </>
              )}
              {proposal.decisionDate && (
                <>
                  <Separator orientation="vertical" className="h-4" />
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Decision:</span>
                    <span className="font-medium">{format(proposal.decisionDate, 'dd MMM yyyy')}</span>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
