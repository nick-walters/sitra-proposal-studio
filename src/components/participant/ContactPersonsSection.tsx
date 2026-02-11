import { useState } from 'react';
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
import { User, Plus, Trash2, Crown, Copy, ShieldCheck, ShieldOff, Loader2, Edit2, Check, X } from 'lucide-react';
import { Participant, ParticipantMember } from '@/types/proposal';
import { ParticipantResearcher } from '@/types/participantDetails';
import { PersonAutocomplete } from '@/components/PersonAutocomplete';
import { MCPDetailFields } from './MCPDetailFields';
import { CopyToResearcherDialog } from './CopyToResearcherDialog';
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', email: '', phone: '', originalEmail: '', wantsPlatformAccess: undefined as 'yes' | 'no' | undefined });
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copyDialogData, setCopyDialogData] = useState<{ firstName: string; lastName: string; email: string; roleInProject: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [unsetMCPConfirm, setUnsetMCPConfirm] = useState<string | null>(null);
  const [newContact, setNewContact] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    wantsPlatformAccess: 'no' as 'yes' | 'no',
  });

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

  const handleStartEdit = (member: ParticipantMember) => {
    const parts = member.fullName.split(' ');
    setEditingId(member.id);
    setEditForm({
      firstName: parts[0] || '',
      lastName: parts.slice(1).join(' ') || '',
      email: member.email || '',
      phone: member.roleInProject || '',
      originalEmail: member.email || '',
      wantsPlatformAccess: member.wantsPlatformAccess ? 'yes' : member.wantsPlatformAccess === false ? 'no' : undefined,
    });
  };

  const handleSaveEdit = async (memberId: string) => {
    if (!editForm.firstName.trim() || !editForm.lastName.trim() || !editForm.email.trim()) {
      toast.error('First name, last name and email are required');
      return;
    }
    const fullName = `${editForm.firstName.trim()} ${editForm.lastName.trim()}`;
    const member = members.find(m => m.id === memberId);
    const oldEmail = member?.email?.toLowerCase();
    const newEmail = editForm.email.trim().toLowerCase();
    const emailChanged = oldEmail && newEmail !== oldEmail;

    // If email changed and old email had access, revoke old access
    if (emailChanged && member?.accessGranted && proposalId) {
      try {
        const { data: oldProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', oldEmail)
          .maybeSingle();

        if (oldProfile) {
          await supabase
            .from('user_roles')
            .delete()
            .eq('user_id', oldProfile.id)
            .eq('proposal_id', proposalId);
        }
        toast.info(`Access revoked for previous email (${oldEmail})`);
      } catch (error) {
        console.error('Error revoking old email access:', error);
      }
    }

    // Build update payload
    const updates: Partial<ParticipantMember> = {
      fullName,
      email: editForm.email.trim(),
      roleInProject: editForm.phone.trim(),
    };

    // If email changed, reset access state and apply new access preference
    if (emailChanged) {
      updates.accessGranted = false;
      updates.accessGrantedRole = undefined;
      updates.wantsPlatformAccess = editForm.wantsPlatformAccess === 'yes' ? true : editForm.wantsPlatformAccess === 'no' ? false : undefined;
    }

    onUpdateMember(memberId, updates);

    // If this member is the MCP, sync to participant fields
    if (member?.isPrimaryContact) {
      onUpdateParticipant('mainContactFirstName', editForm.firstName.trim());
      onUpdateParticipant('mainContactLastName', editForm.lastName.trim());
      onUpdateParticipant('contactEmail', editForm.email.trim());
    }

    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleCopyToResearchers = (member: ParticipantMember) => {
    const parts = member.fullName.split(' ');
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ') || '';

    // Check for duplicates
    const exists = researchers.some(
      (r) => r.firstName.toLowerCase() === firstName.toLowerCase() && r.lastName.toLowerCase() === lastName.toLowerCase()
    );
    if (exists) {
      const proceed = window.confirm(`A researcher named "${firstName} ${lastName}" already exists. Add a duplicate?`);
      if (!proceed) return;
    }

    setCopyDialogData({
      firstName,
      lastName,
      email: member.email || '',
      roleInProject: member.roleInProject || '',
    });
    setCopyDialogOpen(true);
  };

  const handleResearcherConfirm = (researcher: Omit<ParticipantResearcher, 'id' | 'createdAt' | 'updatedAt'>) => {
    onAddResearcher(researcher);
    toast.success('Added to researchers list');
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
        const { data: inviteResult, error: inviteError } = await supabase.functions.invoke('invite-user', {
          body: {
            email: member.email.toLowerCase(),
            fullName: member.fullName,
            proposalId,
            proposalAcronym,
          },
        });

        if (inviteError) throw inviteError;

        if (inviteResult?.userId) {
          await supabase.from('user_roles').insert([{
            user_id: inviteResult.userId,
            proposal_id: proposalId,
            role: 'editor' as const,
          }]);
        }

        onUpdateMember(member.id, { accessGranted: true, accessGrantedRole: 'editor' });
        toast.success(`Invitation sent to ${member.email}`);
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
          <div className="space-y-3">
            {members.map((member) => {
              const nameParts = member.fullName.split(' ');
              const firstName = nameParts[0] || '';
              const lastName = nameParts.slice(1).join(' ') || '';
              const initials = `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();
              const isMCP = member.isPrimaryContact;
              const wantsAccess = member.wantsPlatformAccess;
              const hasAccess = member.accessGranted;
              const isGranting = grantingId === member.id;
              const isRevoking = revokingId === member.id;
              const isEditing = editingId === member.id;

              return (
                <div key={member.id}>
                  {isEditing ? (
                    <div className={`p-3 rounded-lg space-y-3 ${isMCP ? 'bg-primary/5 border border-primary/20' : 'bg-muted/50'}`}>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs">First name *</Label>
                          <Input
                            value={editForm.firstName}
                            onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Last name *</Label>
                          <Input
                            value={editForm.lastName}
                            onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Email *</Label>
                          <Input
                            type="email"
                            value={editForm.email}
                            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Phone</Label>
                          <Input
                            type="tel"
                            value={editForm.phone}
                            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                            className="h-8 text-sm"
                          />
                        </div>
                        {editForm.email.trim().toLowerCase() !== editForm.originalEmail.toLowerCase() && (
                          <div className="space-y-1 sm:col-span-2">
                            <Label className="text-xs">Should this person have access to the proposal? *</Label>
                            <Select
                              value={editForm.wantsPlatformAccess || ''}
                              onValueChange={(v) => setEditForm({ ...editForm, wantsPlatformAccess: v as 'yes' | 'no' })}
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="Select..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="no">No</SelectItem>
                                <SelectItem value="yes">Yes</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCancelEdit}>
                          <X className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={() => handleSaveEdit(member.id)}>
                          <Check className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className={`flex items-center justify-between p-3 rounded-lg ${isMCP ? 'bg-primary/5 border border-primary/20' : 'bg-muted/50'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isMCP ? 'bg-primary/20' : 'bg-primary/10'}`}>
                          <span className="text-sm font-medium text-primary">{initials}</span>
                        </div>
                        <div>
                          <p className="font-medium flex items-center gap-1.5">
                            {firstName} {lastName}
                            {isMCP && (
                              <Badge variant="default" className="text-[10px] h-4 px-1.5">MCP</Badge>
                            )}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {member.email || 'No email'}
                            {member.roleInProject ? ` · ${member.roleInProject}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {/* Edit */}
                        {canEdit && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground"
                                onClick={() => handleStartEdit(member)}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit contact</TooltipContent>
                          </Tooltip>
                        )}

                        {/* MCP toggle — only show if this member is MCP or no MCP exists */}
                        {canEdit && (isMCP || !hasMCP) && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`h-7 w-7 ${isMCP ? 'text-primary' : 'text-muted-foreground'}`}
                                onClick={() => handleSetMCP(member.id)}
                              >
                                <Crown className={`w-4 h-4 ${isMCP ? 'fill-primary' : ''}`} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{isMCP ? 'Remove as main contact' : 'Set as main contact person'}</TooltipContent>
                          </Tooltip>
                        )}

                        {/* Copy to researchers */}
                        {canEdit && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground"
                                onClick={() => handleCopyToResearchers(member)}
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Copy to researchers list</TooltipContent>
                          </Tooltip>
                        )}

                        {/* Access management (owners/coordinators only) */}
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
                                      onClick={() => handleRevokeAccess(member)}
                                      disabled={isRevoking}
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
                                onClick={() => handleGrantAccess(member)}
                                disabled={isGranting || !member.email}
                              >
                                {isGranting ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                                Give access
                              </Button>
                            )}
                          </>
                        )}

                        {/* Delete */}
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive h-7 w-7"
                            onClick={() => setDeleteConfirm({ id: member.id, name: member.fullName })}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* MCP expanded details */}
                  {isMCP && (
                    <MCPDetailFields
                      participant={participant}
                      onUpdate={onUpdateParticipant}
                      canEdit={canEdit}
                    />
                  )}
                </div>
              );
            })}
          </div>
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

        {copyDialogData && (
          <CopyToResearcherDialog
            open={copyDialogOpen}
            onOpenChange={setCopyDialogOpen}
            initialData={copyDialogData}
            onConfirm={handleResearcherConfirm}
            participantId={participant.id}
            nextOrderIndex={researchers.length}
          />
        )}
      </CardContent>
    </Card>
  );
}
