import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { LogoUpload } from '@/components/LogoUpload';
import { ProposalSchedule } from '@/components/ProposalSchedule';
import { ParticipantTable, ExtendedParticipant } from '@/components/ParticipantTable';

import { Proposal, Participant, ParticipantMember, WORK_PROGRAMMES, DESTINATIONS, ProposalStatus, getDestinationsForWorkProgramme } from '@/types/proposal';

import {
  ExternalLink,
  Calendar as CalendarIcon,
  Euro,
  Users,
  FileText,
  Target,
  Pencil,
  Check,
  X,
  Download,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface ProposalSummaryPageProps {
  proposal: Proposal;
  participants: Participant[];
  participantMembers: ParticipantMember[];
  budgetItems: { amount: number; participantId: string }[];
  onUpdateProposal?: (updates: Partial<Proposal>) => Promise<void>;
  onUpdateParticipant?: (id: string, updates: Partial<ExtendedParticipant>) => void;
  onSubmit?: () => Promise<void>;
  onUpdateStatus?: (status: ProposalStatus) => Promise<void>;
  canEdit?: boolean;
  isAdmin?: boolean;
  onExportPdf?: () => void;
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
  onUpdateParticipant,
  onSubmit,
  onUpdateStatus,
  canEdit = true,
  isAdmin = false,
  onExportPdf,
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

  const participants = realParticipants;
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
          <div className="mb-2 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-foreground">Proposal overview</h1>
            {onExportPdf && (
              <Button variant="outline" size="sm" className="gap-2" onClick={onExportPdf}>
                <Download className="w-4 h-4" />
                Export PDF
              </Button>
            )}
          </div>

        {/* Header with Project Logo and Basic Info */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Project identity
            </CardTitle>
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
            <CardTitle className="flex items-center gap-2">
              <Euro className="w-5 h-5" />
              Budget overview
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
                      <SelectItem value="traditional">Actual costs</SelectItem>
                      <SelectItem value="lump_sum">Lump sum</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant={proposal.budgetType === 'lump_sum' ? 'default' : 'secondary'}>
                    {proposal.budgetType === 'lump_sum' ? 'Lump sum' : 'Actual costs'}
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
          />
        )}

        {/* List of participants */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              List of participants
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ParticipantTable
              participants={participants as ExtendedParticipant[]}
              proposalId={proposal.id}
              isEditing={isEditing}
              onUpdateParticipant={onUpdateParticipant}
            />
          </CardContent>
        </Card>

        </div>
      </div>


      {/* Fixed Bottom Edit Bar for Owners/Admins - Right Positioned */}
      {userCanEdit && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="flex items-center gap-2 bg-background border rounded-lg shadow-lg p-2">
            {!isEditing ? (
              <Button onClick={() => setIsEditing(true)} className="gap-2">
                <Pencil className="w-4 h-4" />
                Edit
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={handleCancel} className="gap-2">
                  <X className="w-4 h-4" />
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} className="gap-2">
                  <Check className="w-4 h-4" />
                  Save
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
