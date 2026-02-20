import { Proposal, WORK_PROGRAMMES, DESTINATIONS, PROPOSAL_STATUS_LABELS } from "@/types/proposal";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, FileText, ArrowRight, Send, CheckCircle2, XCircle, Clock, ExternalLink, AlertTriangle, Trophy, HelpCircle, Pin, PinOff, GripVertical } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ProposalCardProps {
  proposal: Proposal;
  onClick: () => void;
  compact?: boolean;
  topicIcon?: React.ReactNode;
  isPinned?: boolean;
  canPin?: boolean;
  onTogglePin?: (id: string) => void;
  showDragHandle?: boolean;
}

// Get combined status/urgency info
const getCombinedStatusInfo = (proposal: Proposal) => {
  const { status, deadline } = proposal;
  
  if (status === 'draft' && deadline) {
    const daysLeft = differenceInDays(deadline, new Date());
    
    if (daysLeft <= 28) {
      return {
        label: 'Draft – critical',
        days: daysLeft,
        icon: AlertTriangle,
        className: 'bg-red-500/15 text-red-600 border border-red-500/30'
      };
    } else if (daysLeft <= 56) {
      return {
        label: 'Draft – due soon',
        days: daysLeft,
        icon: Clock,
        className: 'bg-orange-500/15 text-orange-600 border border-orange-500/30'
      };
    } else {
      return {
        label: 'Draft – on track',
        days: daysLeft,
        icon: CheckCircle2,
        className: 'bg-green-500/15 text-green-600 border border-green-500/30'
      };
    }
  } else if (status === 'draft') {
    return {
      label: 'Draft',
      icon: Clock,
      className: 'bg-yellow-500/15 text-yellow-600 border border-yellow-500/30'
    };
  } else if (status === 'submitted') {
    return {
      label: 'Under evaluation',
      icon: Send,
      className: 'bg-orange-500/15 text-orange-600 border border-orange-500/30'
    };
  } else if (status === 'funded') {
    return {
      label: 'Funded',
      icon: Trophy,
      className: 'bg-white text-green-600 border border-green-500/30'
    };
  } else if (status === 'not_funded') {
    return {
      label: 'Not funded',
      icon: XCircle,
      className: 'bg-white text-red-600 border border-red-500/30'
    };
  }
  
  return {
    label: status,
    icon: Clock,
    className: 'bg-muted text-muted-foreground'
  };
};

export function ProposalCard({ proposal, onClick, compact = false, topicIcon, isPinned, canPin, onTogglePin, showDragHandle }: ProposalCardProps) {
  const isDraft = proposal.status === 'draft';
  const isDecided = proposal.status === 'funded' || proposal.status === 'not_funded';
  
  // Get work programme and destination
  const workProgramme = WORK_PROGRAMMES.find(wp => wp.id === proposal.workProgramme);
  const destination = DESTINATIONS.find(d => d.id === proposal.destination);
  
  // Get combined status info
  const statusInfo = getCombinedStatusInfo(proposal);
  const StatusIcon = statusInfo.icon;

  // Compact / list view
  if (compact) {
    return (
      <Card className={`card-elevated group cursor-pointer hover:border-primary/30 ${isPinned ? 'ring-1 ring-primary/40 bg-primary/[0.03]' : ''}`} onClick={onClick}>
        <CardContent className="p-2 flex items-center gap-2">
          {/* Drag handle for pinned */}
          {isPinned && showDragHandle && (
            <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50 cursor-grab flex-shrink-0" />
          )}
          {/* Pin button */}
          {onTogglePin && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-6 w-6 flex-shrink-0 ${isPinned ? 'text-primary' : 'text-muted-foreground/40 opacity-0 group-hover:opacity-100'}`}
                  onClick={(e) => { e.stopPropagation(); onTogglePin(proposal.id); }}
                  disabled={!isPinned && !canPin}
                >
                  {isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {isPinned ? 'Unpin' : canPin ? 'Pin to top' : 'Max 3 pinned'}
              </TooltipContent>
            </Tooltip>
          )}
          {/* Logo */}
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
            {proposal.logoUrl ? (
              <img src={proposal.logoUrl} alt={proposal.acronym} className="w-full h-full object-cover" />
            ) : topicIcon ? (
              topicIcon
            ) : (
              <FileText className="w-4 h-4 text-primary" />
            )}
          </div>
          
          {/* Info */}
          <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1">
            {/* Acronym and title - fixed width column */}
            <div className="sm:w-64 md:w-80 lg:w-96 flex-shrink-0">
              <div className="font-semibold text-sm">
                {proposal.acronym}
                {proposal.submissionStage === 'stage_1' && <span className="font-normal text-muted-foreground"> (Stage 1 of 2)</span>}
              </div>
              <div className="text-xs text-muted-foreground truncate">{proposal.title}</div>
            </div>
            {/* Badges - start from consistent alignment */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className={`proposal-badge ${statusInfo.className} flex items-center gap-0.5 text-[9px]`}>
                <StatusIcon className="w-2.5 h-2.5" />
                {statusInfo.label}
                {statusInfo.days !== undefined && ` (${statusInfo.days}d)`}
              </span>
              <span className="proposal-badge bg-white text-foreground border border-foreground text-[9px]">{proposal.type}</span>
              {workProgramme && (
                <span className="proposal-badge bg-gray-300 text-gray-700 text-[9px]">
                  {workProgramme.abbreviation}
                </span>
              )}
              {destination && (
                <span className="proposal-badge bg-gray-200 text-gray-600 text-[9px]" title={destination.fullName}>
                  {destination.abbreviation}
                </span>
              )}
            </div>
          </div>
          
          {/* Dates */}
          <div className="flex flex-col gap-0 flex-shrink-0 min-w-[145px] text-[9px] text-muted-foreground text-right ml-4 mr-4">
            {proposal.deadline && (
              <div className="flex items-center gap-0.5">
                <Calendar className="w-2.5 h-2.5 text-yellow-600" />
                <span className="font-bold">Deadline:</span> {format(proposal.deadline, 'dd/MM/yyyy')}
              </div>
            )}
            {/* Show decision date if available */}
            {proposal.decisionDate && (
              <div className="flex items-center gap-0.5">
                {isDecided ? (
                  proposal.status === 'funded' ? (
                    <CheckCircle2 className="w-2.5 h-2.5 text-green-600" />
                  ) : (
                    <XCircle className="w-2.5 h-2.5 text-red-600" />
                  )
                ) : (
                  <Clock className="w-2.5 h-2.5 text-muted-foreground" />
                )}
                <span className="font-bold">Decision:</span> {format(proposal.decisionDate, 'dd/MM/yyyy')}
                {proposal.decisionDateIsEstimated && !isDecided && (
                  <span className="inline-flex items-center gap-0.5 ml-1 px-1 py-0 text-[8px] font-medium bg-white text-blue-600 border border-blue-400 rounded">
                    <HelpCircle className="w-2 h-2" />
                    Est.
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {proposal.topicUrl && (
              <Button 
                variant="outline" 
                size="sm" 
                className="h-5 px-1.5 gap-0.5 text-[9px]"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(proposal.topicUrl, '_blank');
                }}
              >
                Topic
                <ExternalLink className="w-2 h-2" />
              </Button>
            )}
            <Button size="sm" className="h-5 min-w-[3rem] px-2 gap-0.5 text-[9px] bg-foreground text-background hover:bg-foreground/90">
              {isDraft ? 'Edit' : 'View'}
              <ArrowRight className="w-2 h-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Grid view
  return (
    <Card className={`card-elevated group cursor-pointer hover:border-primary/30 relative ${isPinned ? 'ring-1 ring-primary/40 bg-primary/[0.03]' : ''}`} onClick={onClick}>
      {/* Pin button top-right */}
      {onTogglePin && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={`absolute top-1.5 right-1.5 h-6 w-6 z-10 ${isPinned ? 'text-primary' : 'text-muted-foreground/40 opacity-0 group-hover:opacity-100'}`}
              onClick={(e) => { e.stopPropagation(); onTogglePin(proposal.id); }}
              disabled={!isPinned && !canPin}
            >
              {isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {isPinned ? 'Unpin' : canPin ? 'Pin to top' : 'Max 3 pinned'}
          </TooltipContent>
        </Tooltip>
      )}
      {/* Drag handle for pinned grid cards */}
      {isPinned && showDragHandle && (
        <div className="absolute top-1.5 left-1.5 z-10">
          <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50 cursor-grab" />
        </div>
      )}
      <CardContent className="p-3">
        {/* Two-column table-like layout */}
        <div className="flex gap-2">
          {/* Left column: Logo, badges, acronym, title */}
          <div className="flex-1 min-w-0">
            {/* Logo and badges row */}
            <div className="flex items-start gap-2 mb-1">
              {/* Project Logo */}
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                {proposal.logoUrl ? (
                  <img src={proposal.logoUrl} alt={proposal.acronym} className="w-full h-full object-cover" />
                ) : topicIcon ? (
                  topicIcon
                ) : (
                  <FileText className="w-6 h-6 text-primary" />
                )}
              </div>
              <div>
                {/* Row 1: Status badge */}
                <div className="flex items-center gap-1 flex-wrap">
                  <span className={`proposal-badge ${statusInfo.className} flex items-center gap-0.5 text-[9px]`}>
                    <StatusIcon className="w-3 h-3" />
                    {statusInfo.label}
                    {statusInfo.days !== undefined && ` (${statusInfo.days}d)`}
                  </span>
                </div>
                {/* Row 2: Type, Work Programme, Destination */}
                <div className="flex items-center gap-1 flex-wrap mt-1">
                  <span className="proposal-badge bg-white text-foreground border border-foreground text-[9px]">{proposal.type}</span>
                  {workProgramme && (
                    <span className="proposal-badge bg-gray-300 text-gray-700 text-[9px]">
                      {workProgramme.abbreviation}
                    </span>
                  )}
                  {destination && (
                    <span className="proposal-badge bg-gray-200 text-gray-600 text-[9px]" title={destination.fullName}>
                      {destination.abbreviation}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Acronym and title */}
            <h3 className="proposal-title text-sm font-semibold group-hover:text-primary transition-colors">
              {proposal.acronym}
              {proposal.submissionStage === 'stage_1' && <span className="font-normal text-muted-foreground"> (Stage 1 of 2)</span>}
            </h3>
            <p className="text-muted-foreground text-[11px] line-clamp-2">
              {proposal.title}
            </p>
          </div>

          {/* Right column: Action buttons and dates */}
          <div className="flex flex-col gap-1 flex-shrink-0 w-[9rem] items-stretch">
            {proposal.topicUrl && (
              <Button 
                variant="outline" 
                size="sm" 
                className="h-6 w-full px-2 gap-1 text-[10px]"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(proposal.topicUrl, '_blank');
                }}
              >
                Topic
                <ExternalLink className="w-2.5 h-2.5" />
              </Button>
            )}
            <Button size="sm" className="h-6 w-full px-2 gap-1 text-[10px] bg-foreground text-background hover:bg-foreground/90">
              {isDraft ? 'Edit' : 'View'}
              <ArrowRight className="w-2.5 h-2.5" />
            </Button>
            {/* Dates below buttons - left aligned so icons stack */}
            <div className="flex flex-col gap-0.5 mt-3 text-[9px] text-muted-foreground">
              {proposal.deadline && (
                <div className="flex items-center gap-0.5">
                  <Calendar className="w-2.5 h-2.5 text-yellow-600" />
                  <span className="font-bold">Deadline:</span> {format(proposal.deadline, 'dd/MM/yyyy')}
                </div>
              )}
              {/* Show decision date if available */}
              {proposal.decisionDate && (
                <div className="flex items-center gap-0.5">
                  {isDecided ? (
                    proposal.status === 'funded' ? (
                      <CheckCircle2 className="w-2.5 h-2.5 text-green-600" />
                    ) : (
                      <XCircle className="w-2.5 h-2.5 text-red-600" />
                    )
                  ) : (
                    <Clock className="w-2.5 h-2.5 text-muted-foreground" />
                  )}
                  <span className="font-bold">Decision:</span> {format(proposal.decisionDate, 'dd/MM/yyyy')}
                  {proposal.decisionDateIsEstimated && !isDecided && (
                    <span className="inline-flex items-center gap-0.5 ml-1 px-1 py-0 text-[8px] font-medium bg-white text-blue-600 border border-blue-400 rounded">
                      <HelpCircle className="w-2 h-2" />
                      Est.
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
