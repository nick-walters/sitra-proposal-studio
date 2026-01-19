import { Proposal, WORK_PROGRAMMES, DESTINATIONS, PROPOSAL_STATUS_LABELS } from "@/types/proposal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Calendar, ArrowRight, Send, CheckCircle2, XCircle, Clock, ExternalLink } from "lucide-react";
import { format, differenceInDays } from "date-fns";

interface ProposalTableViewProps {
  proposals: Proposal[];
  onProposalClick: (proposal: Proposal) => void;
  topicIcons?: Record<string, React.ReactNode>;
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

export function ProposalTableView({ proposals, onProposalClick, topicIcons }: ProposalTableViewProps) {
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

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-10"></TableHead>
            <TableHead className="font-semibold">Acronym</TableHead>
            <TableHead className="font-semibold">Title</TableHead>
            <TableHead className="font-semibold">Urgency</TableHead>
            <TableHead className="font-semibold">Status</TableHead>
            <TableHead className="font-semibold">Type</TableHead>
            <TableHead className="font-semibold">Work Programme</TableHead>
            <TableHead className="font-semibold">Destination</TableHead>
            <TableHead className="font-semibold">Deadline</TableHead>
            <TableHead className="w-24"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {proposals.map((proposal) => {
            const workProgramme = WORK_PROGRAMMES.find(wp => wp.id === proposal.workProgramme);
            const destination = DESTINATIONS.find(d => d.id === proposal.destination);
            const isDraft = proposal.status === 'draft';
            const urgency = isDraft ? getUrgencyInfo(proposal.deadline) : null;
            const topicIcon = topicIcons?.[proposal.acronym];

            return (
              <TableRow 
                key={proposal.id} 
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onProposalClick(proposal)}
              >
                <TableCell>
                  <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center overflow-hidden">
                    {proposal.logoUrl ? (
                      <img src={proposal.logoUrl} alt={proposal.acronym} className="w-full h-full object-cover" />
                    ) : topicIcon ? (
                      <div className="scale-50">{topicIcon}</div>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="font-semibold">{proposal.acronym}</TableCell>
                <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                  {proposal.title}
                </TableCell>
                <TableCell>
                  {urgency ? (
                    <span className={`proposal-badge ${urgency.className} text-[10px]`}>
                      {urgency.label} ({urgency.days}d)
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className={`proposal-badge ${getStatusColor(proposal.status)} flex items-center gap-1 w-fit text-[10px]`}>
                    {getStatusIcon(proposal.status)}
                    {PROPOSAL_STATUS_LABELS[proposal.status]}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="proposal-badge bg-white text-foreground border border-foreground text-[10px]">
                    {proposal.type}
                  </span>
                </TableCell>
                <TableCell>
                  {workProgramme ? (
                    <span className="proposal-badge bg-gray-300 text-gray-700 text-[10px]">
                      {workProgramme.abbreviation}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {destination ? (
                    <span className="proposal-badge bg-gray-200 text-gray-600 text-[10px]">
                      {destination.abbreviation}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {proposal.deadline ? (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      {format(proposal.deadline, 'MMM d, yyyy')}
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
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
                        <ExternalLink className="w-2.5 h-2.5" />
                      </Button>
                    )}
                    <Button 
                      size="sm" 
                      className="h-6 px-2 gap-1 text-[10px] bg-foreground text-background hover:bg-foreground/90"
                      onClick={(e) => {
                        e.stopPropagation();
                        onProposalClick(proposal);
                      }}
                    >
                      {isDraft ? 'Edit' : 'View'}
                      <ArrowRight className="w-2.5 h-2.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}