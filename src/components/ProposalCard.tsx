import { Proposal, WORK_PROGRAMMES, DESTINATIONS, PROPOSAL_STATUS_LABELS } from "@/types/proposal";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Calendar, FileText, ArrowRight, Send, CheckCircle2, XCircle, Clock, ExternalLink } from "lucide-react";
import { format, differenceInDays } from "date-fns";

interface ProposalCardProps {
  proposal: Proposal;
  onClick: () => void;
  compact?: boolean;
}

const getUrgencyInfo = (deadline: Date | undefined) => {
  if (!deadline) return null;
  
  const daysLeft = differenceInDays(deadline, new Date());
  
  if (daysLeft <= 28) {
    return {
      label: 'Critical!',
      days: daysLeft,
      className: 'bg-red-500/15 text-red-600 border-red-500/30'
    };
  } else if (daysLeft <= 56) {
    return {
      label: 'Priority',
      days: daysLeft,
      className: 'bg-orange-500/15 text-orange-600 border-orange-500/30'
    };
  } else if (daysLeft <= 112) {
    return {
      label: 'Upcoming',
      days: daysLeft,
      className: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30'
    };
  } else {
    return {
      label: 'On Track',
      days: daysLeft,
      className: 'bg-green-500/15 text-green-600 border-green-500/30'
    };
  }
};

export function ProposalCard({ proposal, onClick, compact = false }: ProposalCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-yellow-500/15 text-yellow-600';
      case 'submitted':
        return 'bg-orange-500/15 text-orange-600';
      case 'funded':
        return 'bg-success/10 text-success';
      case 'not_funded':
        return 'bg-destructive/10 text-destructive';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft':
        return <Clock className="w-3 h-3" />;
      case 'submitted':
        return <Send className="w-3 h-3" />;
      case 'funded':
        return <CheckCircle2 className="w-3 h-3" />;
      case 'not_funded':
        return <XCircle className="w-3 h-3" />;
      default:
        return null;
    }
  };

  const isDraft = proposal.status === 'draft';
  const isDecided = proposal.status === 'funded' || proposal.status === 'not_funded';
  
  // Get work programme and destination
  const workProgramme = WORK_PROGRAMMES.find(wp => wp.id === proposal.workProgramme);
  const destination = DESTINATIONS.find(d => d.id === proposal.destination);
  
  // Get urgency for drafts only
  const urgency = isDraft ? getUrgencyInfo(proposal.deadline) : null;

  if (compact) {
    return (
      <Card className="card-elevated group cursor-pointer hover:border-primary/30" onClick={onClick}>
        <CardContent className="p-3 flex items-center gap-3">
          {/* Logo */}
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
            {proposal.logoUrl ? (
              <img src={proposal.logoUrl} alt={proposal.acronym} className="w-full h-full object-cover" />
            ) : (
              <FileText className="w-5 h-5 text-primary" />
            )}
          </div>
          
          {/* Info */}
          <div className="flex-1 min-w-0">
            {/* Row 1: Urgency and Status */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-sm">{proposal.acronym}</span>
              {urgency && (
                <span className={`proposal-badge ${urgency.className} text-[10px]`}>
                  {urgency.label} ({urgency.days}d)
                </span>
              )}
              <span className={`proposal-badge ${getStatusColor(proposal.status)} flex items-center gap-1 text-[10px]`}>
                {getStatusIcon(proposal.status)}
                {PROPOSAL_STATUS_LABELS[proposal.status]}
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
        {/* Header row with logo, badges, status, and action */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-start gap-2">
            {/* Project Logo - 80% larger to match badge rows + acronym height */}
            <div className="w-14 h-14 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
              {proposal.logoUrl ? (
                <img src={proposal.logoUrl} alt={proposal.acronym} className="w-full h-full object-cover" />
              ) : (
                <FileText className="w-7 h-7 text-primary" />
              )}
            </div>
            <div>
              {/* Row 1: Urgency and Status */}
              <div className="flex items-center gap-1 flex-wrap">
                {urgency && (
                  <span className={`proposal-badge ${urgency.className} text-[9px]`}>
                    {urgency.label} ({urgency.days}d)
                  </span>
                )}
                <span className={`proposal-badge ${getStatusColor(proposal.status)} flex items-center gap-0.5 text-[9px]`}>
                  {getStatusIcon(proposal.status)}
                  {PROPOSAL_STATUS_LABELS[proposal.status]}
                </span>
              </div>
              {/* Row 2: Type, Work Programme, Destination */}
              <div className="flex items-center gap-1 flex-wrap mt-0.5">
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
              <h3 className="proposal-title text-sm group-hover:text-primary transition-colors mt-0.5">
                {proposal.acronym}
              </h3>
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
          </div>
        </div>

        <p className="text-muted-foreground text-[11px] mb-2 line-clamp-2">
          {proposal.title}
        </p>

        {/* Compact meta info */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <Users className="w-2.5 h-2.5" />
            <span>{proposal.members.length}</span>
          </div>
          
          {proposal.deadline && (
            <div className="flex items-center gap-1">
              <Calendar className="w-2.5 h-2.5" />
              <span>{format(proposal.deadline, 'MMM d, yyyy')}</span>
            </div>
          )}

          {isDecided && proposal.decisionDate && (
            <div className="flex items-center gap-1">
              {proposal.status === 'funded' ? (
                <CheckCircle2 className="w-2.5 h-2.5 text-success" />
              ) : (
                <XCircle className="w-2.5 h-2.5 text-destructive" />
              )}
              <span>{format(proposal.decisionDate, 'MMM d')}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
