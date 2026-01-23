import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { UserPlus, Loader2, Building2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Participant, ParticipantMember } from '@/types/proposal';

interface InviteToProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposalId: string;
  proposalAcronym: string;
  participants: Participant[];
  onMemberAdded: (member: Omit<ParticipantMember, 'id'>) => void;
}

type AccessLevel = 'admin' | 'editor' | 'viewer';

const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
  admin: 'Admin - Full editing access',
  editor: 'Editor - Can edit content',
  viewer: 'Viewer - Read only',
};

export function InviteToProposalDialog({
  open,
  onOpenChange,
  proposalId,
  proposalAcronym,
  participants,
  onMemberAdded,
}: InviteToProposalDialogProps) {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [roleInProject, setRoleInProject] = useState('');
  const [selectedParticipantId, setSelectedParticipantId] = useState('');
  const [accessLevel, setAccessLevel] = useState<AccessLevel>('editor');
  const [existingUser, setExistingUser] = useState<{ id: string; fullName: string } | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setEmail('');
      setFullName('');
      setRoleInProject('');
      setSelectedParticipantId('');
      setAccessLevel('editor');
      setExistingUser(null);
    }
  }, [open]);

  // Check if email exists when user types
  useEffect(() => {
    const checkEmail = async () => {
      if (!email || !email.includes('@')) {
        setExistingUser(null);
        return;
      }

      setCheckingEmail(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name')
          .eq('email', email.toLowerCase())
          .maybeSingle();

        if (!error && data) {
          setExistingUser({ id: data.id, fullName: data.full_name || '' });
          if (data.full_name) {
            setFullName(data.full_name);
          }
        } else {
          setExistingUser(null);
        }
      } catch (error) {
        console.error('Error checking email:', error);
      } finally {
        setCheckingEmail(false);
      }
    };

    const timeoutId = setTimeout(checkEmail, 500);
    return () => clearTimeout(timeoutId);
  }, [email]);

  const handleInvite = async () => {
    if (!email || !selectedParticipantId) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (!email.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      // Add the member to the participant's team
      const memberData: Omit<ParticipantMember, 'id'> = {
        participantId: selectedParticipantId,
        fullName: fullName || email.split('@')[0],
        email: email.toLowerCase(),
        roleInProject: roleInProject || undefined,
        personMonths: 0,
        isPrimaryContact: false,
      };

      // Insert the team member
      const { data: newMember, error: memberError } = await supabase
        .from('participant_members')
        .insert({
          participant_id: selectedParticipantId,
          full_name: memberData.fullName,
          email: memberData.email,
          role_in_project: memberData.roleInProject,
          person_months: 0,
          is_primary_contact: false,
          user_id: existingUser?.id || null,
        })
        .select()
        .single();

      if (memberError) {
        console.error('Error adding member:', memberError);
        toast.error('Failed to add team member');
        return;
      }

      // If the user exists, grant them access to the proposal
      if (existingUser) {
        // Check if user already has a role on this proposal
        const { data: existingRole } = await supabase
          .from('user_roles')
          .select('id, role')
          .eq('user_id', existingUser.id)
          .eq('proposal_id', proposalId)
          .maybeSingle();

        if (existingRole) {
          toast.info(`${existingUser.fullName || email} already has ${existingRole.role} access to this proposal`);
        } else {
          // Grant new role
          const { error: roleError } = await supabase
            .from('user_roles')
            .insert({
              user_id: existingUser.id,
              proposal_id: proposalId,
              role: accessLevel,
            });

          if (roleError) {
            console.error('Error granting access:', roleError);
            toast.error('Team member added, but failed to grant proposal access');
          } else {
            toast.success(`${memberData.fullName} added and granted ${accessLevel} access`);
          }
        }
      } else {
        // User doesn't exist yet - they'll need to sign up
        toast.success(`${memberData.fullName} added as team member. They will receive access when they sign up with ${email}`);
      }

      // Notify parent component
      onMemberAdded({
        ...memberData,
      });

      onOpenChange(false);
    } catch (error) {
      console.error('Error inviting:', error);
      toast.error('Failed to send invitation');
    } finally {
      setLoading(false);
    }
  };

  const selectedParticipant = participants.find(p => p.id === selectedParticipantId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Invite to {proposalAcronym}
          </DialogTitle>
          <DialogDescription>
            Add a collaborator to a participant organisation's team
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email address *</Label>
            <div className="relative">
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@university.edu"
              />
              {checkingEmail && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
              )}
            </div>
            {existingUser && (
              <p className="text-xs text-green-600">
                ✓ Found existing user: {existingUser.fullName || 'No name set'}
              </p>
            )}
          </div>

          {/* Full Name */}
          <div className="space-y-2">
            <Label htmlFor="invite-name">Full name</Label>
            <Input
              id="invite-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Dr. Jane Smith"
              disabled={!!existingUser?.fullName}
            />
          </div>

          {/* Participant Organisation */}
          <div className="space-y-2">
            <Label>Participant organisation *</Label>
            <Select value={selectedParticipantId} onValueChange={setSelectedParticipantId}>
              <SelectTrigger>
                <SelectValue placeholder="Select organisation" />
              </SelectTrigger>
              <SelectContent>
                {participants.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <div className="flex items-center gap-2">
                      <Building2 className="w-3 h-3" />
                      <span>{p.organisationShortName || p.organisationName}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedParticipant && (
              <p className="text-xs text-muted-foreground">
                {selectedParticipant.organisationName}
              </p>
            )}
          </div>

          {/* Role in Project */}
          <div className="space-y-2">
            <Label htmlFor="role-project">Role in project</Label>
            <Input
              id="role-project"
              value={roleInProject}
              onChange={(e) => setRoleInProject(e.target.value)}
              placeholder="e.g. WP3 Leader, Researcher"
            />
          </div>

          {/* Access Level */}
          <div className="space-y-2">
            <Label>Proposal access level</Label>
            <Select value={accessLevel} onValueChange={(v) => setAccessLevel(v as AccessLevel)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ACCESS_LEVEL_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!existingUser && email && email.includes('@') && !checkingEmail && (
            <Alert>
              <Info className="w-4 h-4" />
              <AlertDescription>
                This email is not registered. They will be added as a team member and will receive proposal access when they sign up.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleInvite}
            disabled={loading || !email || !selectedParticipantId}
            className="gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Add to Team
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
