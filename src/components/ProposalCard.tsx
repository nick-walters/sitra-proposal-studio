import { Proposal } from "@/types/proposal";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Calendar, FileText, ArrowRight } from "lucide-react";
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
      case 'in-review':
        return 'bg-warning/10 text-warning';
      case 'submitted':
        return 'bg-success/10 text-success';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Card className="card-elevated group cursor-pointer hover:border-primary/30" onClick={onClick}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <div>
              <span className={getBadgeClass(proposal.type)}>{proposal.type}</span>
              <h3 className="font-semibold text-lg mt-1 group-hover:text-primary transition-colors">
                {proposal.acronym}
              </h3>
            </div>
          </div>
          <span className={`proposal-badge ${getStatusColor(proposal.status)}`}>
            {proposal.status.replace('-', ' ')}
          </span>
        </div>

        <p className="text-muted-foreground text-sm mb-4 line-clamp-2">
          {proposal.title}
        </p>

        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
          <div className="flex items-center gap-1.5">
            <Users className="w-4 h-4" />
            <span>{proposal.members.length} members</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />
            <span>{format(proposal.updatedAt, 'MMM d, yyyy')}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            {proposal.members.slice(0, 4).map((member, idx) => (
              <div
                key={member.user.id}
                className="w-8 h-8 rounded-full bg-primary/10 border-2 border-card flex items-center justify-center"
                style={{ zIndex: 4 - idx }}
              >
                <span className="text-xs font-medium text-primary">
                  {member.user.name.split(' ').map(n => n[0]).join('')}
                </span>
              </div>
            ))}
            {proposal.members.length > 4 && (
              <div className="w-8 h-8 rounded-full bg-muted border-2 border-card flex items-center justify-center">
                <span className="text-xs font-medium text-muted-foreground">
                  +{proposal.members.length - 4}
                </span>
              </div>
            )}
          </div>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" className="gap-1 group-hover:bg-primary group-hover:text-primary-foreground transition-all">
            Open
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
