import { Proposal, WORK_PROGRAMMES, PROPOSAL_STATUS_LABELS } from "@/types/proposal";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Calendar, FileText, ArrowRight, Send, CheckCircle2, XCircle, Clock, Image } from "lucide-react";
import { format } from "date-fns";

interface ProposalCardProps {
  proposal: Proposal;
  onClick: () => void;
}

export function ProposalCard({ proposal, onClick }: ProposalCardProps) {
  const getBadgeClass = (type: string) => {
    switch (type) {
      case 'RIA':
        return 'proposal-badge proposal-badge-ria';
      case 'IA':
        return 'proposal-badge proposal-badge-ia';
      case 'CSA':
        return 'proposal-badge proposal-badge-csa';
      default:
        return 'proposal-badge bg-muted text-muted-foreground';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-muted text-muted-foreground';
      case 'submitted':
        return 'bg-blue-500/10 text-blue-600';
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
  
  // Get work programme abbreviation
  const workProgramme = WORK_PROGRAMMES.find(wp => wp.id === proposal.workProgramme);

  return (
    <Card className="card-elevated group cursor-pointer hover:border-primary/30" onClick={onClick}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {/* Project Logo or Placeholder */}
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden">
              {proposal.logoUrl ? (
                <img 
                  src={proposal.logoUrl} 
                  alt={proposal.acronym} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <FileText className="w-6 h-6 text-primary" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={getBadgeClass(proposal.type)}>{proposal.type}</span>
                {workProgramme && (
                  <span className="text-xs text-muted-foreground">({workProgramme.abbreviation})</span>
                )}
              </div>
              <h3 className="font-semibold text-lg mt-1 group-hover:text-primary transition-colors">
                {proposal.acronym}
              </h3>
            </div>
          </div>
          <span className={`proposal-badge ${getStatusColor(proposal.status)} flex items-center gap-1`}>
            {getStatusIcon(proposal.status)}
            {PROPOSAL_STATUS_LABELS[proposal.status]}
          </span>
        </div>

        <p className="text-muted-foreground text-sm mb-4 line-clamp-2">
          {proposal.title}
        </p>

        {/* Date Information */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground mb-4">
          <div className="flex items-center gap-1.5">
            <Users className="w-4 h-4" />
            <span>{proposal.members.length} members</span>
          </div>
          
          {/* Deadline */}
          {proposal.deadline && (
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              <span className="font-medium">Deadline:</span>
              <span>{format(proposal.deadline, 'MMM d, yyyy')}</span>
            </div>
          )}

          {/* Date Submitted (for non-drafts) */}
          {!isDraft && proposal.submittedAt && (
            <div className="flex items-center gap-1.5">
              <Send className="w-4 h-4" />
              <span className="font-medium">Submitted:</span>
              <span>{format(proposal.submittedAt, 'MMM d, yyyy')}</span>
            </div>
          )}

          {/* Decision Date (for funded/not funded) */}
          {isDecided && proposal.decisionDate && (
            <div className="flex items-center gap-1.5">
              {proposal.status === 'funded' ? (
                <CheckCircle2 className="w-4 h-4 text-success" />
              ) : (
                <XCircle className="w-4 h-4 text-destructive" />
              )}
              <span className="font-medium">Decision:</span>
              <span>{format(proposal.decisionDate, 'MMM d, yyyy')}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end">
          <Button variant="ghost" size="sm" className="gap-1 group-hover:bg-primary group-hover:text-primary-foreground transition-all">
            {isDraft ? 'Edit' : 'View'}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
