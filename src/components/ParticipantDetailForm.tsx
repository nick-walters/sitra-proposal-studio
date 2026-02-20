import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DebouncedInput } from '@/components/ui/debounced-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Participant, ParticipantMember, ParticipantSummary, PARTICIPANT_TYPE_LABELS } from '@/types/proposal';
import { ORGANISATION_CATEGORY_LABELS } from '@/components/ParticipantTable';
import { SaveIndicator } from './SaveIndicator';
import { CountrySelect } from './CountrySelect';
import { User } from 'lucide-react';
import { isEligibleForGEP } from '@/lib/countries';

// Import new participant detail components
import { useParticipantDetails } from '@/hooks/useParticipantDetails';
import { ContactPersonsSection } from './participant/ContactPersonsSection';
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
  /** Can the user grant access (coordinator/owner) */
  canGrant?: boolean;
  /** Proposal ID */
  proposalId?: string;
  /** Proposal acronym */
  proposalAcronym?: string;
}

// Legal entity types use the same ORGANISATION_CATEGORY_LABELS from ParticipantTable

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
  canGrant = false,
  proposalId,
  proposalAcronym,
}: ParticipantDetailFormProps) {
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

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


  return (
    <div className="flex-1 overflow-auto p-6 bg-muted/30">
      <div className="max-w-7xl mx-auto space-y-4">
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
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Legal name *</Label>
                <DebouncedInput
                  value={participant.organisationName || ''}
                  onDebouncedChange={(v) => handleFieldUpdate('organisationName', v)}
                  placeholder="Full legal name of the organisation"
                  disabled={!canEdit}
                  required
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>English name</Label>
                <DebouncedInput
                  value={participant.englishName || ''}
                  onDebouncedChange={(v) => handleFieldUpdate('englishName', v)}
                  placeholder="English name (if legal name is not in English)"
                  disabled={!canEdit}
                />
                <p className="text-xs text-muted-foreground">
                  If the legal name is not in English, provide the English translation here
                </p>
              </div>
              <div className="space-y-2">
                <Label>Short name *</Label>
                <DebouncedInput
                  value={participant.organisationShortName || ''}
                  onDebouncedChange={(v) => handleFieldUpdate('organisationShortName', v)}
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
                    {Object.entries(ORGANISATION_CATEGORY_LABELS).map(([code, label]) => (
                      <SelectItem key={code} value={code}>
                        {code} – {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Street</Label>
                <DebouncedInput
                  value={participant.street || ''}
                  onDebouncedChange={(v) => handleFieldUpdate('street', v)}
                  placeholder="Street address"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Town</Label>
                <DebouncedInput
                  value={participant.town || ''}
                  onDebouncedChange={(v) => handleFieldUpdate('town', v)}
                  placeholder="Town / City"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Postcode</Label>
                <DebouncedInput
                  value={participant.postcode || ''}
                  onDebouncedChange={(v) => handleFieldUpdate('postcode', v)}
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
                <DebouncedInput
                  value={participant.website || ''}
                  onDebouncedChange={(v) => handleFieldUpdate('website', v)}
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

        {/* 3. Contact persons (unified section) */}
        <ContactPersonsSection
          participant={participant}
          members={members}
          onAddMember={onAddMember}
          onUpdateMember={onUpdateMember}
          onDeleteMember={onDeleteMember}
          onUpdateParticipant={(field, value) => handleFieldUpdate(field, value)}
          canEdit={canEdit}
          canGrant={canGrant}
          proposalId={proposalId}
          proposalAcronym={proposalAcronym}
          researchers={researchers}
          onAddResearcher={addResearcher}
        />

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
