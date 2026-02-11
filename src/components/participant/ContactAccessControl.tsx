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
import { UserPlus, ShieldCheck, Loader2, Flag, Check } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface ContactAccessControlProps {
  /** The contact person's email – required to grant access */
  email: string | null | undefined;
  /** The contact person's name */
  name: string | null | undefined;
  /** Whether this contact has been flagged for access */
  accessRequested: boolean;
  /** Whether access has been granted */
  accessGranted: boolean;
  /** Role granted (coordinator/editor/viewer) */
  accessGrantedRole: string | null | undefined;
  /** Can the current user flag for access (editor+) */
  canFlag: boolean;
  /** Can the current user grant access (coordinator/owner) */
  canGrant: boolean;
  /** Proposal ID for role assignment */
  proposalId: string;
  /** Proposal acronym for invitation */
  proposalAcronym: string;
  /** Callback to update the access_requested field */
  onFlagAccess: (requested: boolean) => void;
  /** Callback after access is granted */
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
      // Check if user already exists
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email.toLowerCase())
        .maybeSingle();

      if (existingProfile) {
        // User exists – check if already has access
        const { data: existingRole } = await supabase
          .from('user_roles')
          .select('id')
          .eq('user_id', existingProfile.id)
          .eq('proposal_id', proposalId)
          .maybeSingle();

        if (existingRole) {
          toast.info(`${name || email} already has access to this proposal`);
        } else {
          // Grant role
          const { error } = await supabase.from('user_roles').insert([{
            user_id: existingProfile.id,
            proposal_id: proposalId,
            role: selectedRole as 'coordinator' | 'editor' | 'viewer',
          }]);
          if (error) throw error;
          toast.success(`${name || email} granted ${selectedRole} access`);
        }
      } else {
        // Invite via edge function
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

  return (
    <div className="flex items-center gap-1.5">
      {/* Flag for access button (editor+) */}
      {canFlag && !accessRequested && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onFlagAccess(true)}
            >
              <Flag className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Flag for platform access</TooltipContent>
        </Tooltip>
      )}

      {/* Flagged indicator */}
      {accessRequested && !accessGranted && (
        <>
          <Badge variant="secondary" className="gap-1 text-xs">
            <Flag className="w-3 h-3" />
            Access requested
          </Badge>

          {/* Grant button (coordinator/owner only) */}
          {canGrant && email && (
            <Popover open={grantPopoverOpen} onOpenChange={setGrantPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                  <UserPlus className="w-3 h-3" />
                  Grant
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-3" align="end">
                <div className="space-y-3">
                  <p className="text-sm font-medium">Grant access to {name || email}</p>
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
          )}

          {/* Unflag button */}
          {canFlag && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onFlagAccess(false)}
                >
                  <span className="text-xs text-muted-foreground">✕</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove flag</TooltipContent>
            </Tooltip>
          )}
        </>
      )}
    </div>
  );
}
