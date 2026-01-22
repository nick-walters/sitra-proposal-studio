import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Calendar } from '@/components/ui/calendar';
import { LogoUpload } from '@/components/LogoUpload';
import { ProposalSchedule } from '@/components/ProposalSchedule';
import { DirectChatDialog } from '@/components/DirectChatDialog';
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
  Pencil,
  Check,
  X,
  Mail,
  Hash,
  Phone,
  Globe,
  Linkedin,
  MessageCircle,
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
  // Profile contact info
  phone?: string;
  countryCode?: string;
  website?: string;
  linkedin?: string;
  avatarUrl?: string;
}

// Generate a consistent color from acronym
function getAcronymColor(acronym: string): string {
  const colors = [
    'hsl(221, 83%, 53%)', // Blue
    'hsl(142, 76%, 36%)', // Green
    'hsl(262, 83%, 58%)', // Purple
    'hsl(24, 95%, 53%)',  // Orange
    'hsl(346, 77%, 50%)', // Red
    'hsl(199, 89%, 48%)', // Cyan
  ];
  let hash = 0;
  for (let i = 0; i < acronym.length; i++) {
    hash = acronym.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// Acronym-based logo fallback component
function AcronymLogo({ logoUrl, acronym }: { logoUrl?: string; acronym: string }) {
  const acronymColor = getAcronymColor(acronym);
  
  // Split acronym intelligently for display (e.g., TESTSTAGE1 -> TEST STAGE1)
  const formatAcronymForDisplay = (acr: string) => {
    // If short enough, display as is
    if (acr.length <= 6) return [acr];
    
    // Try to find a natural split point (capital letter followed by capital, or before numbers)
    const midPoint = Math.ceil(acr.length / 2);
    // Look for a good split point near the middle
    let splitIndex = midPoint;
    
    // Check for number boundary
    for (let i = midPoint - 2; i < Math.min(midPoint + 3, acr.length); i++) {
      if (i > 0 && /[A-Za-z]/.test(acr[i-1]) && /[0-9]/.test(acr[i])) {
        splitIndex = i;
        break;
      }
    }
    
    return [acr.substring(0, splitIndex), acr.substring(splitIndex)].filter(Boolean);
  };

  const acronymLines = formatAcronymForDisplay(acronym.toUpperCase());
  
  return (
    <div className="w-24 h-24 rounded-xl bg-muted border flex items-center justify-center overflow-hidden">
      {logoUrl ? (
        <img src={logoUrl} alt={acronym} className="w-full h-full object-cover" />
      ) : (
        <div 
          className="w-full h-full flex flex-col items-center justify-center gap-0.5 p-1"
          style={{ backgroundColor: acronymColor }}
        >
          {acronymLines.map((line, idx) => (
            <span 
              key={idx} 
              className="font-bold text-white tracking-tight text-center leading-tight"
              style={{ fontSize: acronymLines.length > 1 ? '0.9rem' : '1.5rem' }}
            >
              {line}
            </span>
          ))}
        </div>
      )}
    </div>
  );
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
  const [chatUserId, setChatUserId] = useState<string | null>(null);
  const [availableDestinations, setAvailableDestinations] = useState(
    proposal.workProgramme ? getDestinationsForWorkProgramme(proposal.workProgramme) : []
  );
  const [collaborators, setCollaborators] = useState<Array<{
    id: string;
    userId: string;
    role: string;
    email?: string;
    fullName?: string;
    phone?: string;
    countryCode?: string;
    website?: string;
    linkedin?: string;
    avatarUrl?: string;
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
          .select('id, full_name, email, phone_number, country_code, website, linkedin, avatar_url')
          .in('id', userIds);

        const collaboratorList = roles.map(role => {
          const profile = profiles?.find(p => p.id === role.user_id);
          return {
            id: role.id,
            userId: role.user_id,
            role: role.role,
            email: profile?.email,
            fullName: profile?.full_name,
            phone: profile?.phone_number,
            countryCode: profile?.country_code,
            website: profile?.website,
            linkedin: profile?.linkedin,
            avatarUrl: profile?.avatar_url,
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
      phone: collaborator?.phone,
      countryCode: collaborator?.countryCode,
      website: collaborator?.website,
      linkedin: collaborator?.linkedin,
      avatarUrl: collaborator?.avatarUrl,
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
        phone: collab.phone,
        countryCode: collab.countryCode,
        website: collab.website,
        linkedin: collab.linkedin,
        avatarUrl: collab.avatarUrl,
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
    <div className="flex-1 overflow-auto bg-muted/30 relative">
      <div className="p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Page Header */}
          <div className="mb-2">
            <h1 className="text-2xl font-bold text-foreground">Proposal overview</h1>
          </div>

        {/* Header with Project Logo and Basic Info */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Project identity
              </CardTitle>
              {userCanEdit && !isEditing ? (
                <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                  <Pencil className="w-4 h-4 mr-1" />
                  Edit
                </Button>
              ) : userCanEdit && isEditing ? (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={handleCancel}>
                    <X className="w-4 h-4 mr-1" />
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave}>
                    <Check className="w-4 h-4 mr-1" />
                    Save
                  </Button>
                </div>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
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
                  <AcronymLogo 
                    logoUrl={proposal.logoUrl} 
                    acronym={proposal.acronym} 
                  />
                )}
              </div>

              <div className="flex-1 space-y-4">
                {/* Acronym */}
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Acronym</label>
                  {isEditing ? (
                    <Input
                      value={editedProposal.acronym}
                      onChange={(e) => setEditedProposal({ ...editedProposal, acronym: e.target.value })}
                      className="text-lg font-semibold w-40"
                      placeholder="Acronym"
                    />
                  ) : (
                    <p className="text-lg font-semibold">{proposal.acronym}</p>
                  )}
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

                {/* Project Duration */}
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Project duration (months)</label>
                  {isEditing ? (
                    <Select
                      value={editedProposal.duration?.toString() || ''}
                      onValueChange={(v) => setEditedProposal({ ...editedProposal, duration: parseInt(v) })}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 72 }, (_, i) => i + 1).map((months) => (
                          <SelectItem key={months} value={months.toString()}>
                            {months}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="font-medium">{proposal.duration ? `${proposal.duration}` : '–'}</p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Topic - consolidated section */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5" />
                Topic
              </CardTitle>
              <div className="flex items-center gap-2">
                {proposal.topicUrl && !isEditing && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="gap-1.5"
                    onClick={() => window.open(proposal.topicUrl, '_blank')}
                  >
                    <ExternalLink className="w-4 h-4" />
                    View on portal
                  </Button>
                )}
                {userCanEdit && !isEditing ? (
                  <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                    <Pencil className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                ) : userCanEdit && isEditing ? (
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={handleCancel}>
                      <X className="w-4 h-4 mr-1" />
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSave}>
                      <Check className="w-4 h-4 mr-1" />
                      Save
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Topic ID with URL bubble */}
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Topic ID</label>
              {isEditing ? (
                <div className="space-y-2">
                  <Input
                    value={editedProposal.topicId || ''}
                    onChange={(e) => setEditedProposal({ ...editedProposal, topicId: e.target.value })}
                    placeholder="e.g. HORIZON-CL5-2026-D1-01"
                    className="max-w-md"
                  />
                  <Input
                    value={editedProposal.topicUrl || ''}
                    onChange={(e) => setEditedProposal({ ...editedProposal, topicUrl: e.target.value })}
                    placeholder="Portal URL (https://ec.europa.eu/...)"
                    type="url"
                    className="max-w-md"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="font-medium">{proposal.topicId || 'Not specified'}</p>
                  {proposal.topicUrl && (
                    <a 
                      href={proposal.topicUrl.startsWith('http') ? proposal.topicUrl : `https://${proposal.topicUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Topic
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Topic Title */}
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Topic title</label>
              {isEditing ? (
                <Input
                  value={editedProposal.topicTitle || ''}
                  onChange={(e) => setEditedProposal({ ...editedProposal, topicTitle: e.target.value })}
                />
              ) : (
                <p className="font-medium">{proposal.topicTitle || '–'}</p>
              )}
            </div>

            {/* Work Programme & Destination - side by side */}
            <div className="grid gap-4 sm:grid-cols-2">
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

            <Separator />

            {/* Key Dates */}
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
                        onSelect={(date) => {
                          setEditedProposal({ 
                            ...editedProposal, 
                            deadline: date,
                            // Auto-calculate decision date as 3 months after deadline if not already set
                            decisionDate: !editedProposal.decisionDate && date 
                              ? new Date(date.getFullYear(), date.getMonth() + 3, date.getDate()) 
                              : editedProposal.decisionDate
                          });
                        }}
                        disabled={(date) => date < new Date()}
                      />
                    </PopoverContent>
                  </Popover>
                ) : (
                  <div>
                    <p className="font-medium">
                      {proposal.deadline ? format(proposal.deadline, 'dd MMM yyyy') : 'Not set'}
                    </p>
                    {daysUntilDeadline !== null && daysUntilDeadline > 0 && (
                      <p className="text-sm text-warning font-medium">{daysUntilDeadline} days remaining</p>
                    )}
                  </div>
                )}
              </div>
              
              {/* Decision date - show for all statuses, with "(estimated)" for drafts */}
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  Decision{proposal.status === 'draft' && ' (estimated)'}
                </label>
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
                    {proposal.decisionDate 
                      ? format(proposal.decisionDate, 'dd MMM yyyy') 
                      : proposal.deadline 
                        ? format(new Date(proposal.deadline.getFullYear(), proposal.deadline.getMonth() + 3, proposal.deadline.getDate()), 'dd MMM yyyy')
                        : 'Not set'}
                  </p>
                )}
              </div>

              {/* Submission date only for non-draft proposals */}
              {proposal.status !== 'draft' && (
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Submission date</label>
                  <p className="font-medium">
                    {proposal.submittedAt ? format(proposal.submittedAt, 'dd MMM yyyy') : 'Not recorded'}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Budget Overview */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Euro className="w-5 h-5" />
                Budget overview
              </CardTitle>
              {userCanEdit && !isEditing ? (
                <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                  <Pencil className="w-4 h-4 mr-1" />
                  Edit
                </Button>
              ) : userCanEdit && isEditing ? (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={handleCancel}>
                    <X className="w-4 h-4 mr-1" />
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave}>
                    <Check className="w-4 h-4 mr-1" />
                    Save
                  </Button>
                </div>
              ) : null}
            </div>
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
                    {proposal.totalBudget ? `€${proposal.totalBudget.toLocaleString('en-IE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '–'}
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Budget applied for</label>
                <p className="font-medium text-lg">€{totalBudgetFromItems.toLocaleString('en-IE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">№ projects to be funded</label>
                {isEditing ? (
                  <Select
                    value={editedProposal.expectedProjects || ''}
                    onValueChange={(v) => setEditedProposal({ ...editedProposal, expectedProjects: v })}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((num) => (
                        <SelectItem key={num} value={num.toString()}>
                          {num}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="font-medium">{proposal.expectedProjects || '–'}</p>
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

        {/* Proposal Schedule (Combined Completion + Checklist) */}
        {onSubmit && onUpdateStatus && (
          <ProposalSchedule
            proposal={proposal}
            participants={participants}
            budgetItems={budgetItems}
            onSubmit={onSubmit}
            onUpdateStatus={onUpdateStatus}
            canEdit={canEdit}
            isAdmin={isAdmin}
            completionStats={completionStats}
          />
        )}

        {/* Participant organisations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Participant organisations
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

        {/* Collaborators */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Collaborators
            </CardTitle>
            <CardDescription>
              People working on this proposal
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
                          {member.avatarUrl ? (
                            <AvatarImage src={member.avatarUrl} alt={member.fullName} />
                          ) : null}
                          <AvatarFallback className="bg-primary/10 text-primary text-lg">
                            {member.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="space-y-1.5 flex-1">
                          <h4 className="text-sm font-semibold">{member.fullName}</h4>
                          {member.organisation && (
                            <p className="text-xs text-muted-foreground">{member.organisation}</p>
                          )}
                          <div className="space-y-1 pt-1">
                            {member.email && (
                              <a href={`mailto:${member.email}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                                <Mail className="w-3 h-3" />
                                <span>{member.email}</span>
                              </a>
                            )}
                            {member.phone && (
                              <a href={`tel:${member.countryCode || ''}${member.phone}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                                <Phone className="w-3 h-3" />
                                <span>{member.countryCode && `${member.countryCode} `}{member.phone}</span>
                              </a>
                            )}
                            {member.linkedin && (
                              <a href={member.linkedin.startsWith('http') ? member.linkedin : `https://linkedin.com/in/${member.linkedin}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                                <Linkedin className="w-3 h-3" />
                                <span>LinkedIn</span>
                              </a>
                            )}
                            {member.website && (
                              <a href={member.website.startsWith('http') ? member.website : `https://${member.website}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                                <Globe className="w-3 h-3" />
                                <span className="truncate">{member.website.replace(/^https?:\/\//, '')}</span>
                              </a>
                            )}
                          </div>
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
                              <span className="text-xs text-muted-foreground">{member.personMonths} PM</span>
                            )}
                          </div>
                          {member.isCollaborator && member.id && (
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="mt-2 w-full gap-1.5 text-xs"
                              onClick={() => setChatUserId(member.id)}
                            >
                              <MessageCircle className="w-3 h-3" />
                              Send message
                            </Button>
                          )}
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

      {/* Direct Chat Dialog */}
      <DirectChatDialog
        open={!!chatUserId}
        onOpenChange={(open) => !open && setChatUserId(null)}
        userId={chatUserId || ''}
      />
    </div>
  );
}
