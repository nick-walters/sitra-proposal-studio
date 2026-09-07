import { useEffect, useRef, useState } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import { reorderParticipantResearchers } from '@/hooks/useParticipantDetails';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Users, GripVertical, X } from 'lucide-react';
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
import {
  CopyButton,
  FieldDivider,
  ReadValue,
  SelectPlaceholder,
  FIELD_CLASS,
} from './MCPDetailFields';
import {
  ParticipantResearcher,
  CAREER_STAGES,
  CONTACT_TITLES,
  GENDER_OPTIONS,
  IDENTIFIER_TYPES,
} from '@/types/participantDetails';
import { CountrySelect } from '@/components/CountrySelect';

const RESEARCHER_ROLES = ['Leading', 'Team member'] as const;

/** The country picker forced to the shared field height and font. */
const COUNTRY_FIELD_CLASS =
  'h-7 text-sm px-2 font-normal [&>svg]:h-3 [&>svg]:w-3';

/** The editable shape of a researcher card, used for drafts and for edits. */
type ResearcherDraft = {
  title: string;
  firstName: string;
  lastName: string;
  email: string;
  gender: string;
  nationality: string;
  careerStage: string;
  roleInProject: string;
  referenceIdentifier: string;
  identifierType: string;
};

const emptyDraft = (): ResearcherDraft => ({
  title: '',
  firstName: '',
  lastName: '',
  email: '',
  gender: '',
  nationality: '',
  careerStage: '',
  roleInProject: '',
  referenceIdentifier: '',
  identifierType: '',
});

interface ResearchersTableProps {
  researchers: ParticipantResearcher[];
  onAdd: (researcher: Omit<ParticipantResearcher, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdate: (id: string, updates: Partial<ParticipantResearcher>) => void;
  onDelete: (id: string) => void;
  canEdit: boolean;
}

export function ResearchersTable({
  researchers,
  onAdd,
  onUpdate,
  onDelete,
  canEdit,
}: ResearchersTableProps) {
  // A brand-new researcher is a local draft. Nothing is written until the first
  // real value is committed, so an added-then-discarded card leaves no row.
  const [addingResearcher, setAddingResearcher] = useState(false);
  const [orderedResearchers, setOrderedResearchers] = useState(researchers);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    setOrderedResearchers((current) => {
      const currentIds = new Set(current.map((researcher) => researcher.id));
      const hasSameRows = current.length === researchers.length
        && researchers.every((researcher) => currentIds.has(researcher.id));
      if (!hasSameRows) return [...researchers].sort((a, b) => a.orderIndex - b.orderIndex);

      const latestById = new Map(researchers.map((researcher) => [researcher.id, researcher]));
      return current.map((researcher, orderIndex) => ({
        ...latestById.get(researcher.id),
        ...researcher,
        ...(latestById.get(researcher.id) ?? {}),
        orderIndex,
      }));
    });
  }, [researchers]);

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const oldIndex = orderedResearchers.findIndex((researcher) => researcher.id === active.id);
    const newIndex = orderedResearchers.findIndex((researcher) => researcher.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const previous = orderedResearchers;
    const next = arrayMove(previous, oldIndex, newIndex).map((researcher, orderIndex) => ({
      ...researcher,
      orderIndex,
    }));
    setOrderedResearchers(next);
    const persisted = await reorderParticipantResearchers(next);
    if (!persisted) setOrderedResearchers(previous);
  };

  /**
   * The insert for a brand-new researcher. Called by the draft card the moment
   * its first real value is committed, so the typed card survives a reload
   * without any save button, while an untouched card writes nothing.
   */
  const handleCreate = (draft: ResearcherDraft) => {
    onAdd({
      ...draft,
      participantId: '',
      orderIndex: researchers.length,
    } as Omit<ParticipantResearcher, 'id' | 'createdAt' | 'updatedAt'>);
    setAddingResearcher(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="w-5 h-5" />
              Researchers involved in the proposal
            </CardTitle>
            <CardDescription className="mt-1">
              List of researchers who will be involved in the project activities
            </CardDescription>
          </div>
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddingResearcher(true)}
              disabled={addingResearcher}
              className="gap-1"
            >
              <Plus className="w-4 h-4" />
              Add Researcher
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {researchers.length === 0 && !addingResearcher ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No researchers added yet</p>
            <p className="text-xs mt-1">Add researchers who will be involved in the project</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedResearchers.map((researcher) => researcher.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {orderedResearchers.map((researcher) => (
                  <SortableResearcherCard
                    key={researcher.id}
                    researcher={researcher}
                    canEdit={canEdit}
                    onUpdate={onUpdate}
                    onRequestDelete={(id, name) => setDeleteConfirm({ id, name })}
                  />
                ))}
                {addingResearcher && (
                  <NewResearcherCard
                    onCreate={handleCreate}
                    onDiscard={() => setAddingResearcher(false)}
                  />
                )}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Delete Researcher Confirmation */}
        <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove researcher?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove <strong>{deleteConfirm?.name}</strong> from the researchers list? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (deleteConfirm) {
                    onDelete(deleteConfirm.id);
                    setDeleteConfirm(null);
                  }
                }}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

/**
 * One saved researcher card: the contact card's shell, always editable, with
 * the fields sitting between the grip and the delete control.
 */
function SortableResearcherCard({
  researcher,
  canEdit,
  onUpdate,
  onRequestDelete,
}: {
  researcher: ParticipantResearcher;
  canEdit: boolean;
  onUpdate: (id: string, updates: Partial<ParticipantResearcher>) => void;
  onRequestDelete: (id: string, name: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: researcher.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.55 : 1 };

  // A linked researcher mirrors a contact person: title, name and email are
  // owned by the contact card and stay read-only here.
  const linked = !!researcher.memberId;
  const editable = canEdit;

  return (
    <div ref={setNodeRef} style={style}>
      <div className="p-2 rounded-lg bg-primary/5 border border-transparent">
        <div className="flex items-start gap-1">
          <button
            type="button"
            className="mt-1 text-blue-600 cursor-grab active:cursor-grabbing disabled:opacity-40"
            aria-label="Reorder researcher"
            title="Drag to reorder"
            disabled={!canEdit}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="w-4 h-4" />
          </button>

          <div className="flex-1 min-w-0 space-y-1">
            {/* Row 1: Title, First name, Last name, Email, Gender, Nationality */}
            <div className="flex flex-wrap items-stretch gap-1">
              <div className="w-[78px] shrink-0 flex items-stretch gap-0.5">
                <div className="min-w-0 flex-1">
                  {editable && !linked ? (
                    <Select
                      value={researcher.title || ''}
                      onValueChange={(v) => onUpdate(researcher.id, { title: v })}
                    >
                      <SelectTrigger className={FIELD_CLASS} aria-label="Title">
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
                      <ReadValue value={researcher.title} placeholder="Title*" />
                    </div>
                  )}
                </div>
                <FieldDivider />
              </div>

              <div className="min-w-0 flex-1 basis-0 min-w-[96px]">
                <DebouncedTextField
                  value={researcher.firstName || ''}
                  placeholder="First name*"
                  editable={editable && !linked}
                  onCommit={(v) => { if (v.trim()) onUpdate(researcher.id, { firstName: v.trim() }); }}
                />
              </div>
              <div className="min-w-0 flex-1 basis-0 min-w-[96px]">
                <DebouncedTextField
                  value={researcher.lastName || ''}
                  placeholder="Last name*"
                  editable={editable && !linked}
                  onCommit={(v) => { if (v.trim()) onUpdate(researcher.id, { lastName: v.trim() }); }}
                />
              </div>
              <div className="min-w-0 flex-1 basis-0 min-w-[120px]">
                <DebouncedTextField
                  value={researcher.email || ''}
                  placeholder="Email*"
                  type="email"
                  editable={editable && !linked}
                  onCommit={(v) => onUpdate(researcher.id, { email: v })}
                />
              </div>

              <div className="w-[123px] shrink-0 flex items-stretch gap-0.5">
                <div className="min-w-0 flex-1">
                  {editable ? (
                    <Select
                      value={researcher.gender || ''}
                      onValueChange={(v) => onUpdate(researcher.id, { gender: v })}
                    >
                      <SelectTrigger className={FIELD_CLASS} aria-label="Gender">
                        <SelectValue placeholder={<SelectPlaceholder text="Gender*" />} />
                      </SelectTrigger>
                      <SelectContent>
                        {GENDER_OPTIONS.map((g) => (
                          <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex items-center">
                      <ReadValue value={researcher.gender} placeholder="Gender*" />
                    </div>
                  )}
                </div>
                <FieldDivider />
              </div>

              <div className="w-[197px] shrink-0">
                {editable ? (
                  <CountrySelect
                    value={researcher.nationality || ''}
                    onValueChange={(v) => onUpdate(researcher.id, { nationality: v })}
                    placeholder="Nationality*"
                    className={COUNTRY_FIELD_CLASS}
                  />
                ) : (
                  <div className="flex items-center">
                    <ReadValue value={researcher.nationality} placeholder="Nationality*" />
                  </div>
                )}
              </div>
            </div>

            {/* Row 2: Career stage, Role, Reference identifier, Type of identifier */}
            <div className="flex flex-wrap items-stretch gap-1">
              <div className="w-[240px] shrink-0 flex items-stretch gap-0.5">
                <div className="min-w-0 flex-1">
                  {editable ? (
                    <Select
                      value={researcher.careerStage || ''}
                      onValueChange={(v) => onUpdate(researcher.id, { careerStage: v })}
                    >
                      <SelectTrigger className={FIELD_CLASS} aria-label="Career stage">
                        <SelectValue placeholder={<SelectPlaceholder text="Career stage*" />} />
                      </SelectTrigger>
                      <SelectContent>
                        {CAREER_STAGES.map((stage) => (
                          <SelectItem key={stage.value} value={stage.value}>{stage.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex items-center">
                      <ReadValue value={researcher.careerStage} placeholder="Career stage*" />
                    </div>
                  )}
                </div>
                <FieldDivider />
              </div>

              <div className="w-[136px] shrink-0 flex items-stretch gap-0.5">
                <div className="min-w-0 flex-1">
                  {editable ? (
                    <Select
                      value={RESEARCHER_ROLES.includes(researcher.roleInProject as typeof RESEARCHER_ROLES[number]) ? researcher.roleInProject : ''}
                      onValueChange={(v) => onUpdate(researcher.id, { roleInProject: v })}
                    >
                      <SelectTrigger className={FIELD_CLASS} aria-label="Role">
                        <SelectValue placeholder={<SelectPlaceholder text="Role*" />} />
                      </SelectTrigger>
                      <SelectContent>
                        {RESEARCHER_ROLES.map((role) => (
                          <SelectItem key={role} value={role}>{role}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex items-center">
                      <ReadValue value={researcher.roleInProject} placeholder="Role*" />
                    </div>
                  )}
                </div>
                <FieldDivider />
              </div>

              <div className="w-[188px] shrink-0">
                <DebouncedTextField
                  value={researcher.referenceIdentifier || ''}
                  placeholder="Identifier"
                  editable={editable}
                  onCommit={(v) => onUpdate(researcher.id, { referenceIdentifier: v })}
                />
              </div>

              <div className="w-[131px] shrink-0">
                {editable ? (
                  <Select
                    value={researcher.identifierType || ''}
                    onValueChange={(v) => onUpdate(researcher.id, { identifierType: v })}
                  >
                    <SelectTrigger className={FIELD_CLASS} aria-label="Identifier type">
                      <SelectValue placeholder={<SelectPlaceholder text="Identifier type" />} />
                    </SelectTrigger>
                    <SelectContent>
                      {IDENTIFIER_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center">
                    <ReadValue value={researcher.identifierType} placeholder="Identifier type" />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex items-center gap-1">
              {canEdit && !linked && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive h-7 w-7"
                  onClick={() => onRequestDelete(researcher.id, `${researcher.firstName} ${researcher.lastName}`.trim())}
                  aria-label="Delete"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A brand-new researcher: the same card, last in the list and immediately
 * editable. Researcher cards have no save button, so the row is inserted the
 * moment the FIRST value is committed in ANY field — a debounced keystroke,
 * a blur, or a dropdown choice. Everything typed before that moment is held
 * locally and written with that first insert, so nothing is lost. A card that
 * is added and then discarded, or added and left untouched, writes nothing.
 */
function NewResearcherCard({
  onCreate,
  onDiscard,
}: {
  onCreate: (draft: ResearcherDraft) => void;
  onDiscard: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<ResearcherDraft>(emptyDraft);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  /** Records a value and, as soon as anything real is entered, inserts the row. */
  const commit = (field: keyof ResearcherDraft, value: string) => {
    const next = { ...draftRef.current, [field]: value };
    setDraft(next);
    if (value.trim()) onCreate(next);
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
              <div className="w-[78px] shrink-0 flex items-stretch gap-0.5">
                <div className="min-w-0 flex-1">
                  <Select value={draft.title} onValueChange={(v) => commit('title', v)}>
                    <SelectTrigger className={FIELD_CLASS} aria-label="Title">
                      <SelectValue placeholder={<SelectPlaceholder text="Title*" />} />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTACT_TITLES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <FieldDivider />
              </div>
              <div className="min-w-0 flex-1 basis-0 min-w-[96px]">
                <DebouncedTextField
                  value={draft.firstName}
                  placeholder="First name*"
                  editable
                  onCommit={(v) => commit('firstName', v)}
                />
              </div>
              <div className="min-w-0 flex-1 basis-0 min-w-[96px]">
                <DebouncedTextField
                  value={draft.lastName}
                  placeholder="Last name*"
                  editable
                  onCommit={(v) => commit('lastName', v)}
                />
              </div>
              <div className="min-w-0 flex-1 basis-0 min-w-[120px]">
                <DebouncedTextField
                  value={draft.email}
                  placeholder="Email*"
                  type="email"
                  editable
                  onCommit={(v) => commit('email', v)}
                />
              </div>
              <div className="w-[123px] shrink-0 flex items-stretch gap-0.5">
                <div className="min-w-0 flex-1">
                  <Select value={draft.gender} onValueChange={(v) => commit('gender', v)}>
                    <SelectTrigger className={FIELD_CLASS} aria-label="Gender">
                      <SelectValue placeholder={<SelectPlaceholder text="Gender*" />} />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDER_OPTIONS.map((g) => (
                        <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <FieldDivider />
              </div>
              <div className="w-[197px] shrink-0">
                <CountrySelect
                  value={draft.nationality}
                  onValueChange={(v) => commit('nationality', v)}
                  placeholder="Nationality*"
                  className={COUNTRY_FIELD_CLASS}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-stretch gap-1">
              <div className="w-[240px] shrink-0 flex items-stretch gap-0.5">
                <div className="min-w-0 flex-1">
                  <Select value={draft.careerStage} onValueChange={(v) => commit('careerStage', v)}>
                    <SelectTrigger className={FIELD_CLASS} aria-label="Career stage">
                      <SelectValue placeholder={<SelectPlaceholder text="Career stage*" />} />
                    </SelectTrigger>
                    <SelectContent>
                      {CAREER_STAGES.map((stage) => (
                        <SelectItem key={stage.value} value={stage.value}>{stage.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <FieldDivider />
              </div>
              <div className="w-[136px] shrink-0 flex items-stretch gap-0.5">
                <div className="min-w-0 flex-1">
                  <Select value={draft.roleInProject} onValueChange={(v) => commit('roleInProject', v)}>
                    <SelectTrigger className={FIELD_CLASS} aria-label="Role">
                      <SelectValue placeholder={<SelectPlaceholder text="Role*" />} />
                    </SelectTrigger>
                    <SelectContent>
                      {RESEARCHER_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>{role}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <FieldDivider />
              </div>
              <div className="w-[188px] shrink-0">
                <DebouncedTextField
                  value={draft.referenceIdentifier}
                  placeholder="Identifier"
                  editable
                  onCommit={(v) => commit('referenceIdentifier', v)}
                />
              </div>
              <div className="w-[131px] shrink-0">
                <Select value={draft.identifierType} onValueChange={(v) => commit('identifierType', v)}>
                  <SelectTrigger className={FIELD_CLASS} aria-label="Identifier type">
                    <SelectValue placeholder={<SelectPlaceholder text="Identifier type" />} />
                  </SelectTrigger>
                  <SelectContent>
                    {IDENTIFIER_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                onClick={onDiscard}
                aria-label="Discard new researcher"
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

/**
 * One always-editable text field: the contact cards' compact input, with the
 * same copy button and hairline divider, saved on a 350 ms trailing commit and
 * flushed on blur. The server value is only reseeded when the field is
 * unfocused with nothing pending, so a slow write never yanks text away.
 */
function DebouncedTextField({
  value,
  onCommit,
  placeholder,
  editable,
  type = 'text',
}: {
  value: string;
  onCommit: (value: string) => void;
  placeholder: string;
  editable: boolean;
  type?: string;
}) {
  const [local, setLocal] = useState(value ?? '');
  const focusedRef = useRef(false);
  const pendingRef = useRef(false);
  const label = placeholder.replace('*', '');

  const { push, flush } = useDebouncedSave<string>((v) => {
    pendingRef.current = false;
    onCommit(v);
  }, 350);

  useEffect(() => {
    if (!focusedRef.current && !pendingRef.current) {
      setLocal(value ?? '');
    }
  }, [value]);

  return (
    <div className="flex items-stretch gap-0.5">
      {editable ? (
        <Input
          className={FIELD_CLASS}
          type={type}
          placeholder={placeholder}
          aria-label={label}
          value={local}
          onFocus={() => { focusedRef.current = true; }}
          onChange={(e) => {
            setLocal(e.target.value);
            pendingRef.current = true;
            push(e.target.value);
          }}
          onBlur={() => {
            focusedRef.current = false;
            flush();
          }}
        />
      ) : (
        <ReadValue value={local} placeholder={placeholder} />
      )}
      <span className="flex items-center">
        <CopyButton text={local} label={label} />
      </span>
      <FieldDivider />
    </div>
  );
}
