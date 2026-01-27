import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { LogoUpload } from '@/components/LogoUpload';
// ProposalSchedule and ParticipantTable moved to A2 page
import { WPManagementCard } from '@/components/WPManagementCard';
import { WPDependencySelector } from '@/components/WPDependencySelector';
import { usePageEstimate } from '@/hooks/usePageEstimate';

import { Proposal, Participant, ParticipantMember, WORK_PROGRAMMES, DESTINATIONS, ProposalStatus, getDestinationsForWorkProgramme } from '@/types/proposal';

import {
  ExternalLink,
  Calendar as CalendarIcon,
  Euro,
  FileText,
  Target,
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
  onSubmit?: () => Promise<void>;
  onUpdateStatus?: (status: ProposalStatus) => Promise<void>;
  canEdit?: boolean;
  isAdmin?: boolean;
  onExportPdf?: () => void;
  onExportPdfNoWatermark?: () => void;
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
  onExportPdf,
  onExportPdfNoWatermark,
}: ProposalSummaryPageProps) {
  const [editedProposal, setEditedProposal] = useState(proposal);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [availableDestinations, setAvailableDestinations] = useState(
    proposal.workProgramme ? getDestinationsForWorkProgramme(proposal.workProgramme) : []
  );
  
  // Page estimate for PDF export
  const { estimatedPages, isLoading: isLoadingPageEstimate } = usePageEstimate(proposal.id);

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

  // Check if user can edit (admin or owner) - isAdmin already includes owner check from useProposalData
  const userCanEdit = canEdit && isAdmin;
  
  // For admins/owners, always show editable fields
  const isEditing = userCanEdit;

  // Auto-save with debounce when editedProposal changes (for admins/owners)
  const debouncedSave = useCallback((proposalData: typeof editedProposal) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(async () => {
      if (onUpdateProposal) {
        await onUpdateProposal(proposalData);
      }
    }, 1000); // 1 second debounce
  }, [onUpdateProposal]);

  // Trigger autosave when editedProposal changes
  useEffect(() => {
    // Only autosave if user can edit and there are actual changes
    if (userCanEdit && JSON.stringify(editedProposal) !== JSON.stringify(proposal)) {
      debouncedSave(editedProposal);
    }
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [editedProposal, userCanEdit, proposal, debouncedSave]);

  const handleLogoChange = (url: string | null) => {
    setEditedProposal({ ...editedProposal, logoUrl: url || undefined });
  };

  return (
    <div className="flex-1 overflow-auto bg-muted/30 relative">
      <div className="p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Page Header */}
          <div className="mb-2 flex items-center justify-between">
            <h1 className="text-lg font-bold text-foreground">Proposal overview</h1>
            <div className="flex items-center gap-3">
              {/* Page estimate */}
              {onExportPdf && estimatedPages !== null && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <span>{estimatedPages} {estimatedPages === 1 ? 'page' : 'pages'}</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-blue-100 text-blue-700 hover:bg-blue-100">
                    Est.
                  </Badge>
                </div>
              )}
              {onExportPdf && (
                <Button variant="outline" size="sm" className="gap-2" onClick={onExportPdf}>
                  <Download className="w-4 h-4" />
                  Export PDF
                </Button>
              )}
              {isAdmin && onExportPdfNoWatermark && (
                <Button variant="outline" size="sm" className="gap-2" onClick={onExportPdfNoWatermark}>
                  <Download className="w-4 h-4" />
                  Export watermark-free
                </Button>
              )}
            </div>
          </div>

        {/* Header with Project Logo and Basic Info */}
        <Card>
          <CardHeader className="pb-3 pt-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileText className="w-4 h-4" />
              Project identity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-6">
              {/* Left column: Title, Acronym, Duration */}
              <div className="flex-1 space-y-3">
                {/* Title */}
                <div>
                  <label className="text-xs text-muted-foreground mb-0.5 block">Title</label>
                  {isEditing ? (
                    <Input
                      value={editedProposal.title}
                      onChange={(e) => setEditedProposal({ ...editedProposal, title: e.target.value })}
                      className="text-sm font-semibold h-8"
                      placeholder="Full proposal title"
                    />
                  ) : (
                    <h2 className="text-sm font-semibold text-foreground">{proposal.title}</h2>
                  )}
                </div>

                {/* Acronym */}
                <div>
                  <label className="text-xs text-muted-foreground mb-0.5 block">Acronym</label>
                  {isEditing ? (
                    <Input
                      value={editedProposal.acronym}
                      onChange={(e) => setEditedProposal({ ...editedProposal, acronym: e.target.value })}
                      className="text-sm font-semibold w-40 h-8"
                      placeholder="Acronym"
                    />
                  ) : (
                    <p className="text-sm font-semibold">{proposal.acronym}</p>
                  )}
                </div>

                {/* Project Duration */}
                <div>
                  <label className="text-xs text-muted-foreground mb-0.5 block">Project duration (months)</label>
                  {isEditing ? (
                    <Select
                      value={editedProposal.duration?.toString() || ''}
                      onValueChange={(v) => setEditedProposal({ ...editedProposal, duration: parseInt(v) })}
                    >
                      <SelectTrigger className="w-32 h-8 text-sm">
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
                    <p className="text-sm font-medium">{proposal.duration ? `${proposal.duration}` : '–'}</p>
                  )}
                </div>
              </div>

              {/* Right column: Logo */}
              <div className="flex-shrink-0">
                <label className="text-xs text-muted-foreground mb-1.5 block">Project logo</label>
                {isEditing ? (
                  <LogoUpload
                    currentUrl={editedProposal.logoUrl || null}
                    proposalId={proposal.id}
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
            </div>
          </CardContent>
        </Card>

        {/* Topic - consolidated section */}
        <Card>
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Target className="w-4 h-4" />
                Topic
              </CardTitle>
              {proposal.topicUrl && !isEditing && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="gap-1.5 h-7 text-xs"
                  onClick={() => window.open(proposal.topicUrl, '_blank')}
                >
                  <ExternalLink className="w-3 h-3" />
                  View on portal
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Topic ID with URL bubble */}
            <div>
              <label className="text-xs text-muted-foreground mb-0.5 block">Topic ID</label>
              {isEditing ? (
                <div className="space-y-2">
                  <Input
                    value={editedProposal.topicId || ''}
                    onChange={(e) => setEditedProposal({ ...editedProposal, topicId: e.target.value })}
                    placeholder="e.g. HORIZON-CL5-2026-D1-01"
                    className="max-w-md h-8 text-sm"
                  />
                  <div>
                    <label className="text-xs text-muted-foreground mb-0.5 block">Link to topic</label>
                    <Input
                      value={editedProposal.topicUrl || ''}
                      onChange={(e) => setEditedProposal({ ...editedProposal, topicUrl: e.target.value })}
                      placeholder="Portal URL (https://ec.europa.eu/...)"
                      type="url"
                      className="max-w-md h-8 text-sm"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{proposal.topicId || 'Not specified'}</p>
                  {proposal.topicUrl && (
                    <a 
                      href={proposal.topicUrl.startsWith('http') ? proposal.topicUrl : `https://${proposal.topicUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                      Topic
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Topic Title */}
            <div>
              <label className="text-xs text-muted-foreground mb-0.5 block">Topic title</label>
              {isEditing ? (
                <Input
                  value={editedProposal.topicTitle || ''}
                  onChange={(e) => setEditedProposal({ ...editedProposal, topicTitle: e.target.value })}
                  className="h-8 text-sm"
                />
              ) : (
                <p className="text-sm font-medium">{proposal.topicTitle || '–'}</p>
              )}
            </div>

            {/* Proposal stage & Type of action */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">Proposal stage</label>
                <p className="text-sm font-medium">
                  {proposal.submissionStage === 'stage_1' ? 'Pre-proposal (stage 1)' : 'Full proposal'}
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">Type of action</label>
                <p className="text-sm font-medium">{proposal.type || 'Not specified'}</p>
              </div>
            </div>

            {/* Work Programme & Destination - side by side */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">Work programme</label>
                {isEditing ? (
                  <Select
                    value={editedProposal.workProgramme || ''}
                    onValueChange={(v) => setEditedProposal({ ...editedProposal, workProgramme: v, destination: undefined })}
                  >
                    <SelectTrigger className="h-8 text-sm">
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
                  <p className="text-sm font-medium">
                    {workProgramme ? `${workProgramme.abbreviation} - ${workProgramme.fullName}` : 'Not specified'}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">Destination</label>
                {isEditing ? (
                  <Select
                    value={editedProposal.destination || ''}
                    onValueChange={(v) => setEditedProposal({ ...editedProposal, destination: v })}
                    disabled={!editedProposal.workProgramme}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select destination" />
                    </SelectTrigger>
                    <SelectContent className="z-50 bg-popover">
                      {availableDestinations.map(d => (
                        <SelectItem key={d.id} value={d.id} className="!pl-2">
                          {d.abbreviation} - {d.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm font-medium">
                    {destination ? `${destination.abbreviation} - ${destination.fullName}` : 'Not specified'}
                  </p>
                )}
              </div>
            </div>

            <Separator />

            {/* Key Dates */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">Deadline</label>
                {isEditing ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-8 text-sm", !editedProposal.deadline && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
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
                    <p className="text-sm font-medium">
                      {proposal.deadline ? format(proposal.deadline, 'dd MMM yyyy') : 'Not set'}
                    </p>
                    {daysUntilDeadline !== null && daysUntilDeadline > 0 && (
                      <p className="text-xs text-warning font-medium">{daysUntilDeadline} days remaining</p>
                    )}
                  </div>
                )}
              </div>
              
              {/* Decision date - show for all statuses, with "(estimated)" for drafts */}
              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">
                  Decision{proposal.status === 'draft' && ' (estimated)'}
                </label>
                {isEditing ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-8 text-sm", !editedProposal.decisionDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
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
                  <p className="text-sm font-medium">
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
                  <label className="text-xs text-muted-foreground mb-0.5 block">Submission date</label>
                  <p className="text-sm font-medium">
                    {proposal.submittedAt ? format(proposal.submittedAt, 'dd MMM yyyy') : 'Not recorded'}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Budget Overview */}
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Euro className="w-4 h-4" />
              Budget overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">Budget available (topic)</label>
                {isEditing ? (
                  <Input
                    type="number"
                    value={editedProposal.totalBudget || ''}
                    onChange={(e) => setEditedProposal({ ...editedProposal, totalBudget: parseFloat(e.target.value) || undefined })}
                    placeholder="e.g. 5000000"
                    className="h-8 text-sm"
                  />
                ) : (
                  <p className="text-sm font-medium">
                    {proposal.totalBudget ? `€${proposal.totalBudget.toLocaleString('en-IE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '–'}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">Budget applied for</label>
                <p className="text-sm font-medium">€{totalBudgetFromItems.toLocaleString('en-IE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">№ projects to be funded</label>
                {isEditing ? (
                  <Select
                    value={editedProposal.expectedProjects || ''}
                    onValueChange={(v) => setEditedProposal({ ...editedProposal, expectedProjects: v })}
                  >
                    <SelectTrigger className="w-32 h-8 text-sm">
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
                  <p className="text-sm font-medium">{proposal.expectedProjects || '–'}</p>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">Budget type</label>
                {isEditing ? (
                  <Select
                    value={editedProposal.budgetType}
                    onValueChange={(v: 'traditional' | 'lump_sum') => setEditedProposal({ ...editedProposal, budgetType: v })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="traditional">Actual costs</SelectItem>
                      <SelectItem value="lump_sum">Lump sum</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm font-medium">{proposal.budgetType === 'lump_sum' ? 'Lump sum' : 'Actual costs'}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Proposal Schedule removed from overview page */}

        {/* Work Package Management Card - moved above participants */}
        <WPManagementCard
          proposalId={proposal.id}
          isAdmin={isAdmin}
          isFullProposal={proposal.submissionStage !== 'stage_1'}
        />

        {/* Participants list moved to A2 page */}

        {/* WP Dependencies for PERT Chart (Full Proposals Only) */}
        {proposal.submissionStage !== 'stage_1' && (
          <WPDependencySelector
            proposalId={proposal.id}
            isAdmin={isAdmin}
          />
        )}

        </div>
      </div>
    </div>
  );
}
