import { Proposal, WORK_PROGRAMMES, DESTINATIONS } from "@/types/proposal";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, ArrowRight, Send, CheckCircle2, XCircle, Clock, ExternalLink, AlertTriangle, PartyPopper, Calendar } from "lucide-react";
import { format, differenceInDays } from "date-fns";

interface ProposalKanbanViewProps {
  proposals: Proposal[];
  onProposalClick: (proposal: Proposal) => void;
  topicIcons?: Record<string, React.ReactNode>;
}

type KanbanColumnType = 'drafts' | 'submitted';

const KANBAN_COLUMNS: { type: KanbanColumnType; label: string; color: string; bgColor: string; icon: React.ElementType }[] = [
  { type: 'drafts', label: 'Proposal drafts', color: 'text-yellow-600', bgColor: 'bg-yellow-500/10', icon: Clock },
  { type: 'submitted', label: 'Submitted proposals', color: 'text-blue-600', bgColor: 'bg-blue-500/10', icon: Send },
];

// Get combined status/urgency info for drafts
const getDraftStatusInfo = (deadline: Date | undefined) => {
  if (!deadline) return { sortOrder: 4 }; // No deadline = lowest priority
  
  const daysLeft = differenceInDays(deadline, new Date());
  
  if (daysLeft <= 28) {
    return {
      label: 'Draft – critical',
      days: daysLeft,
      icon: AlertTriangle,
      className: 'bg-red-500/15 text-red-600 border border-red-500/30',
      sortOrder: 1 // Critical at top
    };
  } else if (daysLeft <= 56) {
    return {
      label: 'Draft – due soon',
      days: daysLeft,
      icon: Clock,
      className: 'bg-orange-500/15 text-orange-600 border border-orange-500/30',
      sortOrder: 2 // Due soon in middle
    };
  } else {
    return {
      label: 'Draft – on track',
      days: daysLeft,
      icon: CheckCircle2,
      className: 'bg-green-500/15 text-green-600 border border-green-500/30',
      sortOrder: 3 // On track at bottom
    };
  }
};

// Get status info for submitted proposals
const getSubmittedStatusInfo = (status: string) => {
  if (status === 'submitted') {
    return {
      label: 'Under evaluation',
      icon: Send,
      className: 'bg-orange-500/15 text-orange-600 border border-orange-500/30',
      sortOrder: 1 // Under evaluation at top
    };
  } else if (status === 'funded') {
    return {
      label: 'Funded',
      icon: PartyPopper,
      className: 'bg-white text-green-600 border border-green-500/30',
      sortOrder: 2 // Funded in middle
    };
  } else if (status === 'not_funded') {
    return {
      label: 'Not funded',
      icon: XCircle,
      className: 'bg-white text-red-600 border border-red-500/30',
      sortOrder: 3 // Not funded at bottom
    };
  }
  return { sortOrder: 4 };
};

export function ProposalKanbanView({ proposals, onProposalClick, topicIcons }: ProposalKanbanViewProps) {
  // Get drafts grouped by urgency
  const getDraftsByUrgency = (urgency: 'critical' | 'due_soon' | 'on_track') => {
    return proposals
      .filter(p => {
        if (p.status !== 'draft') return false;
        const status = getDraftStatusInfo(p.deadline);
        if (urgency === 'critical') return status.sortOrder === 1;
        if (urgency === 'due_soon') return status.sortOrder === 2;
        if (urgency === 'on_track') return status.sortOrder === 3 || status.sortOrder === 4;
        return false;
      })
      .sort((a, b) => {
        const dateA = a.deadline?.getTime() || Infinity;
        const dateB = b.deadline?.getTime() || Infinity;
        return dateA - dateB;
      });
  };

  // Get submitted proposals grouped by status
  const getSubmittedByStatus = (status: 'submitted' | 'funded' | 'not_funded') => {
    return proposals
      .filter(p => p.status === status)
      .sort((a, b) => {
        if (status === 'submitted') {
          const dateA = a.deadline?.getTime() || 0;
          const dateB = b.deadline?.getTime() || 0;
          return dateB - dateA;
        }
        const dateA = a.decisionDate?.getTime() || 0;
        const dateB = b.decisionDate?.getTime() || 0;
        return dateB - dateA;
      });
  };

  const draftSections = [
    { key: 'critical', label: 'Critical', proposals: getDraftsByUrgency('critical'), icon: AlertTriangle, color: 'text-red-600', bgColor: 'bg-red-500/10' },
    { key: 'due_soon', label: 'Due soon', proposals: getDraftsByUrgency('due_soon'), icon: Clock, color: 'text-orange-600', bgColor: 'bg-orange-500/10' },
    { key: 'on_track', label: 'On track', proposals: getDraftsByUrgency('on_track'), icon: CheckCircle2, color: 'text-green-600', bgColor: 'bg-green-500/10' },
  ];

  const submittedSections = [
    { key: 'submitted', label: 'Under evaluation', proposals: getSubmittedByStatus('submitted'), icon: Send, color: 'text-orange-600', bgColor: 'bg-orange-500/10' },
    { key: 'funded', label: 'Funded', proposals: getSubmittedByStatus('funded'), icon: PartyPopper, color: 'text-green-600', bgColor: 'bg-green-500/10' },
    { key: 'not_funded', label: 'Not funded', proposals: getSubmittedByStatus('not_funded'), icon: XCircle, color: 'text-red-600', bgColor: 'bg-red-500/10' },
  ];

  const renderProposalCard = (proposal: Proposal) => {
    const workProgramme = WORK_PROGRAMMES.find(wp => wp.id === proposal.workProgramme);
    const destination = DESTINATIONS.find(d => d.id === proposal.destination);
    const isDraft = proposal.status === 'draft';
    const isDecided = proposal.status === 'funded' || proposal.status === 'not_funded';
    const topicIcon = topicIcons?.[proposal.acronym];

    return (
      <Card 
        key={proposal.id}
        className="cursor-pointer hover:border-primary/30 transition-colors"
        onClick={() => onProposalClick(proposal)}
      >
        <CardContent className="p-3">
          {/* Row 1: Type, Work Programme, Destination badges */}
          <div className="flex flex-wrap gap-1 mb-2">
            <span className="proposal-badge bg-white text-foreground border border-foreground text-[9px]">
              {proposal.type}
            </span>
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
          <div className="flex items-start gap-2">
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
              {proposal.logoUrl ? (
                <img src={proposal.logoUrl} alt={proposal.acronym} className="w-full h-full object-cover" />
              ) : topicIcon ? (
                <div className="scale-50">{topicIcon}</div>
              ) : (
                <FileText className="w-4 h-4 text-primary" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-sm">{proposal.acronym}</h4>
              <p className="text-xs text-muted-foreground truncate">{proposal.title}</p>
            </div>
            
            {/* Action buttons */}
            <div className="flex flex-col gap-1 flex-shrink-0">
              {proposal.topicUrl && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-5 px-1.5 text-[9px] gap-0.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(proposal.topicUrl, '_blank');
                  }}
                >
                  Topic
                  <ExternalLink className="w-2 h-2" />
                </Button>
              )}
              <Button 
                size="sm" 
                className="h-5 px-2 text-[9px] bg-foreground text-background hover:bg-foreground/90"
              >
                {isDraft ? 'Edit' : 'View'}
                <ArrowRight className="w-2 h-2 ml-0.5" />
              </Button>
              {/* Dates below buttons */}
              <div className="flex flex-col gap-0.5 mt-0.5 text-[9px] text-muted-foreground text-right">
                {proposal.deadline && (
                  <div className="flex items-center gap-0.5 justify-end">
                    <Calendar className="w-2.5 h-2.5 text-yellow-600" />
                    <span className="font-bold">Deadline:</span> {format(proposal.deadline, 'dd/MM/yyyy')}
                  </div>
                )}
                {isDecided && proposal.decisionDate && (
                  <div className="flex items-center gap-0.5 justify-end">
                    {proposal.status === 'funded' ? (
                      <CheckCircle2 className="w-2.5 h-2.5 text-green-600" />
                    ) : (
                      <XCircle className="w-2.5 h-2.5 text-red-600" />
                    )}
                    <span className="font-bold">Decision:</span> {format(proposal.decisionDate, 'dd/MM/yyyy')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderSection = (section: { key: string; label: string; proposals: Proposal[]; icon: React.ElementType; color: string; bgColor: string }) => {
    const SectionIcon = section.icon;
    return (
      <div key={section.key} className="mb-4">
        {/* Minor Header */}
        <div className={`${section.bgColor} rounded-lg px-3 py-2 mb-2 flex items-center gap-2`}>
          <SectionIcon className={`w-3.5 h-3.5 ${section.color}`} />
          <span className={`text-sm font-medium ${section.color}`}>{section.label}</span>
          <span className={`ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-medium ${section.bgColor} ${section.color}`}>
            {section.proposals.length}
          </span>
        </div>
        {/* Cards */}
        <div className="space-y-2">
          {section.proposals.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground text-xs">
              No proposals
            </div>
          ) : (
            section.proposals.map(renderProposalCard)
          )}
        </div>
      </div>
    );
  };

  const totalDrafts = draftSections.reduce((sum, s) => sum + s.proposals.length, 0);
  const totalSubmitted = submittedSections.reduce((sum, s) => sum + s.proposals.length, 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Proposal Drafts Column */}
      <div className="flex flex-col">
        {/* Major Header */}
        <div className="bg-yellow-500/10 rounded-t-lg p-3 border border-b-0">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-yellow-600" />
            <h3 className="font-semibold text-yellow-600">Proposal drafts</h3>
            <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-600">
              {totalDrafts}
            </span>
          </div>
        </div>
        
        {/* Column Content */}
        <div className="border border-t-0 rounded-b-lg flex-1 min-h-[400px] bg-muted/30">
          <ScrollArea className="h-[600px]">
            <div className="p-3">
              {draftSections.map(renderSection)}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Submitted Proposals Column */}
      <div className="flex flex-col">
        {/* Major Header */}
        <div className="bg-blue-500/10 rounded-t-lg p-3 border border-b-0">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-blue-600" />
            <h3 className="font-semibold text-blue-600">Submitted proposals</h3>
            <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600">
              {totalSubmitted}
            </span>
          </div>
        </div>
        
        {/* Column Content */}
        <div className="border border-t-0 rounded-b-lg flex-1 min-h-[400px] bg-muted/30">
          <ScrollArea className="h-[600px]">
            <div className="p-3">
              {submittedSections.map(renderSection)}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}