import { Proposal, WORK_PROGRAMMES, DESTINATIONS } from "@/types/proposal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Calendar, ArrowRight, Send, CheckCircle2, XCircle, Clock, ExternalLink, AlertTriangle, PartyPopper } from "lucide-react";
import { format, differenceInDays } from "date-fns";

interface ProposalTableViewProps {
  proposals: Proposal[];
  onProposalClick: (proposal: Proposal) => void;
  topicIcons?: Record<string, React.ReactNode>;
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

export function ProposalTableView({ proposals, onProposalClick, topicIcons }: ProposalTableViewProps) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-10"></TableHead>
            <TableHead className="font-semibold">Acronym</TableHead>
            <TableHead className="font-semibold">Title</TableHead>
            <TableHead className="font-semibold">Status</TableHead>
            <TableHead className="font-semibold">Type</TableHead>
            <TableHead className="font-semibold">Work Programme</TableHead>
            <TableHead className="font-semibold">Destination</TableHead>
            <TableHead className="font-semibold">Deadline</TableHead>
            <TableHead className="font-semibold">Decision</TableHead>
            <TableHead className="w-24"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {proposals.map((proposal) => {
            const workProgramme = WORK_PROGRAMMES.find(wp => wp.id === proposal.workProgramme);
            const destination = DESTINATIONS.find(d => d.id === proposal.destination);
            const isDraft = proposal.status === 'draft';
            const isDecided = proposal.status === 'funded' || proposal.status === 'not_funded';
            const statusInfo = getCombinedStatusInfo(proposal);
            const StatusIcon = statusInfo.icon;
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
                  <span className={`proposal-badge ${statusInfo.className} flex items-center gap-1 w-fit text-[10px]`}>
                    <StatusIcon className="w-3 h-3" />
                    {statusInfo.label}
                    {statusInfo.days !== undefined && ` (${statusInfo.days}d)`}
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
                      {format(proposal.deadline, 'dd/MM/yyyy')}
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {isDecided && proposal.decisionDate ? (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      {proposal.status === 'funded' ? (
                        <CheckCircle2 className="w-3 h-3 text-green-600" />
                      ) : (
                        <XCircle className="w-3 h-3 text-red-600" />
                      )}
                      {format(proposal.decisionDate, 'dd/MM/yyyy')}
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
