import { Proposal, WORK_PROGRAMMES, DESTINATIONS, PROPOSAL_STATUS_LABELS } from "@/types/proposal";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, FileText, ArrowRight, Send, CheckCircle2, XCircle, Clock, ExternalLink, AlertTriangle, PartyPopper } from "lucide-react";
import { format, differenceInDays } from "date-fns";

interface ProposalCardProps {
  proposal: Proposal;
  onClick: () => void;
  compact?: boolean;
  topicIcon?: React.ReactNode;
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
      icon: PartyPopper,
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

export function ProposalCard({ proposal, onClick, compact = false, topicIcon }: ProposalCardProps) {
  const isDraft = proposal.status === 'draft';
  const isDecided = proposal.status === 'funded' || proposal.status === 'not_funded';
  
  // Get work programme and destination
  const workProgramme = WORK_PROGRAMMES.find(wp => wp.id === proposal.workProgramme);
  const destination = DESTINATIONS.find(d => d.id === proposal.destination);
  
  // Get combined status info
  const statusInfo = getCombinedStatusInfo(proposal);
  const StatusIcon = statusInfo.icon;

  if (compact) {
    return (
      <Card className="card-elevated group cursor-pointer hover:border-primary/30" onClick={onClick}>
        <CardContent className="p-3 flex items-center gap-3">
          {/* Logo */}
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
            {proposal.logoUrl ? (
              <img src={proposal.logoUrl} alt={proposal.acronym} className="w-full h-full object-cover" />
            ) : topicIcon ? (
              topicIcon
            ) : (
              <FileText className="w-5 h-5 text-primary" />
            )}
          </div>
          
          {/* Info */}
          <div className="flex-1 min-w-0">
            {/* Row 1: Combined Status */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-sm">{proposal.acronym}</span>
              <span className={`proposal-badge ${statusInfo.className} flex items-center gap-1 text-[10px]`}>
                <StatusIcon className="w-3 h-3" />
                {statusInfo.label}
                {statusInfo.days !== undefined && ` (${statusInfo.days}d)`}
              </span>
            </div>
            {/* Row 2: Type, Work Programme, Destination */}
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              <span className="proposal-badge bg-white text-foreground border border-foreground text-[10px]">{proposal.type}</span>
              {workProgramme && (
                <span className="proposal-badge bg-gray-300 text-gray-700 text-[10px]">
                  {workProgramme.abbreviation}
                </span>
              )}
              {destination && (
                <span className="proposal-badge bg-gray-200 text-gray-600 text-[10px]">
                  {destination.abbreviation}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{proposal.title}</p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-1 flex-shrink-0">
            {proposal.topicUrl && (
              <Button 
                variant="outline" 
                size="sm" 
                className="h-6 px-2 gap-1 text-[10px]"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(proposal.topicUrl, '_blank');
                }}
              >
                Topic
                <ExternalLink className="w-2.5 h-2.5" />
              </Button>
            )}
            <Button size="sm" className="h-6 px-2 gap-1 text-[10px] bg-foreground text-background hover:bg-foreground/90">
              {isDraft ? 'Edit' : 'View'}
              <ArrowRight className="w-2.5 h-2.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-elevated group cursor-pointer hover:border-primary/30" onClick={onClick}>
      <CardContent className="p-3">
        {/* Row 1: Type, Work Programme, Destination badges */}
        <div className="flex items-center gap-1 flex-wrap mb-2">
          <span className="proposal-badge bg-white text-foreground border border-foreground text-[9px]">{proposal.type}</span>
          {workProgramme && (
            <span className="proposal-badge bg-gray-300 text-gray-700 text-[9px]">
              {workProgramme.abbreviation}
            </span>
          )}
          {destination && (
            <span className="proposal-badge bg-gray-200 text-gray-600 text-[9px]">
              {destination.abbreviation}
            </span>
          )}
        </div>

        {/* Row 2: Logo, acronym/title, and action buttons */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-start gap-2">
            {/* Project Logo */}
            <div className="w-14 h-14 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
              {proposal.logoUrl ? (
                <img src={proposal.logoUrl} alt={proposal.acronym} className="w-full h-full object-cover" />
              ) : topicIcon ? (
                topicIcon
              ) : (
                <FileText className="w-7 h-7 text-primary" />
              )}
            </div>
            <div>
              {/* Combined Status */}
              <div className="flex items-center gap-1 flex-wrap">
                <span className={`proposal-badge ${statusInfo.className} flex items-center gap-0.5 text-[9px]`}>
                  <StatusIcon className="w-3 h-3" />
                  {statusInfo.label}
                  {statusInfo.days !== undefined && ` (${statusInfo.days}d)`}
                </span>
              </div>
              <h3 className="proposal-title text-sm group-hover:text-primary transition-colors mt-0.5">
                {proposal.acronym}
              </h3>
              <p className="text-muted-foreground text-[11px] line-clamp-2">
                {proposal.title}
              </p>
            </div>
          </div>
          
          {/* Action buttons */}
          <div className="flex flex-col gap-1 flex-shrink-0">
            {proposal.topicUrl && (
              <Button 
                variant="outline" 
                size="sm" 
                className="h-6 px-2 gap-1 text-[10px]"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(proposal.topicUrl, '_blank');
                }}
              >
                Topic
                <ExternalLink className="w-2.5 h-2.5" />
              </Button>
            )}
            <Button size="sm" className="h-6 px-2 gap-1 text-[10px] bg-foreground text-background hover:bg-foreground/90">
              {isDraft ? 'Edit' : 'View'}
              <ArrowRight className="w-2.5 h-2.5" />
            </Button>
            {/* Dates below buttons */}
            <div className="flex flex-col gap-0.5 mt-1 text-[9px] text-muted-foreground text-right">
              {proposal.deadline && (
                <div>
                  <span className="font-bold">Deadline:</span> {format(proposal.deadline, 'dd/MM/yyyy')}
                </div>
              )}
              {isDecided && proposal.decisionDate && (
                <div>
                  <span className="font-bold">Decision:</span> {format(proposal.decisionDate, 'dd/MM/yyyy')}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
