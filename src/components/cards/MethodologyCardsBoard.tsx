import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQuery } from '@tanstack/react-query';
import { Eye, EyeOff, GripVertical, History, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { EditorChrome, EditorFeatureBar } from '@/components/EditorChrome';
import { FormattingToolbar } from '@/components/RichTextEditor';
import { PartBCrossRefControls } from '@/components/PartBCrossRefControls';
import { MethodologyRichEditor } from '@/components/MethodologyRichEditor';
import {
  MethodologyEditorFocusProvider,
  useMethodologyEditorFocus,
} from '@/components/MethodologyEditorFocusContext';
import { KeyboardShortcutsDialog } from '@/components/KeyboardShortcutsDialog';
import { CardRecycleBinDialog } from '@/components/cards/CardRecycleBinDialog';
import { CardFieldHistoryDialog } from '@/components/cards/CardFieldHistoryDialog';
import { supabase } from '@/integrations/supabase/client';
import { useSectionCards } from '@/hooks/useSectionCards';
import { useCardFieldsForCards } from '@/hooks/useCardFields';
import { useCardMutations } from '@/hooks/useCardMutations';
import { getCaseTypeLabel } from '@/lib/caseTypeLabels';
import type { CardField, ProposalCard } from '@/types/cards';

interface BoardProps {
  proposalId: string;
  sectionId: string;
  canEdit: boolean;
  isCoordinator: boolean;
  proposalAcronym?: string;
  acronymSegments?: { text: string; color: string }[];
}

/* ------------------------------------------------------------------ */
/* Page-wide formatting bar, bound to the last-focused editor          */
/* ------------------------------------------------------------------ */

function CardsToolbar({
  proposalId,
  canEdit,
  isCoordinator,
  proposalAcronym,
  acronymSegments: acronymSegmentsProp,
}: Omit<BoardProps, 'sectionId'>) {
  const { activeEditor } = useMethodologyEditorFocus();

  const acronymSegments =
    acronymSegmentsProp && acronymSegmentsProp.length > 0
      ? acronymSegmentsProp
      : proposalAcronym
        ? [{ text: proposalAcronym, color: '#000000' }]
        : [];

  if (!activeEditor) return null;

  return (
    <div
      onMouseDown={(e) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest('input, textarea, [contenteditable="true"]')) return;
        e.preventDefault();
      }}
    >
      <FormattingToolbar
        editor={activeEditor}
        proposalId={proposalId}
        canManageCustomColors={isCoordinator}
        isPartB
        isReadOnly={!canEdit}
        crossRefDropdown={
          <PartBCrossRefControls
            editor={activeEditor}
            proposalId={proposalId}
            disabled={!canEdit}
            showKeyboardButton={false}
            acronymSegments={acronymSegments}
          />
        }
      />
    </div>
  );
}

function OutsideClickClear({ onClear }: { onClear: () => void }) {
  const { activeEditor, unregister } = useMethodologyEditorFocus();

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        target.closest(
          '[data-editor-chrome], .ProseMirror, [contenteditable="true"], [role="dialog"], [role="alertdialog"], [data-radix-popper-content-wrapper]',
        )
      ) {
        return;
      }
      onClear();
      if (activeEditor) unregister(activeEditor);
    };
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, [activeEditor, unregister, onClear]);

  return null;
}

/* ------------------------------------------------------------------ */
/* Field row                                                           */
/* ------------------------------------------------------------------ */

interface FieldRowProps {
  field: CardField;
  proposalId: string;
  canEdit: boolean;
  isCoordinator: boolean;
  caseTypeLabel?: string;
  onHeadingChange: (field: CardField, heading: string | null) => void;
  onContentChange: (field: CardField, html: string) => void;
  onDelete: (field: CardField) => void;
  onFocusField: (fieldId: string) => void;
  collapsed: boolean;
}

function FieldRow({
  field,
  proposalId,
  canEdit,
  isCoordinator,
  caseTypeLabel,
  onHeadingChange,
  onContentChange,
  onDelete,
  onFocusField,
  collapsed,
}: FieldRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
  });
  const [headingDraft, setHeadingDraft] = useState(field.heading ?? '');
  const headingFocused = useRef(false);
  // The editor is uncontrolled after mount — feed it the loaded value once.
  const initialHtml = useRef(field.contentHtml ?? '');

  useEffect(() => {
    if (!headingFocused.current) setHeadingDraft(field.heading ?? '');
  }, [field.heading]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const isPlaceholder = field.fieldRole === 'case_placeholder';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="space-y-2 rounded-md border border-border p-3"
      onFocusCapture={() => onFocusField(field.id)}
      onMouseDownCapture={() => onFocusField(field.id)}
    >
      <div className="flex items-center gap-2">
        {canEdit && (
          <button
            type="button"
            className="cursor-grab touch-none text-[#2563EB]"
            aria-label="Reorder field"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}

        {isPlaceholder ? (
          <p className="flex-1 text-sm italic text-muted-foreground">
            {caseTypeLabel ?? 'Cases'} table — renders in a later phase
          </p>
        ) : (
          <>
            <Input
              value={headingDraft}
              placeholder="Heading (optional)"
              disabled={!canEdit}
              onFocus={() => {
                headingFocused.current = true;
              }}
              onChange={(e) => setHeadingDraft(e.target.value)}
              onBlur={() => {
                headingFocused.current = false;
                const next = headingDraft.trim();
                if ((field.heading ?? '') !== next) onHeadingChange(field, next || null);
              }}
              className="h-8 flex-1 font-bold"
            />
            {/* Clearing the heading is done by emptying the input, so no ambiguous
                icon sits next to the destructive delete control. */}

            <FieldHistoryButton field={field} canEdit={canEdit} />
            {isCoordinator && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete field"
                    className="h-7 w-7 text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Delete “{field.heading || 'this field'}”?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      It moves to the recycle bin and can be restored.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDelete(field)}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </>
        )}
      </div>

      {!isPlaceholder && (
        <div className={collapsed ? 'hidden' : undefined}>
          <MethodologyRichEditor
            proposalId={proposalId}
            value={initialHtml.current}
            onChange={(html) => onContentChange(field, html)}
            canEdit={canEdit}
            isCoordinator={isCoordinator}
          />
        </div>
      )}
    </div>
  );
}

function FieldHistoryButton({ field, canEdit }: { field: CardField; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Version history"
        className="h-7 w-7"
        onClick={() => setOpen(true)}
      >
        <History className="h-3.5 w-3.5" />
      </Button>
      {open && (
        <CardFieldHistoryDialog
          isOpen
          fieldId={field.id}
          fieldLabel={field.heading || 'Untitled field'}
          canEdit={canEdit}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

interface CardBlockProps {
  card: ProposalCard;
  fields: CardField[];
  proposalId: string;
  canEdit: boolean;
  isCoordinator: boolean;
  draggable: boolean;
  caseTypeLabels: Record<string, string>;
  collapsed: boolean;
  onRename: (card: ProposalCard, title: string | null) => void;
  onToggleVisible: (card: ProposalCard) => void;
  onDeleteCard: (card: ProposalCard) => void;
  onAddField: (card: ProposalCard) => void;
  onReorderFields: (card: ProposalCard, orderedIds: string[]) => void;
  onHeadingChange: (field: CardField, heading: string | null) => void;
  onContentChange: (field: CardField, html: string) => void;
  onDeleteField: (field: CardField) => void;
  onFocusField: (fieldId: string) => void;
}

function CardBlock({
  card,
  fields,
  proposalId,
  canEdit,
  isCoordinator,
  draggable,
  caseTypeLabels,
  collapsed,
  onRename,
  onToggleVisible,
  onDeleteCard,
  onAddField,
  onReorderFields,
  onHeadingChange,
  onContentChange,
  onDeleteField,
  onFocusField,
}: CardBlockProps) {
  const sortable = useSortable({ id: card.id, disabled: !draggable });
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(card.title ?? '');
  const [localFieldOrder, setLocalFieldOrder] = useState<string[] | null>(null);

  const fieldSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  useEffect(() => {
    if (!editingTitle) setTitleDraft(card.title ?? '');
  }, [card.title, editingTitle]);

  useEffect(() => {
    setLocalFieldOrder(null);
  }, [fields]);

  const orderedFields = useMemo(() => {
    if (!localFieldOrder) return fields;
    const byId = new Map(fields.map((f) => [f.id, f]));
    const list = localFieldOrder.map((id) => byId.get(id)).filter(Boolean) as CardField[];
    return list.length === fields.length ? list : fields;
  }, [fields, localFieldOrder]);

  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.6 : card.isVisible ? 1 : 0.6,
  };

  const commitTitle = () => {
    setEditingTitle(false);
    const next = titleDraft.trim();
    if (next !== (card.title ?? '')) onRename(card, next || null);
  };

  const isPlaceholderCard = card.kind === 'references' || card.isSourceFed;

  const handleFieldDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = orderedFields.map((f) => f.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(ids, oldIndex, newIndex);
    setLocalFieldOrder(next);
    onReorderFields(card, next);
  };

  return (
    <div ref={sortable.setNodeRef} style={style}>
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0 py-3">
          {draggable && canEdit ? (
            <button
              type="button"
              className="cursor-grab touch-none text-[#2563EB]"
              aria-label="Reorder card"
              {...sortable.attributes}
              {...sortable.listeners}
            >
              <GripVertical className="h-4 w-4" />
            </button>
          ) : (
            <span className="inline-block h-4 w-4" aria-hidden="true" />
          )}

          <div className="min-w-0 flex-1">
            {isCoordinator && editingTitle ? (
              <Input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitTitle();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setTitleDraft(card.title ?? '');
                    setEditingTitle(false);
                  }
                }}
                className="h-8"
              />
            ) : (
              <h3
                className={`truncate font-bold underline ${isCoordinator ? 'cursor-text' : ''} ${
                  card.title ? '' : 'italic text-muted-foreground no-underline'
                }`}
                onClick={() => isCoordinator && setEditingTitle(true)}
              >
                {card.title ?? 'No title'}
              </h3>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1">
            {!card.isVisible && (
              <Badge variant="secondary" className="text-muted-foreground">
                Hidden
              </Badge>
            )}

            {/* The title is cleared by editing it inline; no icon that could be
                mistaken for the delete control. */}


            {isCoordinator && card.isHideable && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={card.isVisible ? 'Hide card' : 'Show card'}
                onClick={() => onToggleVisible(card)}
              >
                {card.isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </Button>
            )}

            {isCoordinator && card.isDeletable && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete card"
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Delete “{card.title || 'this card'}”?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      The card and its fields move to the recycle bin and can be restored.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDeleteCard(card)}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {isPlaceholderCard ? (
            <p className="text-sm italic text-muted-foreground">Renders in a later phase.</p>
          ) : (
            <>
              <DndContext
                sensors={fieldSensors}
                collisionDetection={closestCenter}
                onDragEnd={handleFieldDragEnd}
              >
                <SortableContext
                  items={orderedFields.map((f) => f.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3">
                    {orderedFields.map((f) => (
                      <FieldRow
                        key={f.id}
                        field={f}
                        proposalId={proposalId}
                        canEdit={canEdit}
                        isCoordinator={isCoordinator}
                        caseTypeLabel={
                          f.placeholderCaseTypeId
                            ? caseTypeLabels[f.placeholderCaseTypeId]
                            : undefined
                        }
                        onHeadingChange={onHeadingChange}
                        onContentChange={onContentChange}
                        onDelete={onDeleteField}
                        onFocusField={onFocusField}
                        collapsed={collapsed}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              {canEdit && (
                <Button variant="outline" size="sm" onClick={() => onAddField(card)}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add field
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Board                                                               */
/* ------------------------------------------------------------------ */

function BoardInner({
  proposalId,
  sectionId,
  canEdit,
  isCoordinator,
  proposalAcronym,
  acronymSegments,
}: BoardProps) {
  const { cards, headCards, freeCards, tailCards, isLoading } = useSectionCards(
    proposalId,
    sectionId,
  );
  const cardIds = useMemo(() => cards.map((c) => c.id), [cards]);
  const { fieldsByCard } = useCardFieldsForCards(cardIds);
  const {
    updateCard,
    reorderCards,
    createField,
    updateField,
    reorderFields,
    deleteCard,
    deleteField,
  } = useCardMutations(proposalId, sectionId);

  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [binOpen, setBinOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [focusedFieldId, setFocusedFieldId] = useState<string | null>(null);

  // Page-wide save state.
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [savedMode, setSavedMode] = useState<'auto' | 'manual'>('auto');
  const [isDirty, setIsDirty] = useState(false);
  const dirtyRef = useRef<Record<string, { cardId: string; html: string }>>({});
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const { data: caseTypes } = useQuery({
    queryKey: ['card-board-case-types', proposalId],
    enabled: !!proposalId,
    queryFn: async () => {
      const { data } = await supabase
        .from('proposal_case_types')
        .select('id, type_code, custom_type_name')
        .eq('proposal_id', proposalId);
      return data ?? [];
    },
  });

  const caseTypeLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of caseTypes ?? []) {
      map[t.id] = getCaseTypeLabel(t.type_code, t.custom_type_name, { plural: true });
    }
    return map;
  }, [caseTypes]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);

  useEffect(() => {
    setLocalOrder(null);
  }, [freeCards.length]);

  const persistField = useCallback(
    async (fieldId: string, cardId: string, html: string) => {
      setSaving(true);
      try {
        await updateField.mutateAsync({ fieldId, cardId, contentHtml: html });
        delete dirtyRef.current[fieldId];
        setLastSaved(new Date());
        if (Object.keys(dirtyRef.current).length === 0) setIsDirty(false);
      } finally {
        setSaving(false);
      }
    },
    [updateField],
  );

  const handleContentChange = (field: CardField, html: string) => {
    dirtyRef.current[field.id] = { cardId: field.cardId, html };
    setIsDirty(true);
    setSavedMode('auto');
    if (timersRef.current[field.id]) clearTimeout(timersRef.current[field.id]);
    timersRef.current[field.id] = setTimeout(() => {
      delete timersRef.current[field.id];
      void persistField(field.id, field.cardId, html);
    }, 800);
  };

  const handleSaveNow = async () => {
    const entries = Object.entries(dirtyRef.current);
    for (const [fieldId, { cardId }] of entries) {
      if (timersRef.current[fieldId]) {
        clearTimeout(timersRef.current[fieldId]);
        delete timersRef.current[fieldId];
      }
      await persistField(fieldId, cardId, dirtyRef.current[fieldId]?.html ?? '');
    }
    setSavedMode('manual');
    setLastSaved(new Date());
    setIsDirty(false);
  };

  const orderedFree = useMemo(() => {
    if (!localOrder) return freeCards;
    const byId = new Map(freeCards.map((c) => [c.id, c]));
    const list = localOrder.map((id) => byId.get(id)).filter(Boolean) as ProposalCard[];
    return list.length === freeCards.length ? list : freeCards;
  }, [freeCards, localOrder]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleCardDragEnd = (event: DragEndEvent) => {
    setIsDragging(false);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = orderedFree.map((c) => c.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(ids, oldIndex, newIndex);
    setLocalOrder(next);
    reorderCards.mutate(next, { onError: () => setLocalOrder(null) });
  };

  const visibleCard = (c: ProposalCard) => c.isVisible || isCoordinator;

  const cardProps = (card: ProposalCard, draggable: boolean) => ({
    card,
    fields: fieldsByCard[card.id] ?? [],
    proposalId,
    canEdit,
    isCoordinator,
    draggable,
    caseTypeLabels,
    collapsed: isDragging,
    onRename: (c: ProposalCard, title: string | null) =>
      updateCard.mutate({ cardId: c.id, title }),
    onToggleVisible: (c: ProposalCard) =>
      updateCard.mutate({ cardId: c.id, isVisible: !c.isVisible }),
    onDeleteCard: (c: ProposalCard) => deleteCard.mutate(c.id),
    onAddField: (c: ProposalCard) => createField.mutate({ cardId: c.id }),
    onReorderFields: (c: ProposalCard, orderedIds: string[]) =>
      reorderFields.mutate({ cardId: c.id, orderedFieldIds: orderedIds }),
    onHeadingChange: (f: CardField, heading: string | null) =>
      updateField.mutate({ fieldId: f.id, cardId: f.cardId, heading }),
    onContentChange: handleContentChange,
    onDeleteField: (f: CardField) => deleteField.mutate({ fieldId: f.id, cardId: f.cardId }),
    onFocusField: setFocusedFieldId,
  });

  if (isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading cards…</p>;
  }

  if (cards.length === 0) {
    return (
      <p className="p-6 text-sm italic text-muted-foreground">
        No cards have been created for this section yet.
      </p>
    );
  }

  return (
    <>
      <OutsideClickClear onClear={() => setFocusedFieldId(null)} />
      <div className="mx-auto w-full max-w-4xl space-y-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-foreground">Methodologies (cards)</h1>
            <p className="text-sm text-muted-foreground">
              Parallel card-model copy of B1.2. The original Methodologies page is unaffected.
            </p>
          </div>
          {isCoordinator && (
            <Button variant="outline" size="sm" onClick={() => setBinOpen(true)}>
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Recycle bin
            </Button>
          )}
        </div>

        <EditorChrome
          proposalId={proposalId}
          featureBar={
            <EditorFeatureBar
              hasFocusedField={!!focusedFieldId}
              saving={saving}
              lastSaved={lastSaved}
              savedMode={savedMode}
              isDirty={isDirty}
              onSaveNow={handleSaveNow}
              onOpenShortcuts={() => setShortcutsOpen(true)}
            />
          }
          formattingBar={
            <CardsToolbar
              proposalId={proposalId}
              canEdit={canEdit}
              isCoordinator={isCoordinator}
              proposalAcronym={proposalAcronym}
              acronymSegments={acronymSegments}
            />
          }
        >
          <div className="space-y-3 pt-4">
            {headCards.filter(visibleCard).map((c) => (
              <CardBlock key={c.id} {...cardProps(c, false)} />
            ))}

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={() => setIsDragging(true)}
              onDragCancel={() => setIsDragging(false)}
              onDragEnd={handleCardDragEnd}
            >
              <SortableContext
                items={orderedFree.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {orderedFree.filter(visibleCard).map((c) => (
                    <CardBlock key={c.id} {...cardProps(c, canEdit)} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {tailCards.filter(visibleCard).map((c) => (
              <CardBlock key={c.id} {...cardProps(c, false)} />
            ))}
          </div>
        </EditorChrome>

        <KeyboardShortcutsDialog isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

        {binOpen && (
          <CardRecycleBinDialog
            isOpen
            proposalId={proposalId}
            sectionId={sectionId}
            onClose={() => setBinOpen(false)}
          />
        )}
      </div>
    </>
  );
}

export function MethodologyCardsBoard(props: BoardProps) {
  return (
    <MethodologyEditorFocusProvider>
      <BoardInner {...props} />
    </MethodologyEditorFocusProvider>
  );
}

export default MethodologyCardsBoard;
