import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { ORGANISATION_CATEGORY_LABELS } from '@/types/proposal';
import { SaveIndicator } from './SaveIndicator';
import { PartAPageLayout } from './PartAPageLayout';

import { CountrySelect } from './CountrySelect';
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
import { OCDSection } from './participant/OCDSection';
import { ParticipantDescriptionsSection } from './participant/ParticipantDescriptionsSection';
import { useOCD } from '@/hooks/useOCD';


// PIC number input: digits only, max 9
function PicNumberInput({ value, onDebouncedChange, disabled }: { value: string; onDebouncedChange: (v: string) => void; disabled: boolean }) {
  const [local, setLocal] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFocused = useRef(false);

  useEffect(() => {
    if (!isFocused.current) setLocal(value);
  }, [value]);

  return (
    <Input
      value={local}
      onChange={(e) => {
        const v = e.target.value.replace(/\D/g, '').slice(0, 9);
        setLocal(v);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => onDebouncedChange(v), 500);
      }}
      onFocus={() => { isFocused.current = true; }}
      onBlur={() => {
        isFocused.current = false;
        if (debounceRef.current) { clearTimeout(debounceRef.current); onDebouncedChange(local); }
      }}
      placeholder="9-digit PIC"
      maxLength={9}
      disabled={disabled}
      required
    />
  );
}

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
  /** Proposal type (RIA, IA, CSA, etc.) */
  proposalType?: string;
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
  proposalType,
}: ParticipantDetailFormProps) {
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // OCD hook
  const ocd = useOCD(proposalId);

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
    descriptions,
    updateDescriptionField,
    descriptionsSaving,
    descriptionsLastSaved,
    descriptionsError,
  } = useParticipantDetails(participant.id, proposalId);


  const members = participantMembers.filter(m => m.participantId === participant.id);

  // GEP eligibility: HES, RES, or PUB organisations from EU Member States or Associated countries
  const showGEPSection = useMemo(() => {
    return isEligibleForGEP(participant.country || '');
  }, [participant.country]);


  const handleFieldUpdate = (field: string, value: unknown) => {
    // No auto-correction of name casing — preserve user input as-is
    setSaving(true);
    onUpdateParticipant(participant.id, { [field]: value });
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('cross-ref-data-changed'));
    }, 100);
    setTimeout(() => {
      setSaving(false);
      setLastSaved(new Date());
    }, 500);
  };


  return (
    <PartAPageLayout
      title={participant.organisationName || 'New Participant'}
      titleNode={
        <h1 className="text-xl font-semibold">
          {participant.organisationName || 'New Participant'}
          {participant.organisationShortName && (
            <span className="text-muted-foreground font-normal ml-2">
              ({participant.organisationShortName})
            </span>
          )}
        </h1>
      }
      titleLeftAdornment={
        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
          <span className="text-lg font-bold text-primary">{participant.participantNumber}</span>
        </div>
      }
      subtitle={
        <p className="text-sm text-muted-foreground">
          {PARTICIPANT_TYPE_LABELS[participant.organisationType]}
          {participant.participantNumber === 1 && (
            <Badge variant="outline" className="ml-2">Coordinator</Badge>
          )}
        </p>
      }
      spacing="space-y-4"
      saveIndicator={canEdit ? <SaveIndicator saving={saving} lastSaved={lastSaved} onSaveNow={() => {}} /> : undefined}
    >


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
                <Label>PIC number *</Label>
                <PicNumberInput
                  value={participant.picNumber || ''}
                  onDebouncedChange={(v) => handleFieldUpdate('picNumber', v)}
                  disabled={!canEdit}
                />
                {participant.picNumber && !/^\d{9}$/.test(participant.picNumber) && (
                  <p className="text-xs text-destructive">PIC must be exactly 9 digits</p>
                )}
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
          hasGenderEqualityPlan={participant.hasGenderEqualityPlan}
          onChangeHasGEP={(v) => handleFieldUpdate('hasGenderEqualityPlan', v)}
          canEdit={canEdit}
        />

        {/* 11. Ownership Control Declaration (shown for all org types; PUB is exempt by default) */}
        <OCDSection
          visible={ocd.requiresOcd}
          templateExists={!!ocd.templatePath}
          hasUploadedOcd={!!ocd.uploads[participant.id]}
          uploadedAt={ocd.uploads[participant.id]?.uploadedAt}
          downloadingPrefilled={ocd.downloadingFor === participant.id}
          onDownloadTemplate={() => ocd.downloadPrefilled(participant.id)}
          onUploadSigned={(file) => ocd.uploadSignedOcd(participant.id, file)}
          onDownloadSigned={ocd.uploads[participant.id] ? () => ocd.downloadSignedOcd(participant.id) : undefined}
          canEdit={canEdit}
          isHorizonEurope={['RIA', 'IA', 'CSA'].includes(proposalType || '')}
          participantId={participant.id}
          isAdmin={canGrant}
          organisationCategory={participant.organisationCategory}
        />

        {/* Participant descriptions — Stage 2a of A2 partner-descriptions feature */}
        <ParticipantDescriptionsSection
          participant={participant}
          descriptions={descriptions}
          onUpdateField={updateDescriptionField}
          saving={descriptionsSaving}
          lastSaved={descriptionsLastSaved}
          saveError={descriptionsError}
          canEdit={canEdit}
          proposalId={proposalId}
          canManageCustomColors={canGrant}
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
    </PartAPageLayout>

  );
}
