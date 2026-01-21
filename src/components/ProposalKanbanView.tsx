import { Proposal, WORK_PROGRAMMES, DESTINATIONS } from "@/types/proposal";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, ArrowRight, Send, CheckCircle2, XCircle, Clock, ExternalLink, AlertTriangle, PartyPopper } from "lucide-react";
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
  const getProposalsByColumnType = (type: KanbanColumnType) => {
    if (type === 'drafts') {
      // Get drafts, sort by urgency: Critical -> Due soon -> On track
      return proposals
        .filter(p => p.status === 'draft')
        .sort((a, b) => {
          const statusA = getDraftStatusInfo(a.deadline);
          const statusB = getDraftStatusInfo(b.deadline);
          if (statusA.sortOrder !== statusB.sortOrder) {
            return statusA.sortOrder - statusB.sortOrder;
          }
          // Within same urgency, sort by deadline (earliest first)
          const dateA = a.deadline?.getTime() || Infinity;
          const dateB = b.deadline?.getTime() || Infinity;
          return dateA - dateB;
        });
    }
    if (type === 'submitted') {
      // Get submitted, funded, not_funded - sort: Under evaluation -> Funded -> Not funded
      return proposals
        .filter(p => p.status === 'submitted' || p.status === 'funded' || p.status === 'not_funded')
        .sort((a, b) => {
          const statusA = getSubmittedStatusInfo(a.status);
          const statusB = getSubmittedStatusInfo(b.status);
          if (statusA.sortOrder !== statusB.sortOrder) {
            return statusA.sortOrder - statusB.sortOrder;
          }
          // Within same status, sort by decision date (latest first) for decided, or deadline for submitted
          if (a.status === 'submitted' && b.status === 'submitted') {
            const dateA = a.deadline?.getTime() || 0;
            const dateB = b.deadline?.getTime() || 0;
            return dateB - dateA;
          }
          const dateA = a.decisionDate?.getTime() || 0;
          const dateB = b.decisionDate?.getTime() || 0;
          return dateB - dateA;
        });
    }
    return [];
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {KANBAN_COLUMNS.map((column) => {
        const columnProposals = getProposalsByColumnType(column.type);
        const ColumnIcon = column.icon;
        
        return (
          <div key={column.type} className="flex flex-col">
            {/* Column Header */}
            <div className={`${column.bgColor} rounded-t-lg p-3 border border-b-0`}>
              <div className="flex items-center gap-2">
                <ColumnIcon className={`w-4 h-4 ${column.color}`} />
                <h3 className={`font-semibold ${column.color}`}>{column.label}</h3>
                <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium ${column.bgColor} ${column.color}`}>
                  {columnProposals.length}
                </span>
              </div>
            </div>
            
            {/* Column Content */}
            <div className="border border-t-0 rounded-b-lg flex-1 min-h-[400px] bg-muted/30">
              <ScrollArea className="h-[500px]">
                <div className="p-2 space-y-2">
                  {columnProposals.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      No proposals
                    </div>
                  ) : (
                    columnProposals.map((proposal) => {
                      const workProgramme = WORK_PROGRAMMES.find(wp => wp.id === proposal.workProgramme);
                      const destination = DESTINATIONS.find(d => d.id === proposal.destination);
                      const isDraft = proposal.status === 'draft';
                      const isDecided = proposal.status === 'funded' || proposal.status === 'not_funded';
                      const isUnderEvaluation = proposal.status === 'submitted';
                      const draftStatus = isDraft ? getDraftStatusInfo(proposal.deadline) : null;
                      const submittedStatus = !isDraft ? getSubmittedStatusInfo(proposal.status) : null;
                      const topicIcon = topicIcons?.[proposal.acronym];

                      return (
                        <Card 
                          key={proposal.id}
                          className="cursor-pointer hover:border-primary/30 transition-colors"
                          onClick={() => onProposalClick(proposal)}
                        >
                          <CardContent className="p-3">
                            {/* Header with logo and acronym */}
                            <div className="flex items-start gap-2 mb-2">
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
                            </div>

                            {/* Badges */}
                            <div className="flex flex-wrap gap-1 mb-2">
                              {draftStatus && 'label' in draftStatus && (
                                <span className={`proposal-badge ${draftStatus.className} flex items-center gap-0.5 text-[9px]`}>
                                  {(() => {
                                    const StatusIcon = draftStatus.icon;
                                    return <StatusIcon className="w-2.5 h-2.5" />;
                                  })()}
                                  {draftStatus.label} ({draftStatus.days}d)
                                </span>
                              )}
                              {submittedStatus && 'label' in submittedStatus && (
                                <span className={`proposal-badge ${submittedStatus.className} flex items-center gap-0.5 text-[9px]`}>
                                  {(() => {
                                    const StatusIcon = submittedStatus.icon;
                                    return <StatusIcon className="w-2.5 h-2.5" />;
                                  })()}
                                  {submittedStatus.label}
                                </span>
                              )}
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

                            <div className="flex items-center justify-between">
                              <div className="flex flex-col gap-0.5">
                                {proposal.deadline && (
                                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                    <span className="font-bold">Deadline:</span>
                                    {format(proposal.deadline, 'dd/MM/yyyy')}
                                  </div>
                                )}
                                {isDecided && proposal.decisionDate && (
                                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                    <span className="font-bold">Decision:</span>
                                    {format(proposal.decisionDate, 'dd/MM/yyyy')}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-1 ml-auto">
                                {proposal.topicUrl && (
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="h-5 px-1.5 text-[9px]"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      window.open(proposal.topicUrl, '_blank');
                                    }}
                                  >
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
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        );
      })}
    </div>
  );
}