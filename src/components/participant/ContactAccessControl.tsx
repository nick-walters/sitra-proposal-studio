import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { UserPlus, ShieldCheck, Loader2, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface ContactAccessControlProps {
  email: string | null | undefined;
  name: string | null | undefined;
  accessRequested: boolean;
  accessGranted: boolean;
  accessGrantedRole: string | null | undefined;
  canFlag: boolean;
  canGrant: boolean;
  proposalId: string;
  proposalAcronym: string;
  onFlagAccess: (requested: boolean) => void;
  onAccessGranted: (role: string) => void;
}

export function ContactAccessControl({
  email,
  name,
  accessRequested,
  accessGranted,
  accessGrantedRole,
  canFlag,
  canGrant,
  proposalId,
  proposalAcronym,
  onFlagAccess,
  onAccessGranted,
}: ContactAccessControlProps) {
  const { user } = useAuth();
  const [granting, setGranting] = useState(false);
  const [grantPopoverOpen, setGrantPopoverOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>('editor');

  // Already granted – show badge
  if (accessGranted && accessGrantedRole) {
    return (
      <Badge variant="outline" className="gap-1 text-xs capitalize">
        <Check className="w-3 h-3" />
        Invited as {accessGrantedRole}
      </Badge>
    );
  }

  const handleGrantAccess = async () => {
    if (!email) {
      toast.error('Contact person must have an email to grant access');
      return;
    }

    setGranting(true);
    try {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email.toLowerCase())
        .maybeSingle();

      if (existingProfile) {
        const { data: existingRole } = await supabase
          .from('user_roles')
          .select('id')
          .eq('user_id', existingProfile.id)
          .eq('proposal_id', proposalId)
          .maybeSingle();

        if (existingRole) {
          toast.info(`${name || email} already has access to this proposal`);
        } else {
          const { error } = await supabase.from('user_roles').insert([{
            user_id: existingProfile.id,
            proposal_id: proposalId,
            role: selectedRole as 'coordinator' | 'editor' | 'viewer',
          }]);
          if (error) throw error;
          toast.success(`${name || email} granted ${selectedRole} access`);
        }
      } else {
        const { data: inviteResult, error: inviteError } = await supabase.functions.invoke('invite-user', {
          body: {
            email: email.toLowerCase(),
            fullName: name || email.split('@')[0],
            proposalId,
            proposalAcronym,
          },
        });

        if (inviteError) throw inviteError;

        if (inviteResult?.userId) {
          await supabase.from('user_roles').insert([{
            user_id: inviteResult.userId,
            proposal_id: proposalId,
            role: selectedRole as 'coordinator' | 'editor' | 'viewer',
          }]);
        }

        toast.success(`Invitation sent to ${email}`);
      }

      onAccessGranted(selectedRole);
      setGrantPopoverOpen(false);
    } catch (error: any) {
      console.error('Error granting access:', error);
      toast.error('Failed to grant access');
    } finally {
      setGranting(false);
    }
  };

  // Shared invite popover for both direct invite and approving requests
  const InvitePopover = () => (
    <Popover open={grantPopoverOpen} onOpenChange={setGrantPopoverOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
          <UserPlus className="w-3 h-3" />
          Invite
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="end">
        <div className="space-y-3">
          <p className="text-sm font-medium">Invite {name || email}</p>
          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="coordinator">Coordinator</SelectItem>
              <SelectItem value="editor">Editor</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="w-full gap-1"
            onClick={handleGrantAccess}
            disabled={granting}
          >
            {granting ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
            Confirm
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );

  return (
    <div className="flex items-center gap-1.5">
      {/* Editor: Request access button */}
      {canFlag && !canGrant && !accessRequested && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onFlagAccess(true)}
            >
              <UserPlus className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Request platform access</TooltipContent>
        </Tooltip>
      )}

      {/* Access requested badge + actions */}
      {accessRequested && !accessGranted && (
        <>
          <Badge variant="secondary" className="gap-1 text-xs">
            <UserPlus className="w-3 h-3" />
            Access requested
          </Badge>

          {/* Coordinator/Owner: Invite + Dismiss */}
          {canGrant && email && (
            <>
              <InvitePopover />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onFlagAccess(false)}
                  >
                    <X className="w-3 h-3 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Dismiss request</TooltipContent>
              </Tooltip>
            </>
          )}

          {/* Editor: Cancel own request */}
          {canFlag && !canGrant && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onFlagAccess(false)}
                >
                  <X className="w-3 h-3 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Cancel request</TooltipContent>
            </Tooltip>
          )}
        </>
      )}

      {/* Coordinator/Owner: Direct invite (no request needed) */}
      {canGrant && !accessRequested && !accessGranted && email && (
        <InvitePopover />
      )}
    </div>
  );
}
