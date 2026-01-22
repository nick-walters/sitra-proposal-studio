import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Participant, ParticipantMember, ParticipantType, PARTICIPANT_TYPE_LABELS } from '@/types/proposal';
import { Plus, Trash2, Building2, User, Save, Info } from 'lucide-react';
import { toast } from 'sonner';
import { InlineGuideline } from './GuidelineBox';

interface ParticipantFormProps {
  participants: Participant[];
  participantMembers: ParticipantMember[];
  onAddParticipant: (participant: Omit<Participant, 'id'>) => void;
  onUpdateParticipant: (id: string, updates: Partial<Participant>) => void;
  onDeleteParticipant: (id: string) => void;
  onAddMember: (member: Omit<ParticipantMember, 'id'>) => void;
  onUpdateMember: (id: string, updates: Partial<ParticipantMember>) => void;
  onDeleteMember: (id: string) => void;
  canEditAll: boolean;
  currentUserId?: string;
  proposalId: string;
}

export function ParticipantForm({
  participants,
  participantMembers,
  onAddParticipant,
  onUpdateParticipant,
  onDeleteParticipant,
  onAddMember,
  onUpdateMember,
  onDeleteMember,
  canEditAll,
  currentUserId,
  proposalId,
}: ParticipantFormProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isAddMemberDialogOpen, setIsAddMemberDialogOpen] = useState(false);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [newParticipant, setNewParticipant] = useState({
    organisationName: '',
    organisationShortName: '',
    organisationType: 'beneficiary' as ParticipantType,
    country: '',
    picNumber: '',
    legalEntityType: '',
    isSme: false,
    contactEmail: '',
    address: '',
  });
  const [newMember, setNewMember] = useState({
    fullName: '',
    email: '',
    roleInProject: '',
    personMonths: 0,
    isPrimaryContact: false,
  });

  const handleAddParticipant = () => {
    if (!newParticipant.organisationName) {
      toast.error('Organisation name is required');
      return;
    }

    onAddParticipant({
      ...newParticipant,
      proposalId,
      participantNumber: participants.length + 1,
    });

    setNewParticipant({
      organisationName: '',
      organisationShortName: '',
      organisationType: 'beneficiary',
      country: '',
      picNumber: '',
      legalEntityType: '',
      isSme: false,
      contactEmail: '',
      address: '',
    });
    setIsAddDialogOpen(false);
    toast.success('Participant added');
  };

  const handleAddMember = () => {
    if (!newMember.fullName || !selectedParticipantId) {
      toast.error('Member name is required');
      return;
    }

    onAddMember({
      ...newMember,
      participantId: selectedParticipantId,
    });

    setNewMember({
      fullName: '',
      email: '',
      roleInProject: '',
      personMonths: 0,
      isPrimaryContact: false,
    });
    setIsAddMemberDialogOpen(false);
    toast.success('Team member added');
  };

  const canEditParticipant = (participant: Participant) => {
    if (canEditAll) return true;
    // Check if current user is a member of this participant organisation
    const members = participantMembers.filter((m) => m.participantId === participant.id);
    return members.some((m) => m.userId === currentUserId);
  };

  return (
    <div className="flex-1 overflow-auto p-6 bg-muted/30">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">Part A2: Participants</h1>
            <InlineGuideline>
              Enter organisation details using PIC (Participant Identification Code) from the EC Participant Register. Coordinator is always Participant #1.
            </InlineGuideline>
          </div>
          {canEditAll && (
            <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Add Participant
            </Button>
          )}
        </div>

        {/* Participants List */}
        {participants.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Building2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-medium text-muted-foreground">No participants yet</h3>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Add the first participant organisation to get started
              </p>
              {canEditAll && (
                <Button onClick={() => setIsAddDialogOpen(true)} className="mt-4 gap-2">
                  <Plus className="w-4 h-4" />
                  Add Participant
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {participants.map((participant, index) => {
              const members = participantMembers.filter(
                (m) => m.participantId === participant.id
              );
              const editable = canEditParticipant(participant);

              return (
                <Card key={participant.id}>
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <span className="font-bold text-primary">{index + 1}</span>
                        </div>
                        <div>
                          <CardTitle className="text-lg">
                            {participant.organisationName}
                            {participant.organisationShortName && (
                              <span className="text-muted-foreground font-normal ml-2">
                                ({participant.organisationShortName})
                              </span>
                            )}
                          </CardTitle>
                          <p className="text-sm text-muted-foreground">
                            {PARTICIPANT_TYPE_LABELS[participant.organisationType]}
                          </p>
                        </div>
                      </div>
                      {canEditAll && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => onDeleteParticipant(participant.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Organisation Name</Label>
                        <Input
                          value={participant.organisationName}
                          onChange={(e) =>
                            onUpdateParticipant(participant.id, { organisationName: e.target.value })
                          }
                          disabled={!editable}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Short Name</Label>
                        <Input
                          value={participant.organisationShortName || ''}
                          onChange={(e) =>
                            onUpdateParticipant(participant.id, { organisationShortName: e.target.value })
                          }
                          disabled={!editable}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Type</Label>
                        <Select
                          value={participant.organisationType}
                          onValueChange={(v) =>
                            onUpdateParticipant(participant.id, { organisationType: v as ParticipantType })
                          }
                          disabled={!editable}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(PARTICIPANT_TYPE_LABELS).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>PIC Number</Label>
                        <Input
                          value={participant.picNumber || ''}
                          onChange={(e) =>
                            onUpdateParticipant(participant.id, { picNumber: e.target.value })
                          }
                          placeholder="9-digit PIC"
                          disabled={!editable}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Country</Label>
                        <Input
                          value={participant.country || ''}
                          onChange={(e) =>
                            onUpdateParticipant(participant.id, { country: e.target.value })
                          }
                          disabled={!editable}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Contact Email</Label>
                        <Input
                          type="email"
                          value={participant.contactEmail || ''}
                          onChange={(e) =>
                            onUpdateParticipant(participant.id, { contactEmail: e.target.value })
                          }
                          disabled={!editable}
                        />
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={`sme-${participant.id}`}
                        checked={participant.isSme}
                        onCheckedChange={(checked) =>
                          onUpdateParticipant(participant.id, { isSme: !!checked })
                        }
                        disabled={!editable}
                      />
                      <Label htmlFor={`sme-${participant.id}`}>SME (Small and Medium Enterprise)</Label>
                    </div>

                    {/* Team Members */}
                    <div className="border-t pt-4 mt-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium flex items-center gap-2">
                          <User className="w-4 h-4" />
                          Team Members
                        </h4>
                        {editable && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedParticipantId(participant.id);
                              setIsAddMemberDialogOpen(true);
                            }}
                            className="gap-1"
                          >
                            <Plus className="w-3 h-3" />
                            Add Member
                          </Button>
                        )}
                      </div>

                      {members.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No team members added yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {members.map((member) => (
                            <div
                              key={member.id}
                              className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                  <span className="text-xs font-medium text-primary">
                                    {member.fullName.split(' ').map((n) => n[0]).join('')}
                                  </span>
                                </div>
                                <div>
                                  <p className="font-medium text-sm">{member.fullName}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {member.roleInProject || 'Role not specified'}
                                    {member.personMonths && ` • ${member.personMonths} PM`}
                                  </p>
                                </div>
                              </div>
                              {editable && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => onDeleteMember(member.id)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Add Participant Dialog */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Add Participant</DialogTitle>
              <DialogDescription>
                Add a new participating organisation to the consortium.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="orgName">Organisation Name *</Label>
                <Input
                  id="orgName"
                  value={newParticipant.organisationName}
                  onChange={(e) =>
                    setNewParticipant({ ...newParticipant, organisationName: e.target.value })
                  }
                  placeholder="e.g. University of Helsinki"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="shortName">Short Name</Label>
                  <Input
                    id="shortName"
                    value={newParticipant.organisationShortName}
                    onChange={(e) =>
                      setNewParticipant({ ...newParticipant, organisationShortName: e.target.value })
                    }
                    placeholder="e.g. UH"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={newParticipant.organisationType}
                    onValueChange={(v) =>
                      setNewParticipant({ ...newParticipant, organisationType: v as ParticipantType })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PARTICIPANT_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pic">PIC Number</Label>
                  <Input
                    id="pic"
                    value={newParticipant.picNumber}
                    onChange={(e) =>
                      setNewParticipant({ ...newParticipant, picNumber: e.target.value })
                    }
                    placeholder="9-digit PIC"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    value={newParticipant.country}
                    onChange={(e) =>
                      setNewParticipant({ ...newParticipant, country: e.target.value })
                    }
                    placeholder="e.g. Finland"
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="newSme"
                  checked={newParticipant.isSme}
                  onCheckedChange={(checked) =>
                    setNewParticipant({ ...newParticipant, isSme: !!checked })
                  }
                />
                <Label htmlFor="newSme">SME (Small and Medium Enterprise)</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddParticipant}>Add Participant</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Member Dialog */}
        <Dialog open={isAddMemberDialogOpen} onOpenChange={setIsAddMemberDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Team Member</DialogTitle>
              <DialogDescription>Add a team member to this participant organisation.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="memberName">Full Name *</Label>
                <Input
                  id="memberName"
                  value={newMember.fullName}
                  onChange={(e) => setNewMember({ ...newMember, fullName: e.target.value })}
                  placeholder="e.g. Jane Doe"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="memberEmail">Email</Label>
                <Input
                  id="memberEmail"
                  type="email"
                  value={newMember.email}
                  onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                  placeholder="e.g. jane@example.com"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="memberRole">Role in Project</Label>
                  <Input
                    id="memberRole"
                    value={newMember.roleInProject}
                    onChange={(e) => setNewMember({ ...newMember, roleInProject: e.target.value })}
                    placeholder="e.g. WP Leader"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="memberPM">Person Months</Label>
                  <Input
                    id="memberPM"
                    type="number"
                    value={newMember.personMonths || ''}
                    onChange={(e) =>
                      setNewMember({ ...newMember, personMonths: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="e.g. 12"
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="primaryContact"
                  checked={newMember.isPrimaryContact}
                  onCheckedChange={(checked) =>
                    setNewMember({ ...newMember, isPrimaryContact: !!checked })
                  }
                />
                <Label htmlFor="primaryContact">Primary Contact</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddMemberDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddMember}>Add Member</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
