import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Participant, ParticipantMember, ParticipantSummary, PARTICIPANT_TYPE_LABELS } from '@/types/proposal';
import { SaveIndicator } from './SaveIndicator';
import { CountrySelect } from './CountrySelect';
import { PersonAutocomplete } from './PersonAutocomplete';
import { User, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { isEligibleForGEP } from '@/lib/countries';

// Import new participant detail components
import { useParticipantDetails } from '@/hooks/useParticipantDetails';
import { MainContactSection } from './participant/MainContactSection';
import { DependenciesSection } from './participant/DependenciesSection';
import { ResearchersTable } from './participant/ResearchersTable';
import { OrganisationRolesSection } from './participant/OrganisationRolesSection';
import { AchievementsSection } from './participant/AchievementsSection';
import { PreviousProjectsSection } from './participant/PreviousProjectsSection';
import { InfrastructureSection } from './participant/InfrastructureSection';
import { DepartmentsSection } from './participant/DepartmentsSection';
import { GEPSection } from './participant/GEPSection';

interface SelectedPerson {
  id: string;
  full_name: string;
  email: string | null;
  default_role: string | null;
}

interface ParticipantDetailFormProps {
  participant: Participant;
  participantMembers: ParticipantMember[];
  allParticipants?: ParticipantSummary[];
  onUpdateParticipant: (id: string, updates: Partial<Participant>) => void;
  onDeleteParticipant: (id: string) => void;
  onAddMember: (member: Omit<ParticipantMember, 'id'>) => void;
  onUpdateMember: (id: string, updates: Partial<ParticipantMember>) => void;
  onDeleteMember: (id: string) => void;
  canEdit: boolean;
  canDelete: boolean;
}

// Legal entity types aligned with organisation categories
const LEGAL_ENTITY_TYPES = [
  'Higher or secondary education',
  'Research organisation',
  'Private for-profit',
  'Small/medium enterprise',
  'Public body',
  'Non-governmental organisation',
  'Agency or regulatory body',
  'Civil society organisation',
  'International organisation',
  'Other',
];

export function ParticipantDetailForm({
  participant,
  participantMembers,
  allParticipants = [],
  onUpdateParticipant,
  onDeleteParticipant,
  onAddMember,
  onUpdateMember,
  onDeleteMember,
  canEdit,
  canDelete,
}: ParticipantDetailFormProps) {
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [newMember, setNewMember] = useState({
    fullName: '',
    email: '',
    roleInProject: '',
    personMonths: 0,
    isPrimaryContact: false,
  });
  const [selectedPerson, setSelectedPerson] = useState<SelectedPerson | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);

  // Use new participant details hook for extended data
  const {
    loading: detailsLoading,
    researchers,
    organisationRoles,
    achievements,
    previousProjects,
    infrastructure,
    dependencies,
    addResearcher,
    updateResearcher,
    deleteResearcher,
    setOrganisationRole,
    addAchievement,
    updateAchievement,
    deleteAchievement,
    addPreviousProject,
    updatePreviousProject,
    deletePreviousProject,
    addInfrastructure,
    updateInfrastructure,
    deleteInfrastructure,
    addDependency,
    updateDependency,
    deleteDependency,
  } = useParticipantDetails(participant.id);

  const members = participantMembers.filter(m => m.participantId === participant.id);

  // GEP eligibility: HES, RES, or PUB organisations from EU Member States or Associated Countries
  const showGEPSection = useMemo(() => {
    const GEP_ELIGIBLE_CATEGORIES = ['HES', 'RES', 'PUB'];
    const isEligibleCategory = GEP_ELIGIBLE_CATEGORIES.includes(participant.organisationCategory || '');
    const isEligibleCountry = isEligibleForGEP(participant.country || '');
    return isEligibleCategory && isEligibleCountry;
  }, [participant.organisationCategory, participant.country]);

  // Helper to convert to Name Case
  const toNameCase = (str: string) => {
    return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
  };

  const handleFieldUpdate = (field: string, value: unknown) => {
    // Apply name case to legal name and English name
    if ((field === 'organisationName' || field === 'englishName') && typeof value === 'string') {
      value = toNameCase(value);
    }
    setSaving(true);
    onUpdateParticipant(participant.id, { [field]: value });
    setTimeout(() => {
      setSaving(false);
      setLastSaved(new Date());
    }, 500);
  };

  const handleAddMember = async () => {
    if (!newMember.fullName.trim()) {
      toast.error('Please enter the member name');
      return;
    }

    let personId = selectedPerson?.id || null;

    // If no existing person was selected, create a new one in the people table
    if (!personId) {
      const { data: newPerson, error } = await supabase
        .from('people')
        .insert({
          full_name: newMember.fullName.trim(),
          email: newMember.email?.trim() || null,
          default_role: newMember.roleInProject?.trim() || null,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating person:', error);
      } else {
        personId = newPerson.id;
      }
    } else {
      // Update the existing person's details in the central database
      await supabase
        .from('people')
        .update({
          full_name: newMember.fullName.trim(),
          email: newMember.email?.trim() || null,
          default_role: newMember.roleInProject?.trim() || null,
        })
        .eq('id', personId);
    }

    onAddMember({
      ...newMember,
      participantId: participant.id,
      personId: personId,
    });
    setNewMember({
      fullName: '',
      email: '',
      roleInProject: '',
      personMonths: 0,
      isPrimaryContact: false,
    });
    setSelectedPerson(null);
    setShowAddMember(false);
  };

  // Handle person selection from autocomplete
  const handlePersonSelect = (person: SelectedPerson | null) => {
    setSelectedPerson(person);
    if (person) {
      setNewMember({
        ...newMember,
        fullName: person.full_name,
        email: person.email || '',
        roleInProject: person.default_role || '',
      });
    }
  };

  return (
    <div className="flex-1 overflow-auto p-6 bg-muted/30">
      <div className="max-w-7xl mx-auto space-y-6">
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

        {/* 1. Organisation Details */}
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
                  required
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>English name</Label>
                <Input
                  value={participant.englishName || ''}
                  onChange={(e) => handleFieldUpdate('englishName', e.target.value)}
                  placeholder="English name (if legal name is not in English)"
                  disabled={!canEdit}
                />
                <p className="text-xs text-muted-foreground">
                  If the legal name is not in English, provide the English translation here
                </p>
              </div>
              <div className="space-y-2">
                <Label>Short name *</Label>
                <Input
                  value={participant.organisationShortName || ''}
                  onChange={(e) => handleFieldUpdate('organisationShortName', e.target.value)}
                  placeholder="e.g. UH, CNRS"
                  disabled={!canEdit}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Participant type *</Label>
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
                <Label>Legal entity type *</Label>
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
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Street</Label>
                <Input
                  value={participant.street || ''}
                  onChange={(e) => handleFieldUpdate('street', e.target.value)}
                  placeholder="Street address"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Town</Label>
                <Input
                  value={participant.town || ''}
                  onChange={(e) => handleFieldUpdate('town', e.target.value)}
                  placeholder="Town / City"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Postcode</Label>
                <Input
                  value={participant.postcode || ''}
                  onChange={(e) => handleFieldUpdate('postcode', e.target.value)}
                  placeholder="Postcode"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Country *</Label>
                {canEdit ? (
                  <CountrySelect
                    value={participant.country || ''}
                    onValueChange={(v) => handleFieldUpdate('country', v)}
                  />
                ) : (
                  <Input value={participant.country || ''} disabled />
                )}
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <Input
                  value={participant.website || ''}
                  onChange={(e) => handleFieldUpdate('website', e.target.value)}
                  placeholder="https://www.example.org"
                  disabled={!canEdit}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Departments */}
        <DepartmentsSection
          participantId={participant.id}
          organisationStreet={participant.street}
          organisationTown={participant.town}
          organisationPostcode={participant.postcode}
          organisationCountry={participant.country}
          departmentsNotApplicable={participant.departmentsNotApplicable || false}
          onToggleNotApplicable={(v) => handleFieldUpdate('departmentsNotApplicable', v)}
          canEdit={canEdit}
        />

        {/* 2. Links with other participants (Dependencies) */}
        <DependenciesSection
          dependencies={dependencies}
          participants={allParticipants}
          currentParticipantId={participant.id}
          onAdd={addDependency}
          onUpdate={updateDependency}
          onDelete={deleteDependency}
          canEdit={canEdit}
        />

        {/* 3. Main Contact Person (Enhanced) */}
        <MainContactSection
          participant={participant}
          onUpdate={handleFieldUpdate}
          canEdit={canEdit}
        />

        {/* 4. Other Contact Persons / Team Members */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Other contact persons
                </CardTitle>
                <CardDescription className="mt-1">
                  Additional contacts from this organisation for the proposal
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
                  Add Contact
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
                      <Label>First name *</Label>
                      <Input
                        value={newMember.fullName.split(' ')[0] || ''}
                        onChange={(e) => {
                          const lastName = newMember.fullName.split(' ').slice(1).join(' ');
                          setNewMember({ ...newMember, fullName: `${e.target.value} ${lastName}`.trim() });
                        }}
                        placeholder="First name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Last name *</Label>
                      <Input
                        value={newMember.fullName.split(' ').slice(1).join(' ') || ''}
                        onChange={(e) => {
                          const firstName = newMember.fullName.split(' ')[0] || '';
                          setNewMember({ ...newMember, fullName: `${firstName} ${e.target.value}`.trim() });
                        }}
                        placeholder="Last name"
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
                      <Label>Phone</Label>
                      <Input
                        type="tel"
                        value={newMember.roleInProject}
                        onChange={(e) => setNewMember({ ...newMember, roleInProject: e.target.value })}
                        placeholder="+358..."
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setShowAddMember(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleAddMember}>
                      Add Contact
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {members.length === 0 && !showAddMember ? (
              <div className="text-center py-6 text-muted-foreground">
                <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No other contacts added yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {members.map((member) => {
                  const nameParts = member.fullName.split(' ');
                  const firstName = nameParts[0] || '';
                  const lastName = nameParts.slice(1).join(' ') || '';
                  const initials = `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();
                  return (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-sm font-medium text-primary">
                            {initials}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium">
                            {firstName} {lastName}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {member.email || 'No email'}
                            {member.roleInProject ? ` · ${member.roleInProject}` : ''}
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
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 5. Researchers involved in the proposal */}
        <ResearchersTable
          researchers={researchers}
          onAdd={addResearcher}
          onUpdate={updateResearcher}
          onDelete={deleteResearcher}
          canEdit={canEdit}
        />

        {/* 6. Role of participating organisation in the project */}
        <OrganisationRolesSection
          roles={organisationRoles}
          onSetRole={setOrganisationRole}
          canEdit={canEdit}
        />

        {/* 7. List of up to 5 achievements */}
        <AchievementsSection
          achievements={achievements}
          onAdd={addAchievement}
          onUpdate={updateAchievement}
          onDelete={deleteAchievement}
          canEdit={canEdit}
        />

        {/* 8. List of up to 5 previous projects */}
        <PreviousProjectsSection
          projects={previousProjects}
          onAdd={addPreviousProject}
          onUpdate={updatePreviousProject}
          onDelete={deletePreviousProject}
          canEdit={canEdit}
        />

        {/* 9. Description of infrastructure/equipment */}
        <InfrastructureSection
          infrastructure={infrastructure}
          onAdd={addInfrastructure}
          onUpdate={updateInfrastructure}
          onDelete={deleteInfrastructure}
          canEdit={canEdit}
        />

        {/* 10. Gender Equality Plan (Enhanced) */}
        <GEPSection
          showGEPSection={showGEPSection}
        />

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
