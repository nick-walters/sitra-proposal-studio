import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Participant, ParticipantMember, ParticipantType, PARTICIPANT_TYPE_LABELS } from '@/types/proposal';
import { InlineGuideline } from './GuidelineBox';
import { SaveIndicator } from './SaveIndicator';
import { CountrySelect } from './CountrySelect';
import { Search, User, Plus, Trash2, Loader2, Building2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface ParticipantDetailFormProps {
  participant: Participant;
  participantMembers: ParticipantMember[];
  onUpdateParticipant: (id: string, updates: Partial<Participant>) => void;
  onDeleteParticipant: (id: string) => void;
  onAddMember: (member: Omit<ParticipantMember, 'id'>) => void;
  onUpdateMember: (id: string, updates: Partial<ParticipantMember>) => void;
  onDeleteMember: (id: string) => void;
  canEdit: boolean;
  canDelete: boolean;
}

// Legal entity types from HE template
const LEGAL_ENTITY_TYPES = [
  'Higher or Secondary Education Establishment',
  'Research Organisation',
  'Private for-profit entity',
  'Public body (excluding Research and Education)',
  'Non-profit (excluding Research and Education)',
  'International organisation',
  'Other',
];

export function ParticipantDetailForm({
  participant,
  participantMembers,
  onUpdateParticipant,
  onDeleteParticipant,
  onAddMember,
  onUpdateMember,
  onDeleteMember,
  canEdit,
  canDelete,
}: ParticipantDetailFormProps) {
  const [picLookupLoading, setPicLookupLoading] = useState(false);
  const [picVerified, setPicVerified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [newMember, setNewMember] = useState({
    fullName: '',
    email: '',
    roleInProject: '',
    personMonths: 0,
    isPrimaryContact: false,
  });
  const [showAddMember, setShowAddMember] = useState(false);

  const members = participantMembers.filter(m => m.participantId === participant.id);

  const handlePicLookup = async () => {
    if (!participant.picNumber) {
      toast.error('Please enter a PIC number');
      return;
    }

    setPicLookupLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('lookup-pic', {
        body: { picNumber: participant.picNumber },
      });

      if (error) throw error;

      if (data.success && data.organisation) {
        const org = data.organisation;
        onUpdateParticipant(participant.id, {
          organisationName: org.legalName,
          organisationShortName: org.shortName || '',
          country: org.countryCode,
          legalEntityType: org.legalEntityType || '',
          isSme: org.isSme || false,
          address: org.city ? `${org.city}, ${org.country}` : org.country,
        });
        setPicVerified(true);
        toast.success(`Found: ${org.legalName}`);
      } else {
        toast.error(data.message || 'PIC not found');
        setPicVerified(false);
      }
    } catch (error) {
      console.error('PIC lookup error:', error);
      toast.error('Failed to look up PIC number');
    } finally {
      setPicLookupLoading(false);
    }
  };

  const handleFieldUpdate = (field: string, value: any) => {
    setSaving(true);
    onUpdateParticipant(participant.id, { [field]: value });
    setTimeout(() => {
      setSaving(false);
      setLastSaved(new Date());
    }, 500);
  };

  const handleAddMember = () => {
    if (!newMember.fullName.trim()) {
      toast.error('Please enter the member name');
      return;
    }
    onAddMember({
      ...newMember,
      participantId: participant.id,
    });
    setNewMember({
      fullName: '',
      email: '',
      roleInProject: '',
      personMonths: 0,
      isPrimaryContact: false,
    });
    setShowAddMember(false);
    toast.success('Team member added');
  };

  return (
    <div className="flex-1 overflow-auto p-6 bg-muted/30">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <span className="text-lg font-bold text-primary">{participant.participantNumber}</span>
            </div>
            <div>
              <h1 className="text-xl font-semibold">
                {participant.organisationName || 'New Participant'}
                {participant.organisationShortName && (
                  <span className="text-muted-foreground font-normal ml-2">
                    ({participant.organisationShortName})
                  </span>
                )}
              </h1>
              <p className="text-sm text-muted-foreground">
                {PARTICIPANT_TYPE_LABELS[participant.organisationType]}
                {participant.participantNumber === 1 && (
                  <Badge variant="outline" className="ml-2">Coordinator</Badge>
                )}
              </p>
            </div>
          </div>
          {canEdit && <SaveIndicator saving={saving} lastSaved={lastSaved} />}
        </div>

        {/* PIC Lookup */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">PIC Lookup</CardTitle>
            <InlineGuideline>
              Enter the 9-digit Participant Identification Code (PIC) from the EC Participant Register to auto-fill organisation details.
            </InlineGuideline>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Input
                  value={participant.picNumber || ''}
                  onChange={(e) => handleFieldUpdate('picNumber', e.target.value)}
                  placeholder="Enter 9-digit PIC number"
                  disabled={!canEdit}
                  className={picVerified ? 'pr-10 border-green-500' : ''}
                />
                {picVerified && (
                  <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
                )}
              </div>
              <Button
                onClick={handlePicLookup}
                disabled={!canEdit || !participant.picNumber || picLookupLoading}
                variant="outline"
                className="gap-2"
              >
                {picLookupLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                Lookup
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Organisation Details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Organisation details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Legal name *</Label>
                <Input
                  value={participant.organisationName || ''}
                  onChange={(e) => handleFieldUpdate('organisationName', e.target.value)}
                  placeholder="Full legal name of the organisation"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Short name</Label>
                <Input
                  value={participant.organisationShortName || ''}
                  onChange={(e) => handleFieldUpdate('organisationShortName', e.target.value)}
                  placeholder="e.g. UH, CNRS"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Participant type</Label>
                <Select
                  value={participant.organisationType}
                  onValueChange={(v) => handleFieldUpdate('organisationType', v)}
                  disabled={!canEdit}
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
                <Label>Legal entity type</Label>
                <Select
                  value={participant.legalEntityType || ''}
                  onValueChange={(v) => handleFieldUpdate('legalEntityType', v)}
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {LEGAL_ENTITY_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Country</Label>
                {canEdit ? (
                  <CountrySelect
                    value={participant.country || ''}
                    onValueChange={(v) => handleFieldUpdate('country', v)}
                  />
                ) : (
                  <Input value={participant.country || ''} disabled />
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Textarea
                value={participant.address || ''}
                onChange={(e) => handleFieldUpdate('address', e.target.value)}
                placeholder="Street, city, postal code"
                className="min-h-[80px]"
                disabled={!canEdit}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id={`sme-${participant.id}`}
                checked={participant.isSme}
                onCheckedChange={(checked) => handleFieldUpdate('isSme', !!checked)}
                disabled={!canEdit}
              />
              <Label htmlFor={`sme-${participant.id}`}>
                This is an SME (Small and Medium-sized Enterprise)
              </Label>
            </div>
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Contact information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>Contact email</Label>
              <Input
                type="email"
                value={participant.contactEmail || ''}
                onChange={(e) => handleFieldUpdate('contactEmail', e.target.value)}
                placeholder="organisation@example.com"
                disabled={!canEdit}
              />
            </div>
          </CardContent>
        </Card>

        {/* Team Members */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Team members
                </CardTitle>
                <CardDescription className="mt-1">
                  Key personnel from this organisation involved in the project
                </CardDescription>
              </div>
              {canEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddMember(!showAddMember)}
                  className="gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Add Member
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {showAddMember && (
              <Card className="border-dashed">
                <CardContent className="pt-4 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Full name *</Label>
                      <Input
                        value={newMember.fullName}
                        onChange={(e) => setNewMember({ ...newMember, fullName: e.target.value })}
                        placeholder="Dr. Jane Smith"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={newMember.email}
                        onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                        placeholder="jane.smith@university.edu"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Role in project</Label>
                      <Input
                        value={newMember.roleInProject}
                        onChange={(e) => setNewMember({ ...newMember, roleInProject: e.target.value })}
                        placeholder="e.g. WP Leader, Researcher"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Person-months</Label>
                      <Input
                        type="number"
                        value={newMember.personMonths || ''}
                        onChange={(e) => setNewMember({ ...newMember, personMonths: parseFloat(e.target.value) || 0 })}
                        placeholder="0"
                        min={0}
                        step={0.5}
                      />
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="primary-contact"
                      checked={newMember.isPrimaryContact}
                      onCheckedChange={(checked) => setNewMember({ ...newMember, isPrimaryContact: !!checked })}
                    />
                    <Label htmlFor="primary-contact">Primary contact for this organisation</Label>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setShowAddMember(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleAddMember}>
                      Add Member
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {members.length === 0 && !showAddMember ? (
              <div className="text-center py-6 text-muted-foreground">
                <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No team members added yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-medium text-primary">
                          {member.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">
                          {member.fullName}
                          {member.isPrimaryContact && (
                            <Badge variant="secondary" className="ml-2 text-xs">Primary</Badge>
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {member.roleInProject || 'Role not specified'}
                          {member.personMonths ? ` • ${member.personMonths} PM` : ''}
                        </p>
                      </div>
                    </div>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => onDeleteMember(member.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Delete Participant */}
        {canDelete && (
          <Card className="border-destructive/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-destructive">Remove participant</h4>
                  <p className="text-sm text-muted-foreground">
                    This will permanently remove this organisation from the proposal.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => onDeleteParticipant(participant.id)}
                >
                  Remove
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}