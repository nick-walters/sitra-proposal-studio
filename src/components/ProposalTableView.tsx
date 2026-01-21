import { useState } from "react";
import { Proposal, WORK_PROGRAMMES, DESTINATIONS } from "@/types/proposal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Calendar, ArrowRight, Send, CheckCircle2, XCircle, Clock, ExternalLink, AlertTriangle, PartyPopper, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { format, differenceInDays, addMonths } from "date-fns";

// Calculate estimated decision date based on submission stage
// Full proposals: ~5 months after deadline
// Stage 1: ~3 months after deadline
const getEstimatedDecisionDate = (proposal: Proposal): Date | null => {
  if (!proposal.deadline) return null;
  const monthsToAdd = proposal.submissionStage === 'stage_1' ? 3 : 5;
  return addMonths(proposal.deadline, monthsToAdd);
};

interface ProposalTableViewProps {
  proposals: Proposal[];
  onProposalClick: (proposal: Proposal) => void;
  topicIcons?: Record<string, React.ReactNode>;
}

type SortColumn = 'acronym' | 'title' | 'status' | 'type' | 'workProgramme' | 'destination' | 'deadline' | 'decision';
type SortDirection = 'asc' | 'desc' | null;

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
        className: 'bg-red-500/15 text-red-600 border border-red-500/30',
        sortOrder: 1
      };
    } else if (daysLeft <= 56) {
      return {
        label: 'Draft – due soon',
        days: daysLeft,
        icon: Clock,
        className: 'bg-orange-500/15 text-orange-600 border border-orange-500/30',
        sortOrder: 2
      };
    } else {
      return {
        label: 'Draft – on track',
        days: daysLeft,
        icon: CheckCircle2,
        className: 'bg-green-500/15 text-green-600 border border-green-500/30',
        sortOrder: 3
      };
    }
  } else if (status === 'draft') {
    return {
      label: 'Draft',
      icon: Clock,
      className: 'bg-yellow-500/15 text-yellow-600 border border-yellow-500/30',
      sortOrder: 4
    };
  } else if (status === 'submitted') {
    return {
      label: 'Under evaluation',
      icon: Send,
      className: 'bg-orange-500/15 text-orange-600 border border-orange-500/30',
      sortOrder: 5
    };
  } else if (status === 'funded') {
    return {
      label: 'Funded',
      icon: PartyPopper,
      className: 'bg-white text-green-600 border border-green-500/30',
      sortOrder: 6
    };
  } else if (status === 'not_funded') {
    return {
      label: 'Not funded',
      icon: XCircle,
      className: 'bg-white text-red-600 border border-red-500/30',
      sortOrder: 7
    };
  }
  
  return {
    label: status,
    icon: Clock,
    className: 'bg-muted text-muted-foreground',
    sortOrder: 8
  };
};

export function ProposalTableView({ proposals, onProposalClick, topicIcons }: ProposalTableViewProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortColumn(null);
        setSortDirection(null);
      }
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="w-3 h-3 ml-1 opacity-50" />;
    }
    if (sortDirection === 'asc') {
      return <ArrowUp className="w-3 h-3 ml-1" />;
    }
    return <ArrowDown className="w-3 h-3 ml-1" />;
  };

  const sortedProposals = [...proposals].sort((a, b) => {
    if (!sortColumn || !sortDirection) return 0;

    let comparison = 0;

    switch (sortColumn) {
      case 'acronym':
        comparison = a.acronym.localeCompare(b.acronym);
        break;
      case 'title':
        comparison = a.title.localeCompare(b.title);
        break;
      case 'status':
        const statusA = getCombinedStatusInfo(a).sortOrder;
        const statusB = getCombinedStatusInfo(b).sortOrder;
        comparison = statusA - statusB;
        break;
      case 'type':
        comparison = a.type.localeCompare(b.type);
        break;
      case 'workProgramme':
        const wpA = WORK_PROGRAMMES.find(wp => wp.id === a.workProgramme)?.abbreviation || '';
        const wpB = WORK_PROGRAMMES.find(wp => wp.id === b.workProgramme)?.abbreviation || '';
        comparison = wpA.localeCompare(wpB);
        break;
      case 'destination':
        const destA = DESTINATIONS.find(d => d.id === a.destination)?.abbreviation || '';
        const destB = DESTINATIONS.find(d => d.id === b.destination)?.abbreviation || '';
        comparison = destA.localeCompare(destB);
        break;
      case 'deadline':
        const deadlineA = a.deadline?.getTime() || 0;
        const deadlineB = b.deadline?.getTime() || 0;
        comparison = deadlineA - deadlineB;
        break;
      case 'decision':
        const decisionA = a.decisionDate?.getTime() || 0;
        const decisionB = b.decisionDate?.getTime() || 0;
        comparison = decisionA - decisionB;
        break;
    }

    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const SortableHeader = ({ column, children }: { column: SortColumn; children: React.ReactNode }) => (
    <TableHead 
      className="font-semibold cursor-pointer hover:bg-muted/70 select-none"
      onClick={() => handleSort(column)}
    >
      <div className="flex items-center">
        {children}
        {getSortIcon(column)}
      </div>
    </TableHead>
  );

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-10"></TableHead>
            <SortableHeader column="acronym">Acronym</SortableHeader>
            <SortableHeader column="title">Title</SortableHeader>
            <SortableHeader column="status">Status</SortableHeader>
            <SortableHeader column="type">Type</SortableHeader>
            <SortableHeader column="workProgramme">Work Programme</SortableHeader>
            <SortableHeader column="destination">Destination</SortableHeader>
            <SortableHeader column="deadline">Deadline</SortableHeader>
            <SortableHeader column="decision">Decision</SortableHeader>
            <TableHead className="w-24"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedProposals.map((proposal) => {
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
                  <span className={`proposal-badge ${statusInfo.className} flex items-center gap-1 w-fit text-[10px] whitespace-nowrap`}>
                    <StatusIcon className="w-3 h-3 flex-shrink-0" />
                    <span>{statusInfo.label}{statusInfo.days !== undefined && ` (${statusInfo.days}d)`}</span>
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
                  ) : isDraft && proposal.deadline ? (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      ~{format(getEstimatedDecisionDate(proposal)!, 'dd/MM/yyyy')}
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