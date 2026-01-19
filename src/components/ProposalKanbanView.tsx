import { Proposal, WORK_PROGRAMMES, DESTINATIONS, PROPOSAL_STATUS_LABELS, ProposalStatus } from "@/types/proposal";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, ArrowRight, Send, CheckCircle2, XCircle, Clock, ExternalLink, Calendar } from "lucide-react";
import { format, differenceInDays } from "date-fns";

interface ProposalKanbanViewProps {
  proposals: Proposal[];
  onProposalClick: (proposal: Proposal) => void;
  topicIcons?: Record<string, React.ReactNode>;
}

const KANBAN_COLUMNS: { status: ProposalStatus; label: string; color: string; bgColor: string }[] = [
  { status: 'draft', label: 'Draft', color: 'text-yellow-600', bgColor: 'bg-yellow-500/10' },
  { status: 'submitted', label: 'Under Evaluation', color: 'text-orange-600', bgColor: 'bg-orange-500/10' },
  { status: 'funded', label: 'Funded', color: 'text-green-600', bgColor: 'bg-green-500/10' },
  { status: 'not_funded', label: 'Not Funded', color: 'text-red-600', bgColor: 'bg-red-500/10' },
];

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
      label: 'Due soon',
      days: daysLeft,
      className: 'bg-orange-500/15 text-orange-600 border-orange-500/30'
    };
  } else {
    return {
      label: 'On track',
      days: daysLeft,
      className: 'bg-green-500/15 text-green-600 border-green-500/30'
    };
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'draft':
      return <Clock className="w-4 h-4" />;
    case 'submitted':
      return <Send className="w-4 h-4" />;
    case 'funded':
      return <CheckCircle2 className="w-4 h-4" />;
    case 'not_funded':
      return <XCircle className="w-4 h-4" />;
    default:
      return null;
  }
};

export function ProposalKanbanView({ proposals, onProposalClick, topicIcons }: ProposalKanbanViewProps) {
  const getProposalsByStatus = (status: ProposalStatus) => {
    return proposals.filter(p => p.status === status);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {KANBAN_COLUMNS.map((column) => {
        const columnProposals = getProposalsByStatus(column.status);
        
        return (
          <div key={column.status} className="flex flex-col">
            {/* Column Header */}
            <div className={`${column.bgColor} rounded-t-lg p-3 border border-b-0`}>
              <div className="flex items-center gap-2">
                <span className={column.color}>{getStatusIcon(column.status)}</span>
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
                      const urgency = isDraft ? getUrgencyInfo(proposal.deadline) : null;
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
                              {urgency && (
                                <span className={`proposal-badge ${urgency.className} text-[9px]`}>
                                  {urgency.label} ({urgency.days}d)
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

                            {/* Deadline and actions */}
                            <div className="flex items-center justify-between">
                              {proposal.deadline && (
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <Calendar className="w-2.5 h-2.5" />
                                  {format(proposal.deadline, 'MMM d')}
                                </div>
                              )}
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