import { useState, useRef } from "react";
import { Proposal, WORK_PROGRAMMES, DESTINATIONS } from "@/types/proposal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Calendar, ArrowRight, Send, CheckCircle2, XCircle, Clock, ExternalLink, AlertTriangle, Trophy, ArrowUpDown, ArrowUp, ArrowDown, HelpCircle, Pin, PinOff, GripVertical } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ProposalTableViewProps {
  proposals: Proposal[];
  onProposalClick: (proposal: Proposal) => void;
  topicIcons?: Record<string, React.ReactNode>;
  pinnedIds?: string[];
  canPin?: boolean;
  onTogglePin?: (id: string) => void;
  onReorderPinned?: (fromIndex: number, toIndex: number) => void;
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
      className: 'bg-yellow-500/15 text-yellow-600 border border-yellow-500/30',
      sortOrder: 5
    };
  } else if (status === 'funded') {
    return {
      label: 'Funded',
      icon: Trophy,
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

export function ProposalTableView({ proposals, onProposalClick, topicIcons, pinnedIds = [], canPin, onTogglePin, onReorderPinned }: ProposalTableViewProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const dragItemRef = useRef<number | null>(null);
  const dragOverRef = useRef<number | null>(null);

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

  const pinnedSet = new Set(pinnedIds);
  const pinnedProposals = pinnedIds.map(id => proposals.find(p => p.id === id)).filter(Boolean) as Proposal[];
  const unpinnedSorted = sortedProposals.filter(p => !pinnedSet.has(p.id));

  const handleDragStart = (index: number) => { dragItemRef.current = index; };
  const handleDragOver = (e: React.DragEvent, index: number) => { e.preventDefault(); dragOverRef.current = index; };
  const handleDragEnd = () => {
    if (dragItemRef.current !== null && dragOverRef.current !== null && dragItemRef.current !== dragOverRef.current && onReorderPinned) {
      onReorderPinned(dragItemRef.current, dragOverRef.current);
    }
    dragItemRef.current = null;
    dragOverRef.current = null;
  };

  const renderRow = (proposal: Proposal, options?: { pinned?: boolean; dragIndex?: number }) => {
    const workProgramme = WORK_PROGRAMMES.find(wp => wp.id === proposal.workProgramme);
    const destination = DESTINATIONS.find(d => d.id === proposal.destination);
    const isDraft = proposal.status === 'draft';
    const isDecided = proposal.status === 'funded' || proposal.status === 'not_funded';
    const statusInfo = getCombinedStatusInfo(proposal);
    const StatusIcon = statusInfo.icon;
    const topicIcon = topicIcons?.[proposal.acronym];
    const pinned = options?.pinned ?? false;

    return (
      <TableRow
        key={proposal.id}
        className={`cursor-pointer hover:bg-muted/50 group ${pinned ? 'bg-primary/[0.03]' : ''}`}
        onClick={() => onProposalClick(proposal)}
        draggable={pinned && pinnedProposals.length > 1}
        onDragStart={options?.dragIndex !== undefined ? () => handleDragStart(options.dragIndex!) : undefined}
        onDragOver={options?.dragIndex !== undefined ? (e) => handleDragOver(e, options.dragIndex!) : undefined}
        onDragEnd={pinned ? handleDragEnd : undefined}
      >
        <TableCell>
          <div className="flex items-center gap-1">
            {pinned && pinnedProposals.length > 1 && (
              <GripVertical className="w-3 h-3 text-muted-foreground/50 cursor-grab flex-shrink-0" />
            )}
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center overflow-hidden">
              {proposal.logoUrl ? (
                <img src={proposal.logoUrl} alt={proposal.acronym} className="w-full h-full object-cover" />
              ) : topicIcon ? (
                <div className="scale-50">{topicIcon}</div>
              ) : null}
            </div>
          </div>
        </TableCell>
        <TableCell className="font-semibold">
          {proposal.acronym}
          {proposal.submissionStage === 'stage_1' && <span className="font-normal text-muted-foreground"> (Stage 1 of 2)</span>}
        </TableCell>
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
              <Calendar className="w-3 h-3 text-yellow-600" />
              {format(proposal.deadline, 'dd/MM/yyyy')}
            </div>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </TableCell>
        <TableCell>
          {proposal.decisionDate ? (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {isDecided ? (
                proposal.status === 'funded' ? (
                  <CheckCircle2 className="w-3 h-3 text-green-600" />
                ) : (
                  <XCircle className="w-3 h-3 text-red-600" />
                )
              ) : (
                <Clock className="w-3 h-3 text-yellow-500" />
              )}
              {proposal.decisionDateIsEstimated && !isDecided ? 'Est. ' : ''}{format(proposal.decisionDate, 'dd/MM/yyyy')}
            </div>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            {onTogglePin && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-6 w-6 ${pinned ? 'text-primary' : 'text-muted-foreground/40 opacity-0 group-hover:opacity-100'}`}
                    onClick={(e) => { e.stopPropagation(); onTogglePin(proposal.id); }}
                    disabled={!pinned && !canPin}
                  >
                    {pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {pinned ? 'Unpin' : canPin ? 'Pin to top' : 'Max 3 pinned'}
                </TooltipContent>
              </Tooltip>
            )}
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
  };

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
            <TableHead className="w-28"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pinnedProposals.map((proposal, index) => renderRow(proposal, { pinned: true, dragIndex: index }))}
          {pinnedProposals.length > 0 && unpinnedSorted.length > 0 && (
            <TableRow>
              <TableCell colSpan={10} className="p-0 h-0.5 bg-border" />
            </TableRow>
          )}
          {unpinnedSorted.map((proposal) => renderRow(proposal))}
        </TableBody>
      </Table>
    </div>
  );
}