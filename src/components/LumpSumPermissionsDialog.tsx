import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useLumpSumBudgetAccess } from '@/hooks/useLumpSumBudgetAccess';

type Participant = { id: string; participant_number?: number | null; organisation_short_name?: string | null; organisation_name?: string | null };

const COORDINATOR_ROLES = new Set(['coordinator', 'admin', 'owner']);

export function LumpSumPermissionsDialog({
  proposalId,
  participant,
  open,
  onOpenChange,
}: {
  proposalId: string;
  participant: Participant;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const access = useLumpSumBudgetAccess(proposalId);
  const members = access.data?.members ?? [];
  const overrides = access.data?.overrides ?? [];
  const participantMembers = (access.data?.participantMembers ?? []).filter(row => row.participant_id === participant.id);

  const label = `${participant.participant_number ?? ''}. ${participant.organisation_short_name || participant.organisation_name || ''}`.trim();

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Budget permissions — {label}</DialogTitle>
        <DialogDescription>
          Everyone with proposal access can already view every participant’s budget; this dialog controls editing only.
        </DialogDescription>
      </DialogHeader>
      <div className="max-h-[60vh] space-y-1 overflow-y-auto">
        {members.length === 0 && <p className="text-sm text-muted-foreground">No users have a role on this proposal.</p>}
        {members.map(member => {
          const isCoordinator = COORDINATOR_ROLES.has(member.role);
          const override = overrides.find(row => row.participant_id === participant.id && row.user_id === member.user_id);
          const listedInA2 = participantMembers.some(row =>
            (row.user_id && row.user_id === member.user_id)
            || (row.email && member.email && row.email.toLowerCase() === member.email.toLowerCase()));
          const canEdit = isCoordinator ? true : override ? override.can_edit : listedInA2;
          const reason = isCoordinator
            ? 'Coordinator'
            : override
              ? override.can_edit ? 'Granted by coordinator' : 'Removed by coordinator'
              : listedInA2 ? 'Listed in A2 for this participant' : 'No A2 listing';

          return <div key={member.user_id} className="flex items-center justify-between gap-3 border-b border-border/60 py-2 text-sm">
            <div className="min-w-0">
              <div className="truncate font-medium">{member.full_name || member.email || member.user_id}</div>
              <div className="truncate text-xs text-muted-foreground">{member.email} · {member.role}</div>
              <div className="text-[11px] text-muted-foreground">{reason}</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className={`text-xs font-medium ${canEdit ? 'text-green-600' : 'text-muted-foreground'}`}>{canEdit ? 'Can edit' : 'View only'}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={isCoordinator}
                onClick={() => access.setOverride(participant.id, member.user_id, !canEdit)}
              >
                {canEdit ? 'Remove edit rights' : 'Grant edit rights'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                disabled={isCoordinator || !override}
                onClick={() => access.clearOverride(participant.id, member.user_id)}
              >
                Reset to default
              </Button>
            </div>
          </div>;
        })}
      </div>
    </DialogContent>
  </Dialog>;
}
