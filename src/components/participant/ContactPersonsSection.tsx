import { useEffect, useRef, useState } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { reorderParticipantMembers } from '@/hooks/useParticipantDetails';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { User, Plus, Trash2, ShieldCheck, ShieldOff, Loader2, Users, GripVertical, Edit2, Check, X } from 'lucide-react';
import { Participant, ParticipantMember } from '@/types/proposal';
import { ParticipantResearcher, CONTACT_TITLES } from '@/types/participantDetails';
import {
  MCPDetailFields,
  MCP_FIELD_KEYS,
  CompactTextField,
  ReadValue,
  SelectPlaceholder,
  FIELD_CLASS,
  type MCPFields,
} from './MCPDetailFields';
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


/** The editable fields of a contact card, as held while editing. */
interface ContactEditValues {
  /** Title (Dr, Prof, …) — belongs to the person, stored on participant_members.title. */
  title?: string;
  firstName: string;
  lastName: string;
  email: string;
  /** Phone — belongs to the person, stored on participant_members.phone. */
  phone: string;
}

const PHONE_PLACEHOLDER = 'Please add a phone number';

/** Contact card field widths, defined once and shared by saved and new cards. */
const CW = {
  name: 'min-w-0 flex-1 basis-0 min-w-[106px]',
  title: 'w-[68px]',
  email: 'min-w-0 flex-[2] basis-0 min-w-[300px]',
  phone: 'min-w-0 flex-1 basis-0 min-w-[130px]',
} as const;

/**
 * A plain dropdown with no chevron. The shared trigger drops its arrow through
 * its own hideArrow prop; justify-start with no gap and no right-hand reserve
 * means the width is genuinely given back to the value. Replacing the
 * line-clamp with a truncating block keeps an overflowing value flush left —
 * the Prompt 22 indent fault.
 */
const PLAIN_SELECT_CLASS =
  `${FIELD_CLASS} justify-start gap-0 pr-2 [&>span]:line-clamp-none [&>span]:block [&>span]:min-w-0`
  + ' [&>span]:flex-1 [&>span]:text-left [&>span]:truncate [&>span]:whitespace-nowrap';

/**
 * The main contact's Gender dropdown is rendered by the shared detail fields,
 * so its chevron removal and −6px width are applied from here, on the wrapper.
 */
const MCP_OVERRIDES =
  "[&_.w-32]:w-[122px] [&_[aria-label='Gender']]:justify-start [&_[aria-label='Gender']]:gap-0"
  + " [&_[aria-label='Gender']]:pr-2 [&_[aria-label='Gender']>svg]:hidden"
  + " [&_[aria-label='Gender']>span]:line-clamp-none [&_[aria-label='Gender']>span]:block"
  + " [&_[aria-label='Gender']>span]:min-w-0 [&_[aria-label='Gender']>span]:flex-1"
  + " [&_[aria-label='Gender']>span]:text-left [&_[aria-label='Gender']>span]:truncate";

/**
 * Tidies a phone number once the user leaves the field: spaces only, so the
 * plus sign, brackets and hyphens survive untouched. Never called while typing.
 */
const stripPhoneSpaces = (value: string) => value.replace(/\s+/g, '');

/** A member row carrying its own phone number and title. */
type MemberWithPhone = ParticipantMember & { phone?: string; title?: string };




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
  // A brand-new contact card is a local draft until it is saved; no empty row
  // is ever written to the database.
  const [addingContact, setAddingContact] = useState(false);

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



  // Sync access status: reconcile the stored flag with the real roles, in BOTH
  // directions. A contact who still holds a role must show as having access even
  // if the flag was cleared by an earlier edit.
  useEffect(() => {
    if (!proposalId || !canGrant) return;

    const syncAccessStatus = async () => {
      const membersWithEmail = members.filter(m => m.email);
      if (membersWithEmail.length === 0) return;

      for (const member of membersWithEmail) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', member.email!.toLowerCase())
            .maybeSingle();

          if (!profile) {
            if (member.accessGranted) {
              onUpdateMember(member.id, { accessGranted: false, accessGrantedRole: undefined });
            }
            continue;
          }

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

          const effectiveRole = role?.role
            ?? (globalRole && ['owner', 'admin'].includes(globalRole.role) ? globalRole.role : undefined);

          if (!effectiveRole) {
            if (member.accessGranted) {
              onUpdateMember(member.id, { accessGranted: false, accessGrantedRole: undefined });
            }
          } else if (!member.accessGranted || member.accessGrantedRole !== effectiveRole) {
            onUpdateMember(member.id, { accessGranted: true, accessGrantedRole: effectiveRole });
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

  /** Mirrors a contact's title/name/email onto its linked researcher row, if any. */
  const syncLinkedResearcher = (
    member: ParticipantMember,
    fullName: string,
    email: string,
    title?: string,
  ) => {
    const linked = researchers.find((r) => r.memberId === member.id);
    if (!linked) return;
    const parts = fullName.trim().split(' ');
    onAddResearcher({
      participantId: participant.id,
      memberId: member.id,
      firstName: parts[0] || '',
      lastName: parts.slice(1).join(' ') || '',
      email,
      title: title ?? (member as MemberWithPhone).title ?? '',
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
      // Only the main contact carries a title, and it is inherited here.
      title: member.isPrimaryContact ? ((member as MemberWithPhone).title || '') : '',
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
    const phone = stripPhoneSpaces(values.phone.trim());
    const fullName = `${firstName} ${lastName}`.trim();
    // Title is only collected for the main contact; ordinary cards never write it.
    const title = member.isPrimaryContact ? (values.title?.trim() || '') : undefined;

    const updates: Partial<MemberWithPhone> = {
      fullName,
      email,
      phone,
      ...(title !== undefined ? { title: title || undefined } : {}),
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
      // The main contact's title is mirrored onto the participant for the portal fields.
      onUpdateParticipant('mainContactTitle', title ?? '');
    }

    // A linked researcher inherits the contact's title along with name and email.
    syncLinkedResearcher(member, fullName, email, member.isPrimaryContact ? (title ?? '') : '');
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

  /**
   * Saves a brand-new contact card. The row is only inserted here, on Save, so
   * a discarded card leaves nothing behind. The insert helper assigns the next
   * order_index, keeping the new contact last in the list.
   */
  const handleAddContact = async (values: ContactEditValues) => {
    const firstName = values.firstName.trim();
    const lastName = values.lastName.trim();
    const email = values.email.trim();
    if (!firstName || !lastName || !email) {
      toast.error('First name, last name and email are required');
      return false;
    }

    const fullName = `${firstName} ${lastName}`;
    let personId: string | null = null;

    const { data: newPerson, error } = await supabase
      .from('people')
      .insert({
        full_name: fullName,
        email: email || null,
        default_role: null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating person:', error);
    } else {
      personId = newPerson.id;
    }

    onAddMember({
      participantId: participant.id,
      fullName,
      email,
      phone: stripPhoneSpaces(values.phone.trim()),
      personMonths: 0,
      isPrimaryContact: false,
      wantsPlatformAccess: false,
      personId: personId || undefined,
    } as Omit<ParticipantMember, 'id'>);

    setAddingContact(false);
    return true;
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

    // Sync basic info to participant's mainContact fields. The phone is NOT
    // carried over: Phone 1 travels with the person on their own member row.
    if (newValue && member) {
      const parts = member.fullName.split(' ');
      onUpdateParticipant('mainContactFirstName', parts[0] || '');
      onUpdateParticipant('mainContactLastName', parts.slice(1).join(' ') || '');
      onUpdateParticipant('contactEmail', member.email || '');
      if (participant.website && !participant.mainContactWebsite) {
        onUpdateParticipant('mainContactWebsite', participant.website);
      }
    }

    // If unsetting, clear MCP-specific fields
    if (!newValue) {
      onUpdateParticipant('mainContactFirstName', '');
      onUpdateParticipant('mainContactLastName', '');
      onUpdateParticipant('contactEmail', '');
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
                <Badge className="text-[10px] h-4 px-1.5 bg-primary text-primary-foreground hover:bg-primary">MCP</Badge>
                = main contact person for this organisation.
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
              onClick={() => setAddingContact(true)}
              disabled={addingContact}

              className="gap-1"
            >
              <Plus className="w-4 h-4" />
              Add Contact
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Contact List */}
        {members.length === 0 && !addingContact ? (
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
                {/* A brand-new contact: the same card, last in the list, already
                    in edit mode. Nothing is written until Save. */}
                {addingContact && (
                  <NewContactCard
                    onSave={handleAddContact}
                    onDiscard={() => setAddingContact(false)}
                  />
                )}
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
                The additional main contact details for this organisation — gender, position in organisation, website, department and address — will be cleared. Everything else on this contact card is kept.
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
  const memberPhone = (member as MemberWithPhone).phone || '';
  const memberTitle = (member as MemberWithPhone).title || '';
  const emptyForm = (): ContactEditValues => ({
    title: memberTitle,
    firstName,
    lastName,
    email: member.email || '',
    phone: memberPhone,
  });
  const [form, setForm] = useState<ContactEditValues>(emptyForm);

  // The main-contact-only fields live on the participant row but are edited
  // through this card's pencil/save/discard, so they need their own draft.
  const readMcp = (): MCPFields => {
    const source = participant as unknown as MCPFields;
    const draft: MCPFields = {};
    for (const key of MCP_FIELD_KEYS) {
      (draft as Record<string, unknown>)[key] = source[key];
    }
    return draft;
  };
  const storedMcp = readMcp();
  const [mcpForm, setMcpForm] = useState<MCPFields>(readMcp);

  const startEdit = () => {
    setForm(emptyForm());
    setMcpForm(readMcp());
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setForm(emptyForm());
    setMcpForm(readMcp());
    setIsEditing(false);
  };



  const saveEdit = async () => {
    setSaving(true);
    try {
      const done = await onSaveEdits(member, form);
      if (done) {
        if (isMCP) {
          const stored = readMcp();
          for (const key of MCP_FIELD_KEYS) {
            if (mcpForm[key] !== stored[key]) onUpdateParticipant(key, mcpForm[key]);
          }
        }
        setIsEditing(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const phoneValue = memberPhone;

  const accessTooltip = hasAccess
    ? 'Revoke access to Sitra Proposal Studio'
    : 'Grant access to Sitra Proposal Studio';
  const mcpTooltip = isMCP
    ? 'Remove as main contact person'
    : hasMCP
      ? 'Make main contact person (replaces current MCP)'
      : 'Make main contact person';

  return (
    <div ref={setNodeRef} style={style}>
      <div className={`p-2 rounded-lg bg-primary/5 border ${isMCP ? 'border-primary/20' : 'border-transparent'}`}>
        <div className="flex items-start gap-1">
        <button
          type="button"
          className="mt-1 text-blue-600 cursor-grab active:cursor-grabbing disabled:opacity-40"
          aria-label="Reorder contact"
          title="Drag to reorder"
          disabled={!canEdit}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-4 h-4" />
        </button>

        <div className="flex-1 min-w-0 space-y-1">
          {/* Row 1: First name, Last name, Title (main contact only) */}
          <div className="flex flex-wrap items-stretch gap-1">
            <div className={CW.name}>
              <CompactTextField
                value={isEditing ? form.firstName : firstName}
                onChange={(v) => setForm((f) => ({ ...f, firstName: v }))}
                placeholder="First name*"
                isEditing={isEditing}
              />
            </div>
            <div className={CW.name}>
              <CompactTextField
                value={isEditing ? form.lastName : lastName}
                onChange={(v) => setForm((f) => ({ ...f, lastName: v }))}
                placeholder="Last name*"
                isEditing={isEditing}
                showDivider={isMCP}
              />
            </div>
            {isMCP && (
              <div className={`${CW.title} shrink-0`}>
                {isEditing ? (
                  <Select
                    value={form.title || ''}
                    onValueChange={(v) => setForm((f) => ({ ...f, title: v }))}
                  >
                    <SelectTrigger className={PLAIN_SELECT_CLASS} hideArrow aria-label="Title" title={(isEditing ? form.title : memberTitle) || 'Title'}>
                      <SelectValue placeholder={<SelectPlaceholder text="Title*" />} />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTACT_TITLES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center">
                    <ReadValue value={memberTitle} placeholder="Title*" />
                  </div>
                )}
              </div>
            )}
          </div>


          {/* Row 2: Email, Phone, and the research checkbox aligned with them */}
          <div className="flex flex-wrap items-stretch gap-1">
            <div className={CW.email}>

              <CompactTextField
                value={isEditing ? form.email : (member.email || '')}
                onChange={(v) => setForm((f) => ({ ...f, email: v }))}
                placeholder="Email*"
                type="email"
                isEditing={isEditing}
              />
            </div>
            <div className={CW.phone}>
              <CompactTextField
                value={isEditing ? form.phone : phoneValue}
                onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
                onBlur={() => setForm((f) => ({ ...f, phone: stripPhoneSpaces(f.phone) }))}
                placeholder="Phone*"
                type="tel"
                isEditing={isEditing}
              />
            </div>
            <label className="flex h-7 items-center gap-2 text-xs text-muted-foreground whitespace-nowrap shrink-0">
              <Checkbox
                checked={isResearcher}
                disabled={!canEdit}
                onCheckedChange={(checked) => onToggleResearch(member, checked === true)}
                aria-label="Conducts research in the project"
              />
              <Users className="w-3.5 h-3.5" />
              Conducts research in the project
            </label>
          </div>
        </div>




        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-1">
            {/* Main contact person: one pill, no crown. */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => onSetMCP(member.id)}
                  aria-label={mcpTooltip}
                  className="disabled:cursor-default"
                >
                  <Badge
                    className={`text-[10px] h-4 px-1.5 ${
                      isMCP
                        ? 'bg-primary text-primary-foreground hover:bg-primary'
                        : 'bg-muted text-muted-foreground border border-border hover:bg-muted'
                    }`}
                  >
                    {isMCP ? 'MCP' : 'Contact'}
                  </Badge>
                </button>
              </TooltipTrigger>
              <TooltipContent>{mcpTooltip}</TooltipContent>
            </Tooltip>

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
                className="h-7 w-7 text-blue-600 hover:text-blue-600"
                onClick={startEdit}
                aria-label="Edit contact"
                title="Edit"
              >
                <Edit2 className="w-4 h-4" />
              </Button>
            ))}

            {/* Access: one pill, granting or revoking on click. */}
            {canGrant && proposalId && proposalAcronym && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={isGranting || isRevoking || !member.email}
                    onClick={() => (hasAccess ? onRevokeAccess(member) : onGrantAccess(member))}
                    aria-label={accessTooltip}
                    className="disabled:opacity-60"
                  >
                    {hasAccess ? (
                      <Badge
                        className={`gap-1 text-xs ${
                          ['editor', 'coordinator', 'owner', 'admin'].includes(member.accessGrantedRole || '')
                            ? 'bg-green-100 text-green-800 border-green-300 hover:bg-green-100'
                            : 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100'
                        }`}
                      >
                        {isRevoking ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <ShieldOff className="w-3 h-3" />
                        )}
                        {['editor', 'coordinator', 'owner', 'admin'].includes(member.accessGrantedRole || '')
                          ? 'Has access'
                          : 'Invite sent'}
                      </Badge>
                    ) : (
                      <Badge className="gap-1 text-xs bg-muted text-muted-foreground border border-border hover:bg-muted">
                        {isGranting ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <ShieldCheck className="w-3 h-3" />
                        )}
                        No access
                      </Badge>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{accessTooltip}</TooltipContent>
              </Tooltip>
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

        {/* The main contact's extra fields live inside the same card, aligned
            with the fields above now the avatar has gone. */}
        {isMCP && (
          <div className={`pl-5 ${MCP_OVERRIDES}`}>
            <MCPDetailFields
              values={isEditing ? mcpForm : storedMcp}
              onChange={(field, value) => setMcpForm((f) => ({ ...f, [field]: value }))}
              isEditing={isEditing}
            />
          </div>
        )}
      </div>


    </div>
  );
}

/**
 * A brand-new contact: the same card as every other, last in the list and
 * already in edit mode. Nothing exists in the database until Save is pressed,
 * so Discard simply removes the card.
 */
function NewContactCard({
  onSave,
  onDiscard,
}: {
  onSave: (values: ContactEditValues) => Promise<boolean>;
  onDiscard: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ContactEditValues>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  });

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={ref}>
      <div className="p-2 rounded-lg bg-primary/5 border border-transparent">
        <div className="flex items-start gap-1">
          <span className="mt-1 text-blue-600 opacity-40" aria-hidden>
            <GripVertical className="w-4 h-4" />
          </span>

          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex flex-wrap items-stretch gap-1">
              <div className={CW.name}>
                <CompactTextField
                  value={form.firstName}
                  onChange={(v) => setForm((f) => ({ ...f, firstName: v }))}
                  placeholder="First name*"
                  isEditing
                />
              </div>
              <div className={CW.name}>
                <CompactTextField
                  value={form.lastName}
                  onChange={(v) => setForm((f) => ({ ...f, lastName: v }))}
                  placeholder="Last name*"
                  isEditing
                  showDivider={false}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-stretch gap-1">
              <div className={CW.email}>
                <CompactTextField
                  value={form.email}
                  onChange={(v) => setForm((f) => ({ ...f, email: v }))}
                  placeholder="Email*"
                  type="email"
                  isEditing
                />
              </div>
              <div className={CW.phone}>
                <CompactTextField
                  value={form.phone}
                  onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
                  onBlur={() => setForm((f) => ({ ...f, phone: stripPhoneSpaces(f.phone) }))}
                  placeholder="Phone*"
                  type="tel"
                  isEditing
                />
              </div>
              <label className="flex h-7 items-center gap-2 text-xs text-muted-foreground whitespace-nowrap shrink-0 opacity-60">
                <Checkbox checked={false} disabled aria-label="Conducts research in the project" />
                <Users className="w-3.5 h-3.5" />
                Conducts research in the project
              </label>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex items-center gap-1">
              <Badge className="text-[10px] h-4 px-1.5 bg-muted text-muted-foreground border border-border hover:bg-muted">
                Contact
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-primary"
                onClick={() => { void save(); }}
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
                onClick={onDiscard}
                disabled={saving}
                aria-label="Discard new contact"
                title="Discard"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
