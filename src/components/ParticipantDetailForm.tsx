import React, { useState, useMemo, useRef, useEffect } from 'react';
import { PartACard } from '@/components/PartACard';
import { PART_A_FIELD_DENSITY } from '@/components/partAFieldDensity';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
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


import { CountrySelect } from './CountrySelect';
import { StorageImage } from './StorageImage';
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
import { ParticipantCrossRefDropdown } from './participant/ParticipantCrossRefDropdown';
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


// ---------------------------------------------------------------------------
// Removing a participant is irreversible and cascades widely. It sits behind a
// collapsed control, well away from the row-level contact/researcher controls,
// and requires the short name to be typed out before it can be confirmed.
// ---------------------------------------------------------------------------
type RemovalCounts = Record<string, number>;

function RemoveParticipantSection({
  participant,
  contactCount,
  researcherCount,
  onConfirmed,
}: {
  participant: Participant;
  contactCount: number;
  researcherCount: number;
  onConfirmed: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [counts, setCounts] = useState<RemovalCounts | null>(null);
  const [loadingCounts, setLoadingCounts] = useState(false);

  const shortName = (participant.organisationShortName || participant.organisationName || '').trim();
  const matches = typed.trim() === shortName && shortName.length > 0;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoadingCounts(true);
      const pid = participant.id;
      const countOf = async (table: string, column: string) => {
        const { count } = await (supabase.from(table as never) as never as {
          select: (c: string, o: { count: 'exact'; head: true }) => {
            eq: (c: string, v: string) => Promise<{ count: number | null }>;
          };
        })
          .select('id', { count: 'exact', head: true })
          .eq(column, pid);
        return count ?? 0;
      };
      const [
        achievements, projects, departments, infrastructure, descriptions,
        personnelRoles, costItems, wpBudget, wpEffort, taskEffort,
        wpLeads, taskLeads, taskParticipations, deliverables, caseLeads,
      ] = await Promise.all([
        countOf('participant_achievements', 'participant_id'),
        countOf('participant_previous_projects', 'participant_id'),
        countOf('participant_departments', 'participant_id'),
        countOf('participant_infrastructure', 'participant_id'),
        countOf('participant_descriptions', 'participant_id'),
        countOf('ls_personnel_roles', 'participant_id'),
        countOf('ls_cost_items', 'participant_id'),
        countOf('ls_wp_budget', 'participant_id'),
        countOf('wp_draft_effort', 'participant_id'),
        countOf('wp_draft_task_effort', 'participant_id'),
        countOf('wp_drafts', 'lead_participant_id'),
        countOf('wp_draft_tasks', 'lead_participant_id'),
        countOf('wp_draft_task_participants', 'participant_id'),
        countOf('wp_draft_deliverables', 'responsible_participant_id'),
        countOf('case_drafts', 'lead_participant_id'),
      ]);
      if (cancelled) return;
      setCounts({
        'Contact persons': contactCount,
        'Researchers': researcherCount,
        'Achievements': achievements,
        'Previous projects': projects,
        'Departments': departments,
        'Infrastructure entries': infrastructure,
        'Description fields': descriptions,
        'Budget personnel roles': personnelRoles,
        'Budget cost items': costItems,
        'Work-package budget rows': wpBudget,
        'Effort entries': wpEffort + taskEffort,
        'Work packages led': wpLeads,
        'Tasks led': taskLeads,
        'Task participations': taskParticipations,
        'Deliverables owned': deliverables,
        'Case studies led': caseLeads,
      });
      setLoadingCounts(false);
    };
    load().catch(() => { if (!cancelled) setLoadingCounts(false); });
    return () => { cancelled = true; };
  }, [open, participant.id, contactCount, researcherCount]);

  return (
    <Card className="border-destructive/40">
      <CardContent className="pt-6">
        <div className="flex flex-col items-start gap-3">
          <div>
            <h4 className="font-medium text-destructive">Remove participant</h4>
            <p className="text-sm text-muted-foreground">
              Removing {shortName || 'this organisation'} permanently destroys its contacts,
              researchers, achievements, previous projects, budget and effort, and removes it from
              every work package, task, deliverable and case study it is attached to. This cannot be
              undone.
            </p>
          </div>
          {!revealed ? (
            <Button variant="outline" size="sm" onClick={() => setRevealed(true)}>
              Show removal controls
            </Button>
          ) : (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => { setTyped(''); setOpen(true); }}
            >
              Remove {shortName || 'participant'} from the proposal
            </Button>
          )}
        </div>

        <AlertDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setTyped(''); }}>
          <AlertDialogContent className="max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {shortName} from the proposal?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-sm">
                  <p>
                    This permanently deletes everything held against this organisation and cannot be
                    undone. The following will be lost:
                  </p>
                  <div className="rounded-md border bg-muted/40 p-3">
                    {loadingCounts || !counts ? (
                      <span className="text-muted-foreground">Counting what would be lost…</span>
                    ) : (
                      <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
                        {Object.entries(counts).map(([label, n]) => (
                          <li key={label} className="flex justify-between gap-2">
                            <span className={n > 0 ? '' : 'text-muted-foreground'}>{label}</span>
                            <span className={n > 0 ? 'font-semibold' : 'text-muted-foreground'}>{n}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <p>
                    To confirm, type the participant’s short name <strong>{shortName}</strong> below.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={shortName}
              aria-label="Type the participant short name to confirm"
              autoComplete="off"
            />
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={!matches}
                onClick={(e) => {
                  if (!matches) { e.preventDefault(); return; }
                  setOpen(false);
                  onConfirmed();
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Remove participant
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
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
  /** Acronym segments for cross-reference insertion */
  acronymSegments?: { text: string; color: string }[];
  /** Callback to return to the A2 participants list */
  onBackToParticipants?: () => void;
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
  acronymSegments,
  onBackToParticipants,
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
    valueChainApplicable,
    setValueChainApplicable,
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
      proposalId={proposalId}
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
      titleRightSlot={
        participant.logoUrl ? (
          <div className="h-12 w-24 shrink-0 flex items-center justify-end">
            <StorageImage
              storedPath={participant.logoUrl}
              alt={`${participant.organisationShortName || participant.organisationName || 'Participant'} logo`}
              className="max-h-12 max-w-full object-contain"
            />
          </div>
        ) : undefined
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
      saveIndicatorLeftSlot={
        onBackToParticipants ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            onClick={onBackToParticipants}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Return to A2: Participants
          </Button>
        ) : undefined
      }
      save={{ saving, lastSaved }}
      formatting={{
        proposalId,
        crossRefDropdown: proposalId
          ? (editor) => (
              <ParticipantCrossRefDropdown
                proposalId={proposalId}
                acronymSegments={acronymSegments}
                editor={editor}
              />
            )
          : undefined,
      }}
    >
      <div className={`${PART_A_FIELD_DENSITY} space-y-4`}>
        {/* 1. Organisation Details */}
        <PartACard
          collapseKey="a2.organisation-details"
          title="Organisation details"
          titleClassName="text-lg"
          contentClassName="space-y-3"
        >
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
              {/* This IS the organisation type chosen at creation (HES, RES,
                  PUB, SME …). It was bound to `legalEntityType`, a column
                  nothing writes at creation and nothing else reads, so the
                  type selected when adding the participant never appeared
                  here and edits made here went nowhere. It reads and writes
                  `organisationCategory`, the column the registry and the add
                  flow populate. */}
              <Label>Organisation type *</Label>
              <Select
                value={participant.organisationCategory || ''}
                onValueChange={(v) => handleFieldUpdate('organisationCategory', v)}
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Street address</Label>
              <DebouncedInput
                value={participant.street || ''}
                onDebouncedChange={(v) => handleFieldUpdate('street', v)}
                placeholder="e.g. Campusvej 55"
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <Label>Postcode</Label>
              <DebouncedInput
                value={participant.postcode || ''}
                onDebouncedChange={(v) => handleFieldUpdate('postcode', v)}
                placeholder="e.g. 5230"
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <Label>City / town</Label>
              <DebouncedInput
                value={participant.town || ''}
                onDebouncedChange={(v) => handleFieldUpdate('town', v)}
                placeholder="e.g. Odense"
                disabled={!canEdit}
              />
            </div>
          </div>
        </PartACard>

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

        {/* Participant descriptions — Stage 2a of A2 partner-descriptions feature */}
        <ParticipantDescriptionsSection
          participant={participant}
          descriptions={descriptions}
          onUpdateField={updateDescriptionField}
          saving={descriptionsSaving}
          lastSaved={descriptionsLastSaved}
          saveError={descriptionsError}
          valueChainApplicable={valueChainApplicable}
          onValueChainApplicableChange={setValueChainApplicable}
          canEdit={canEdit}
          proposalId={proposalId}
          acronymSegments={acronymSegments}
          canManageCustomColors={canGrant}
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




        {/* Remove participant — collapsed, typed-confirmation, left-aligned and
            deliberately far from the contact/researcher row controls */}
        {canDelete && (
          <div className="pt-10 max-w-xl">
            <RemoveParticipantSection
              participant={participant}
              contactCount={members.length}
              researcherCount={researchers.length}
              onConfirmed={() => onDeleteParticipant(participant.id)}
            />
          </div>
      )}

      </div>
    </PartAPageLayout>

  );
}
