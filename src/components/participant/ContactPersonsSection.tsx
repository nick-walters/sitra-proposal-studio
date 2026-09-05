import { useEffect, useState } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { reorderParticipantMembers } from '@/hooks/useParticipantDetails';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { User, Plus, Trash2, Crown, ShieldCheck, ShieldOff, Loader2, Users, GripVertical, Edit2, Check, X } from 'lucide-react';
import { Participant, ParticipantMember } from '@/types/proposal';
import { ParticipantResearcher } from '@/types/participantDetails';
import { MCPDetailFields } from './MCPDetailFields';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface SelectedPerson {
  id: string;
  full_name: string;
  email: string | null;
  default_role: string | null;
}

/** The four editable fields of a contact card, as held while editing. */
interface ContactEditValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

const PHONE_PLACEHOLDER = 'Please add a phone number';


interface ContactPersonsSectionProps {
  participant: Participant;
  members: ParticipantMember[];
  onAddMember: (member: Omit<ParticipantMember, 'id'>) => void;
  onUpdateMember: (id: string, updates: Partial<ParticipantMember>) => void;
  onDeleteMember: (id: string) => void;
  onUpdateParticipant: (field: string, value: unknown) => void;
  canEdit: boolean;
  canGrant: boolean;
  proposalId?: string;
  proposalAcronym?: string;
  // Copy to researchers
  researchers: ParticipantResearcher[];
  onAddResearcher: (researcher: Omit<ParticipantResearcher, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

export function ContactPersonsSection({
  participant,
  members,
  onAddMember,
  onUpdateMember,
  onDeleteMember,
  onUpdateParticipant,
  canEdit,
  canGrant,
  proposalId,
  proposalAcronym,
  researchers,
  onAddResearcher,
}: ContactPersonsSectionProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<SelectedPerson | null>(null);
  const [grantingId, setGrantingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [orderedMembers, setOrderedMembers] = useState<ParticipantMember[]>(members);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [unsetMCPConfirm, setUnsetMCPConfirm] = useState<string | null>(null);
  // Pending confirmation for a save that would revoke a contact's access.
  const [pendingEmailSave, setPendingEmailSave] = useState<{
    member: ParticipantMember;
    values: ContactEditValues;
    resolve: (confirmed: boolean) => void;
  } | null>(null);
  const [newContact, setNewContact] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    wantsPlatformAccess: 'no' as 'yes' | 'no',
  });

  // Sync access status: check if roles still exist in backend
  useEffect(() => {
    if (!proposalId || !canGrant) return;

    const syncAccessStatus = async () => {
      const membersWithAccess = members.filter(m => m.accessGranted && m.email);
      if (membersWithAccess.length === 0) return;

      for (const member of membersWithAccess) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', member.email!.toLowerCase())
            .maybeSingle();

          if (profile) {
            const { data: role } = await supabase
              .from('user_roles')
              .select('id, role')
              .eq('user_id', profile.id)
              .eq('proposal_id', proposalId)
              .maybeSingle();

            const { data: globalRole } = await supabase
              .from('user_roles')
              .select('id, role')
              .eq('user_id', profile.id)
              .is('proposal_id', null)
              .maybeSingle();

            const hasRole = role || (globalRole && ['owner', 'admin'].includes(globalRole.role));

            if (!hasRole) {
              onUpdateMember(member.id, { accessGranted: false, accessGrantedRole: undefined });
            }
          }
        } catch (err) {
          console.error('Error syncing access status:', err);
        }
      }
    };

    syncAccessStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalId, canGrant]);

  // The fetch already returns contacts in order_index order; local state keeps
  // a dragged order on screen while the writes are in flight.
  useEffect(() => {
    setOrderedMembers((current) => {
      const currentIds = new Set(current.map((member) => member.id));
      const sameRows = current.length === members.length && members.every((m) => currentIds.has(m.id));
      if (!sameRows) return members;
      const latestById = new Map(members.map((m) => [m.id, m]));
      return current.map((m) => latestById.get(m.id) ?? m);
    });
  }, [members]);

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const oldIndex = orderedMembers.findIndex((m) => m.id === active.id);
    const newIndex = orderedMembers.findIndex((m) => m.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const previous = orderedMembers;
    const next = arrayMove(previous, oldIndex, newIndex);
    setOrderedMembers(next);
    const persisted = await reorderParticipantMembers(next.map((m) => m.id));
    if (!persisted) setOrderedMembers(previous);
  };

  /** Mirrors a contact's name/email onto its linked researcher row, if any. */
  const syncLinkedResearcher = (member: ParticipantMember, fullName: string, email: string) => {
    const linked = researchers.find((r) => r.memberId === member.id);
    if (!linked) return;
    const parts = fullName.trim().split(' ');
    onAddResearcher({
      participantId: participant.id,
      memberId: member.id,
      firstName: parts[0] || '',
      lastName: parts.slice(1).join(' ') || '',
      email,
      orderIndex: linked.orderIndex,
    } as Omit<ParticipantResearcher, 'id' | 'createdAt' | 'updatedAt'>);
  };

  /** Ticking the box shows the linked researcher; unticking hides the row. */
  const handleToggleResearch = (member: ParticipantMember, checked: boolean) => {
    const parts = member.fullName.trim().split(' ');
    onAddResearcher({
      participantId: participant.id,
      memberId: member.id,
      hidden: !checked,
      firstName: parts[0] || '',
      lastName: parts.slice(1).join(' ') || '',
      email: member.email || '',
      orderIndex: researchers.length,
    } as Omit<ParticipantResearcher, 'id' | 'createdAt' | 'updatedAt'>);
  };

  /**
   * Writes one contact card's edited fields. Only ever called from an explicit
   * Save, never while typing. Name and email edits flow through to the MCP
   * fields and to a linked researcher row, and changing the email drops any
   * access granted to the old address.
   */
  const applyMemberEdits = async (member: ParticipantMember, values: ContactEditValues) => {
    const firstName = values.firstName.trim();
    const lastName = values.lastName.trim();
    const email = values.email.trim();
    const phone = values.phone.trim();
    const fullName = `${firstName} ${lastName}`.trim();

    const updates: Partial<ParticipantMember> = {
      fullName,
      email,
      roleInProject: phone,
    };

    const oldEmail = member.email?.toLowerCase();
    const newEmail = email.toLowerCase();
    if (oldEmail && newEmail !== oldEmail && member.accessGranted && proposalId) {
      try {
        const { data: oldProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', oldEmail)
          .maybeSingle();
        if (oldProfile) {
          const { error } = await supabase
            .from('user_roles')
            .delete()
            .eq('user_id', oldProfile.id)
            .eq('proposal_id', proposalId);
          if (error) throw error;
        }
        updates.accessGranted = false;
        updates.accessGrantedRole = undefined;
        toast.info(`Access revoked for the previous email (${oldEmail})`);
      } catch (error: any) {
        toast.error(`Failed to revoke access for the previous email: ${error?.message ?? error}`);
        console.error(error);
      }
    }

    onUpdateMember(member.id, updates);

    if (member.isPrimaryContact) {
      onUpdateParticipant('mainContactFirstName', firstName);
      onUpdateParticipant('mainContactLastName', lastName);
      onUpdateParticipant('contactEmail', email);
      onUpdateParticipant('mainContactPhone', phone);
    }

    syncLinkedResearcher(member, fullName, email);
  };

  /**
   * Deliberate save for a contact card. Required fields are checked first, and
   * an email change for a contact who currently has access is confirmed before
   * anything is written. Returns true when the card may leave edit mode.
   */
  const saveMemberEdits = async (member: ParticipantMember, values: ContactEditValues) => {
    if (!values.firstName.trim() || !values.lastName.trim() || !values.email.trim()) {
      toast.error('First name, last name and email are required');
      return false;
    }

    const oldEmail = member.email?.toLowerCase() || '';
    const newEmail = values.email.trim().toLowerCase();
    if (oldEmail && newEmail !== oldEmail && member.accessGranted) {
      const confirmed = await new Promise<boolean>((resolve) => {
        setPendingEmailSave({ member, values, resolve });
      });
      setPendingEmailSave(null);
      if (!confirmed) return false;
    }

    await applyMemberEdits(member, values);
    return true;
  };


  const handlePersonSelect = (person: SelectedPerson | null) => {
    setSelectedPerson(person);
    if (person) {
      const parts = person.full_name.split(' ');
      setNewContact({
        ...newContact,
        firstName: parts[0] || '',
        lastName: parts.slice(1).join(' ') || '',
        email: person.email || '',
      });
    }
  };

  const handleAddContact = async () => {
    if (!newContact.firstName.trim() || !newContact.lastName.trim() || !newContact.email.trim()) {
      toast.error('First name, last name and email are required');
      return;
    }

    const fullName = `${newContact.firstName.trim()} ${newContact.lastName.trim()}`;
    let personId = selectedPerson?.id || null;

    if (!personId) {
      const { data: newPerson, error } = await supabase
        .from('people')
        .insert({
          full_name: fullName,
          email: newContact.email.trim() || null,
          default_role: null,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating person:', error);
      } else {
        personId = newPerson.id;
      }
    }

    const newMember = {
      participantId: participant.id,
      fullName,
      email: newContact.email.trim(),
      roleInProject: newContact.phone.trim(),
      personMonths: 0,
      isPrimaryContact: false,
      wantsPlatformAccess: newContact.wantsPlatformAccess === 'yes',
      personId: personId || undefined,
    };

    onAddMember(newMember);

    // Auto-invite if coordinator/owner adds with access=yes
    if (canGrant && newContact.wantsPlatformAccess === 'yes' && proposalId && proposalAcronym) {
      // Wait briefly for the member to be persisted, then find and grant
      setTimeout(async () => {
        try {
          // Look up the newly added member by email
          const { data: newMembers } = await supabase
            .from('participant_members')
            .select('id')
            .eq('participant_id', participant.id)
            .eq('email', newContact.email.trim().toLowerCase())
            .order('created_at', { ascending: false })
            .limit(1);

          if (newMembers && newMembers.length > 0) {
            const fakeMember = {
              id: newMembers[0].id,
              email: newContact.email.trim(),
              fullName,
            } as ParticipantMember;
            await handleGrantAccess(fakeMember);
          }
        } catch (err) {
          console.error('Auto-invite failed:', err);
        }
      }, 500);
    }

    setNewContact({ firstName: '', lastName: '', email: '', phone: '', wantsPlatformAccess: 'no' });
    setSelectedPerson(null);
    setShowAddForm(false);
  };

  const handleSetMCP = (memberId: string) => {
    const member = members.find(m => m.id === memberId);
    const isCurrentlyMCP = member?.isPrimaryContact;

    // If unsetting MCP, prompt confirmation
    if (isCurrentlyMCP) {
      setUnsetMCPConfirm(memberId);
      return;
    }

    applyMCP(memberId);
  };

  const applyMCP = (memberId: string) => {
    // Unset previous MCP
    members.forEach((m) => {
      if (m.isPrimaryContact && m.id !== memberId) {
        onUpdateMember(m.id, { isPrimaryContact: false });
      }
    });
    const member = members.find(m => m.id === memberId);
    const newValue = !member?.isPrimaryContact;
    onUpdateMember(memberId, { isPrimaryContact: newValue });

    // Sync basic info to participant's mainContact fields
    if (newValue && member) {
      const parts = member.fullName.split(' ');
      onUpdateParticipant('mainContactFirstName', parts[0] || '');
      onUpdateParticipant('mainContactLastName', parts.slice(1).join(' ') || '');
      onUpdateParticipant('contactEmail', member.email || '');
      // Carry over phone (stored on the member's roleInProject field) and
      // the organisation website to the MCP fields
      if (member.roleInProject) {
        onUpdateParticipant('mainContactPhone', member.roleInProject);
      }
      if (participant.website && !participant.mainContactWebsite) {
        onUpdateParticipant('mainContactWebsite', participant.website);
      }
    }

    // If unsetting, clear MCP-specific fields
    if (!newValue) {
      onUpdateParticipant('mainContactFirstName', '');
      onUpdateParticipant('mainContactLastName', '');
      onUpdateParticipant('contactEmail', '');
      onUpdateParticipant('mainContactPhone', '');
      onUpdateParticipant('mainContactPosition', '');
      onUpdateParticipant('mainContactDepartment', '');
    }
  };

  const handleGrantAccess = async (member: ParticipantMember) => {
    if (!member.email || !proposalId || !proposalAcronym) return;

    setGrantingId(member.id);
    try {
      // Look up existing profile
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', member.email.toLowerCase())
        .maybeSingle();

      if (existingProfile) {
        // Check for existing proposal-specific role
        const { data: existingRole } = await supabase
          .from('user_roles')
          .select('id, role')
          .eq('user_id', existingProfile.id)
          .eq('proposal_id', proposalId)
          .maybeSingle();

        // Check for global roles (owner/admin — proposal_id is null)
        const { data: globalRole } = await supabase
          .from('user_roles')
          .select('id, role')
          .eq('user_id', existingProfile.id)
          .is('proposal_id', null)
          .maybeSingle();

        const higherRoles = ['coordinator', 'owner', 'admin'];
        const existingHigher = existingRole && higherRoles.includes(existingRole.role);
        const hasGlobal = globalRole && higherRoles.includes(globalRole.role);

        if (existingRole || hasGlobal) {
          const roleName = existingRole?.role || globalRole?.role || 'existing';
          toast.info(`${member.fullName} already has ${roleName} access`);
          onUpdateMember(member.id, { accessGranted: true, accessGrantedRole: existingRole?.role || globalRole?.role || 'editor' });
        } else {
          const { error } = await supabase.from('user_roles').insert([{
            user_id: existingProfile.id,
            proposal_id: proposalId,
            role: 'editor' as const,
          }]);
          if (error) throw error;
          onUpdateMember(member.id, { accessGranted: true, accessGrantedRole: 'editor' });
          toast.success(`${member.fullName} granted editor access`);
        }
      } else {
        // Invite new user
        const fallbackSignupUrl = `${window.location.origin}/auth`;
        const { data: inviteResult, error: inviteError } = await supabase.functions.invoke('invite-user', {
          body: {
            email: member.email.toLowerCase(),
            fullName: member.fullName,
            proposalId,
            proposalAcronym,
          },
        });

        if (inviteError) {
          try {
            await navigator.clipboard.writeText(fallbackSignupUrl);
            toast.info(`Invite email failed for ${member.email}. A signup link was copied for manual sharing.`);
          } catch {
            toast.info(`Invite email failed for ${member.email}. Share this signup link manually: ${fallbackSignupUrl}`);
          }
          return;
        }

        if (inviteResult?.userId) {
          await supabase.from('user_roles').insert([{
            user_id: inviteResult.userId,
            proposal_id: proposalId,
            role: 'editor' as const,
          }]);
        }

        onUpdateMember(member.id, { accessGranted: true, accessGrantedRole: 'editor' });

        const inviteSignupUrl = inviteResult?.signupUrl || fallbackSignupUrl;
        try {
          await navigator.clipboard.writeText(inviteSignupUrl);
          toast.success(`Invitation sent to ${member.email}. Backup signup link copied.`);
        } catch {
          toast.success(`Invitation sent to ${member.email}. If needed, share this signup link: ${inviteSignupUrl}`);
        }
      }
    } catch (error: any) {
      console.error('Error granting access:', error);
      toast.error('Failed to grant access');
    } finally {
      setGrantingId(null);
    }
  };

  const handleRevokeAccess = async (member: ParticipantMember) => {
    if (!member.email || !proposalId) return;

    setRevokingId(member.id);
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', member.email.toLowerCase())
        .maybeSingle();

      if (profile) {
        const { error } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', profile.id)
          .eq('proposal_id', proposalId);

        if (error) throw error;
      }

      onUpdateMember(member.id, { accessGranted: false, accessGrantedRole: undefined });
      toast.success(`Access revoked for ${member.fullName}`);
    } catch (error: any) {
      console.error('Error revoking access:', error);
      toast.error('Failed to revoke access');
    } finally {
      setRevokingId(null);
    }
  };
  const hasMCP = members.some(m => m.isPrimaryContact);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="w-5 h-5" />
              Contact persons to be added to Funding &amp; Tenders Portal
            </CardTitle>
            <CardDescription className="mt-1">
              All contact persons for this organisation in the consortium
            </CardDescription>
            <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5" />
                = MCP (main contact person) for this organisation.
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                = appears in the researchers list for this organisation.
              </span>
            </div>
          </div>
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddForm(!showAddForm)}
              className="gap-1"
            >
              <Plus className="w-4 h-4" />
              Add Contact
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add Contact Form */}
        {showAddForm && (
          <Card className="border-dashed">
            <CardContent className="pt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>First name *</Label>
                  <Input
                    value={newContact.firstName}
                    onChange={(e) => setNewContact({ ...newContact, firstName: e.target.value })}
                    placeholder="First name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Last name *</Label>
                  <Input
                    value={newContact.lastName}
                    onChange={(e) => setNewContact({ ...newContact, lastName: e.target.value })}
                    placeholder="Last name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={newContact.email}
                    onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                    placeholder="contact@organisation.eu"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    type="tel"
                    value={newContact.phone}
                    onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                    placeholder="+358..."
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Should this person have access to the proposal on Sitra Proposal Studio? *</Label>
                  <Select
                    value={newContact.wantsPlatformAccess}
                    onValueChange={(v) => setNewContact({ ...newContact, wantsPlatformAccess: v as 'yes' | 'no' })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no">No</SelectItem>
                      <SelectItem value="yes">Yes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleAddContact}
                  disabled={!newContact.firstName.trim() || !newContact.lastName.trim() || !newContact.email.trim()}
                >
                  Add Contact
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Contact List */}
        {members.length === 0 && !showAddForm ? (
          <div className="text-center py-6 text-muted-foreground">
            <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No contact persons added yet</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedMembers.map((m) => m.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {orderedMembers.map((member) => (
                  <SortableContactCard
                    key={member.id}
                    member={member}
                    participant={participant}
                    canEdit={canEdit}
                    canGrant={canGrant}
                    hasMCP={hasMCP}
                    proposalId={proposalId}
                    proposalAcronym={proposalAcronym}
                    grantingId={grantingId}
                    revokingId={revokingId}
                    isResearcher={researchers.some((r) => r.memberId === member.id)}
                    onSaveEdits={saveMemberEdits}
                    onToggleResearch={handleToggleResearch}
                    onSetMCP={handleSetMCP}
                    onGrantAccess={handleGrantAccess}
                    onRevokeAccess={handleRevokeAccess}
                    onRequestDelete={(id, name) => setDeleteConfirm({ id, name })}
                    onUpdateParticipant={onUpdateParticipant}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Delete CP Confirmation */}
        <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove contact person?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove <strong>{deleteConfirm?.name}</strong> from the contact persons list? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (deleteConfirm) {
                    onDeleteMember(deleteConfirm.id);
                    setDeleteConfirm(null);
                  }
                }}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Unset MCP Confirmation */}
        <AlertDialog open={!!unsetMCPConfirm} onOpenChange={(open) => !open && setUnsetMCPConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Main Contact Person role?</AlertDialogTitle>
              <AlertDialogDescription>
                The additional MCP details (phone, position, department) will be cleared and won't be stored. Are you sure you want to proceed?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (unsetMCPConfirm) {
                    applyMCP(unsetMCPConfirm);
                    setUnsetMCPConfirm(null);
                  }
                }}
              >
                Remove MCP
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Email change / access revocation confirmation */}
        <AlertDialog
          open={!!pendingEmailSave}
          onOpenChange={(open) => {
            if (!open && pendingEmailSave) pendingEmailSave.resolve(false);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Change email and revoke access?</AlertDialogTitle>
              <AlertDialogDescription>
                <strong>{pendingEmailSave?.member.fullName}</strong> currently has access to this
                proposal with the email address {pendingEmailSave?.member.email}. Saving this change
                to {pendingEmailSave?.values.email.trim()} will revoke their access, and a
                coordinator will have to grant access again to the new address.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => pendingEmailSave?.resolve(false)}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => pendingEmailSave?.resolve(true)}
              >
                Save and revoke access
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>


      </CardContent>
    </Card>
  );
}

/** One always-editable contact card, draggable by the grip on its left. */
function SortableContactCard({
  member,
  participant,
  canEdit,
  canGrant,
  hasMCP,
  proposalId,
  proposalAcronym,
  grantingId,
  revokingId,
  isResearcher,
  onSaveEdits,
  onToggleResearch,
  onSetMCP,
  onGrantAccess,
  onRevokeAccess,
  onRequestDelete,
  onUpdateParticipant,
}: {
  member: ParticipantMember;
  participant: Participant;
  canEdit: boolean;
  canGrant: boolean;
  hasMCP: boolean;
  proposalId?: string;
  proposalAcronym?: string;
  grantingId: string | null;
  revokingId: string | null;
  isResearcher: boolean;
  onSaveEdits: (member: ParticipantMember, values: ContactEditValues) => Promise<boolean>;
  onToggleResearch: (member: ParticipantMember, checked: boolean) => void;
  onSetMCP: (id: string) => void;
  onGrantAccess: (member: ParticipantMember) => void;
  onRevokeAccess: (member: ParticipantMember) => void;
  onRequestDelete: (id: string, name: string) => void;
  onUpdateParticipant: (field: string, value: any) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: member.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.55 : 1 };

  const nameParts = member.fullName.split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';
  const initials = `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();
  const isMCP = member.isPrimaryContact;
  const wantsAccess = member.wantsPlatformAccess;
  const hasAccess = member.accessGranted;
  const isGranting = grantingId === member.id;
  const isRevoking = revokingId === member.id;

  // Deliberate editing: fields are read-only until Edit is pressed, and nothing
  // is written until Save. Discard simply drops the local draft. This restores
  // the editingId / editForm / Edit2-Check-X pattern the section used before it
  // was made always-editable.
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ContactEditValues>({
    firstName,
    lastName,
    email: member.email || '',
    phone: member.roleInProject || '',
  });

  const startEdit = () => {
    setForm({ firstName, lastName, email: member.email || '', phone: member.roleInProject || '' });
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setForm({ firstName, lastName, email: member.email || '', phone: member.roleInProject || '' });
    setIsEditing(false);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const done = await onSaveEdits(member, form);
      if (done) setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const phoneValue = member.roleInProject || '';

  return (
    <div ref={setNodeRef} style={style}>
      <div className={`p-3 rounded-lg ${isMCP ? 'bg-primary/5 border border-primary/20' : 'bg-muted/50'}`}>
        <div className="flex items-start gap-3">
        <button
          type="button"
          className="mt-2 text-blue-600 cursor-grab active:cursor-grabbing disabled:opacity-40"
          aria-label="Reorder contact"
          title="Drag to reorder"
          disabled={!canEdit}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-4 h-4" />
        </button>

        <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${isMCP ? 'bg-primary/20' : 'bg-primary/10'}`}>
          <span className="text-sm font-medium text-primary">{initials}</span>
        </div>

        <div className="flex-1 min-w-0 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">First name *</Label>
            {isEditing ? (
              <Input
                className="h-8 text-sm"
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                aria-label="First name"
              />
            ) : (
              <p className="h-8 flex items-center text-sm truncate">{firstName}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Last name *</Label>
            {isEditing ? (
              <Input
                className="h-8 text-sm"
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                aria-label="Last name"
              />
            ) : (
              <p className="h-8 flex items-center text-sm truncate">{lastName}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Email *</Label>
            {isEditing ? (
              <Input
                className="h-8 text-sm"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                aria-label="Email"
              />
            ) : (
              <p className="h-8 flex items-center text-sm truncate">{member.email || ''}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Phone</Label>
            {isEditing ? (
              <Input
                className="h-8 text-sm"
                type="tel"
                value={form.phone}
                placeholder={PHONE_PLACEHOLDER}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                aria-label="Phone"
              />
            ) : phoneValue ? (
              <p className="h-8 flex items-center text-sm truncate">{phoneValue}</p>
            ) : (
              <p className="h-8 flex items-center text-sm italic text-muted-foreground/70 truncate">
                {PHONE_PLACEHOLDER}
              </p>
            )}
          </div>
        </div>


        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-1">
            {isMCP && <Badge variant="default" className="text-[10px] h-4 px-1.5">MCP</Badge>}

            {canEdit && (isEditing ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-primary"
                  onClick={() => { void saveEdit(); }}
                  disabled={saving}
                  aria-label="Save contact"
                  title="Save"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  onClick={cancelEdit}
                  disabled={saving}
                  aria-label="Discard changes"
                  title="Discard changes"
                >
                  <X className="w-4 h-4" />
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                onClick={startEdit}
                aria-label="Edit contact"
                title="Edit"
              >
                <Edit2 className="w-4 h-4" />
              </Button>
            ))}


            {canEdit && (isMCP || !hasMCP) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-7 w-7 ${isMCP ? 'text-primary' : 'text-muted-foreground'}`}
                    onClick={() => onSetMCP(member.id)}
                    aria-label="Toggle main contact"
                    title="Toggle main contact"
                  >
                    <Crown className={`w-4 h-4 ${isMCP ? 'fill-primary' : ''}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isMCP ? 'Remove as main contact' : 'Set as main contact person'}</TooltipContent>
              </Tooltip>
            )}

            {canGrant && wantsAccess && proposalId && proposalAcronym && (
              <>
                {hasAccess ? (
                  <>
                    {['editor', 'coordinator', 'owner', 'admin'].includes(member.accessGrantedRole || '') ? (
                      <Badge className="gap-1 text-xs bg-green-100 text-green-800 border-green-300 hover:bg-green-100">
                        <ShieldCheck className="w-3 h-3" />
                        Has access
                      </Badge>
                    ) : (
                      <Badge className="gap-1 text-xs bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100">
                        <ShieldCheck className="w-3 h-3" />
                        Invite sent
                      </Badge>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => onRevokeAccess(member)}
                          disabled={isRevoking}
                          aria-label="Revoke access"
                          title="Revoke access"
                        >
                          {isRevoking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldOff className="w-3.5 h-3.5" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Revoke access</TooltipContent>
                    </Tooltip>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => onGrantAccess(member)}
                    disabled={isGranting || !member.email}
                  >
                    {isGranting ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                    Give access
                  </Button>
                )}
              </>
            )}

            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive h-7 w-7"
                onClick={() => onRequestDelete(member.id, member.fullName)}
                aria-label="Delete"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>

        </div>
        </div>
        <label className="mt-2 flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={isResearcher}
            disabled={!canEdit}
            onCheckedChange={(checked) => onToggleResearch(member, checked === true)}
            aria-label="This person will conduct research in the project"
          />
          <Users className="w-3.5 h-3.5" />
          This person will conduct research in the project
        </label>
      </div>

      {isMCP && (
        <MCPDetailFields participant={participant} onUpdate={onUpdateParticipant} canEdit={canEdit} />
      )}
    </div>
  );
}
