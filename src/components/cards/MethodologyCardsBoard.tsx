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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, GripVertical, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import DOMPurify from 'dompurify';
import { supabase } from '@/integrations/supabase/client';
import {
  CardLockProvider,
  cardTitleTargetId,
  fieldTargetId,
  useCardLocks,
  useTargetLock,
} from '@/hooks/useCardLocks';
import { LockHolderBadge } from '@/components/cards/LockHolderBadge';
import { LockTimeoutWarning } from '@/components/cards/LockTimeoutWarning';
import { LostTextDialog, type LostTextPayload } from '@/components/cards/LostTextDialog';
import { useSectionCards, sectionCardsKey } from '@/hooks/useSectionCards';
import { useSectionRecycleBin } from '@/hooks/useSectionRecycleBin';
import { useCardFieldsForCards } from '@/hooks/useCardFields';
import { useCardMutations } from '@/hooks/useCardMutations';
import { getCaseTypeLabel } from '@/lib/caseTypeLabels';
import { jumpToElementId } from '@/lib/jumpToElement';
import type { CardField, CardTextBox, ProposalCard } from '@/types/cards';

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
/* Per-text-box lock wiring                                            */
/* ------------------------------------------------------------------ */

interface LockedBoxOptions {
  /** Current locally typed value, used if the lock race is lost. */
  getTyped: () => string;
  /** Called when another user won the race: revert to authoritative text. */
  onLoseRace: (typed: string, holderName: string | null) => void;
  /** Flushes this text box to the database (used before a timeout release). */
  save?: () => Promise<void>;
  /** Current value, answered to viewers that join mid-edit. */
  snapshot?: () => string;
}

/**
 * Locking for one addressable text box. The lock is taken on the first
 * keystroke, refreshed on every later one, and released on blur.
 */
function useLockedBox(targetId: string, opts: LockedBoxOptions) {
  const { claim, noteKeystroke, release, registerSaver, registerSnapshotSource, stream, useStreamedValue } =
    useCardLocks();
  const { holder, isMine, lockedByOther } = useTargetLock(targetId);
  const streamed = useStreamedValue(targetId, lockedByOther);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const holderRef = useRef(holder);
  holderRef.current = holder;

  useEffect(() => {
    if (!optsRef.current.save) return;
    return registerSaver(targetId, () => optsRef.current.save!());
  }, [registerSaver, targetId]);

  useEffect(() => {
    if (!optsRef.current.snapshot) return;
    return registerSnapshotSource(targetId, () => optsRef.current.snapshot!());
  }, [registerSnapshotSource, targetId]);

  const onType = useCallback(() => {
    noteKeystroke(targetId);
    void claim(targetId).then((ok) => {
      if (!ok) optsRef.current.onLoseRace(optsRef.current.getTyped(), holderRef.current?.userName ?? null);
    });
  }, [claim, noteKeystroke, targetId]);

  const onBlur = useCallback(() => {
    if (isMine) void release(targetId, { save: true });
  }, [isMine, release, targetId]);

  const push = useCallback((html: string) => stream(targetId, html), [stream, targetId]);

  return { holder, isMine, lockedByOther, streamed, onType, onBlur, push };
}
/**
 * Chooses the right dialog for a lost race: the copy-to-backup dialog only
 * when the user genuinely typed something, otherwise a plain "locked" notice.
 */
function lostTextPayload(typed: string, holderName: string | null): LostTextPayload {
  if (isHtmlBlank(typed)) return { text: '', reason: 'blocked', holderName };
  return { text: typed, reason: 'race', holderName };
}



/** Green when held by me, red when held by someone else. */
function lockBorderClass(isMine: boolean, lockedByOther: boolean) {
  if (lockedByOther) return 'border-destructive ring-1 ring-destructive/40';
  if (isMine) return 'border-emerald-600 ring-1 ring-emerald-600/40';
  return '';
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
  onToggleHeading: (field: CardField, enabled: boolean) => void;
  onFocusField: (fieldId: string, textBox: CardTextBox) => void;
  onLostText: (payload: LostTextPayload) => void;
  /** Flushes the content text box immediately (used before a lock release). */
  onFlushContent: (field: CardField, html: string) => Promise<void>;
  /** Bumped when authoritative content is reloaded, to remount the editor. */
  reloadNonce: number;
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
  onToggleHeading,
  onFocusField,
  onLostText,
  onFlushContent,
  reloadNonce,
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

  const contentRef = useRef(field.contentHtml ?? '');
  useEffect(() => {
    initialHtml.current = field.contentHtml ?? '';
    contentRef.current = field.contentHtml ?? '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadNonce]);

  const headerTarget = fieldTargetId(field.id, 'header');
  const contentTarget = fieldTargetId(field.id, 'content');

  // Avoids a duplicate write when blur commits and then releases the lock.
  const lastCommittedHeading = useRef(field.heading ?? '');
  useEffect(() => {
    lastCommittedHeading.current = field.heading ?? '';
  }, [field.heading]);

  const headerLock = useLockedBox(headerTarget, {
    getTyped: () => headingDraft,
    onLoseRace: (typed, holderName) => {
      setHeadingDraft(field.heading ?? '');
      onLostText(lostTextPayload(typed, holderName));
    },
    save: async () => {
      const next = headingDraft.trim();
      if (lastCommittedHeading.current !== next) {
        lastCommittedHeading.current = next;
        onHeadingChange(field, next || null);
      }
    },
    snapshot: () => headingDraft,
  });

  const contentLock = useLockedBox(contentTarget, {
    getTyped: () => contentRef.current,
    onLoseRace: (typed, holderName) => {
      contentRef.current = field.contentHtml ?? '';
      onLostText(lostTextPayload(typed, holderName));
    },
    save: () => onFlushContent(field, contentRef.current),
    snapshot: () => contentRef.current,
  });


  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const isPlaceholder = field.fieldRole === 'case_placeholder';

  return (
    <div
      ref={setNodeRef}
      id={`card-module-${field.id}`}
      style={style}
      className="space-y-2 rounded-md border border-border p-3 transition-shadow"
    >
      <div className="flex items-center gap-2">
        {canEdit && (
          <button
            type="button"
            className="cursor-grab touch-none text-[#2563EB]"
            aria-label="Reorder module"
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
            {field.headingEnabled ? (
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Input
                  value={
                    headerLock.lockedByOther && headerLock.streamed !== null
                      ? headerLock.streamed
                      : headingDraft
                  }
                  placeholder="Header"
                  readOnly={headerLock.lockedByOther}
                  disabled={!canEdit}
                  onFocus={() => {
                    headingFocused.current = true;
                    onFocusField(field.id, 'header');
                  }}
                  onMouseDown={() => onFocusField(field.id, 'header')}
                  onKeyDown={() => {
                    if (!headerLock.lockedByOther) headerLock.onType();
                  }}
                  onChange={(e) => {
                    if (headerLock.lockedByOther) return;
                    setHeadingDraft(e.target.value);
                    headerLock.push(e.target.value);
                  }}
                  onBlur={() => {
                    headingFocused.current = false;
                    const next = headingDraft.trim();
                    if (!headerLock.lockedByOther && lastCommittedHeading.current !== next) {
                      lastCommittedHeading.current = next;
                      onHeadingChange(field, next || null);
                    }
                    headerLock.onBlur();
                  }}
                  className={`h-8 flex-1 font-bold ${lockBorderClass(headerLock.isMine, headerLock.lockedByOther)}`}
                />
                {headerLock.lockedByOther && headerLock.holder && (
                  <LockHolderBadge holder={headerLock.holder} />
                )}
              </div>
            ) : (
              <span className="flex-1" aria-hidden="true" />
            )}

            {canEdit && (
              <div className="flex shrink-0 items-center gap-1.5">
                <Switch
                  id={`include-header-${field.id}`}
                  checked={field.headingEnabled}
                  onCheckedChange={(v) => onToggleHeading(field, v)}
                  className="scale-75"
                />
                <Label
                  htmlFor={`include-header-${field.id}`}
                  className="cursor-pointer whitespace-nowrap text-[11px] text-muted-foreground"
                >
                  Include header
                </Label>
              </div>
            )}

            {canEdit && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete module"
                    className="h-7 w-7 text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Delete “{(field.headingEnabled && field.heading) || 'this module'}”?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      The whole module — both text boxes and their version histories — moves to
                      the recycle bin and can be restored in full.
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

      {!isPlaceholder && contentLock.lockedByOther && contentLock.holder && (
        <div className={collapsed ? 'hidden' : 'flex items-start gap-2'}>
          <div
            className="prose prose-sm min-w-0 flex-1 max-w-none rounded-md border border-destructive px-4 py-2 ring-1 ring-destructive/40"
            aria-readonly="true"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(contentLock.streamed ?? field.contentHtml ?? ''),
            }}
          />
          <LockHolderBadge holder={contentLock.holder} />
        </div>
      )}

      {!isPlaceholder && !contentLock.lockedByOther && (
        <div
          className={
            collapsed
              ? 'hidden'
              : `rounded-md ${contentLock.isMine ? 'ring-1 ring-emerald-600/60' : ''}`
          }
          onFocusCapture={() => onFocusField(field.id, 'content')}
          onMouseDownCapture={() => onFocusField(field.id, 'content')}
          onKeyDownCapture={() => contentLock.onType()}
          onBlurCapture={(e) => {
            const next = e.relatedTarget as Node | null;
            if (next && e.currentTarget.contains(next)) return;
            contentLock.onBlur();
          }}
        >
          <MethodologyRichEditor
            key={`${field.id}-${reloadNonce}`}
            proposalId={proposalId}
            value={initialHtml.current}
            onChange={(html) => {
              contentRef.current = html;
              contentLock.push(html);
              onContentChange(field, html);
            }}
            canEdit={canEdit}
            isCoordinator={isCoordinator}
          />
        </div>
      )}
    </div>
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
  binCount: number;
  onOpenBin: (card: ProposalCard) => void;
  onRename: (card: ProposalCard, title: string | null) => void;
  onToggleVisible: (card: ProposalCard) => void;
  onDeleteCard: (card: ProposalCard) => void;
  onAddField: (card: ProposalCard) => void;
  onReorderFields: (card: ProposalCard, orderedIds: string[]) => void;
  onHeadingChange: (field: CardField, heading: string | null) => void;
  onContentChange: (field: CardField, html: string) => void;
  onDeleteField: (field: CardField) => void;
  onToggleHeading: (field: CardField, enabled: boolean) => void;
  onFocusField: (fieldId: string, textBox: CardTextBox) => void;
  onLostText: (payload: LostTextPayload) => void;
  onFlushContent: (field: CardField, html: string) => Promise<void>;
  reloadNonce: number;
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
  binCount,
  onOpenBin,
  onRename,
  onToggleVisible,
  onDeleteCard,
  onAddField,
  onReorderFields,
  onHeadingChange,
  onContentChange,
  onDeleteField,
  onToggleHeading,
  onFocusField,
  onLostText,
  onFlushContent,
  reloadNonce,
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

  const lastCommittedTitle = useRef(card.title ?? '');
  useEffect(() => {
    lastCommittedTitle.current = card.title ?? '';
  }, [card.title]);

  const titleTarget = cardTitleTargetId(card.id);
  const titleLock = useLockedBox(titleTarget, {
    getTyped: () => titleDraft,
    onLoseRace: (typed) => {
      setTitleDraft(card.title ?? '');
      setEditingTitle(false);
      onLostText({ text: typed, reason: 'race' });
    },
    save: async () => {
      const next = titleDraft.trim();
      if (next !== lastCommittedTitle.current) {
        lastCommittedTitle.current = next;
        onRename(card, next || null);
      }
    },
    snapshot: () => titleDraft,
  });

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
    if (next !== lastCommittedTitle.current) {
      lastCommittedTitle.current = next;
      onRename(card, next || null);
    }
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
    <div ref={sortable.setNodeRef} id={`card-block-${card.id}`} style={style} className="transition-shadow">
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0 py-3">
          {draggable && canEdit ? (
            <button
              type="button"
              className="cursor-grab touch-none text-[#2563EB]"
              aria-label="Reorder block"
              {...sortable.attributes}
              {...sortable.listeners}
            >
              <GripVertical className="h-4 w-4" />
            </button>
          ) : (
            <span className="inline-block h-4 w-4" aria-hidden="true" />
          )}

          <div className="min-w-0 flex-1">
            {isCoordinator && editingTitle && !titleLock.lockedByOther ? (
              <Input
                autoFocus
                value={titleDraft}
                onKeyDownCapture={() => titleLock.onType()}
                onChange={(e) => {
                  setTitleDraft(e.target.value);
                  titleLock.push(e.target.value);
                }}
                onBlur={() => {
                  commitTitle();
                  titleLock.onBlur();
                }}
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
                className={`h-8 ${lockBorderClass(titleLock.isMine, false)}`}
              />
            ) : (
              <div className="flex min-w-0 items-center gap-2">
                <h3
                  className={`truncate font-bold underline ${isCoordinator && !titleLock.lockedByOther ? 'cursor-text' : ''} ${
                    card.title ? '' : 'italic text-muted-foreground no-underline'
                  } ${titleLock.lockedByOther ? 'rounded border border-destructive px-1' : ''}`}
                  onClick={() => isCoordinator && !titleLock.lockedByOther && setEditingTitle(true)}
                >
                  {(titleLock.lockedByOther ? titleLock.streamed : null) ?? card.title ?? 'No title'}
                </h3>
                {titleLock.lockedByOther && titleLock.holder && (
                  <LockHolderBadge holder={titleLock.holder} />
                )}
              </div>
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


            {canEdit && card.isHideable && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={card.isVisible ? 'Hide block' : 'Show block'}
                onClick={() => onToggleVisible(card)}
              >
                {card.isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </Button>
            )}

            {canEdit && binCount > 0 && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open this block's recycle bin"
                title={`${binCount} deleted ${binCount === 1 ? 'module' : 'modules'}`}
                onClick={() => onOpenBin(card)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}

            {canEdit && card.isDeletable && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete block"
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Delete “{card.title || 'this block'}”?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      The block and its modules move to the recycle bin and can be restored.
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
                        onToggleHeading={onToggleHeading}
                        onFocusField={onFocusField}
                        onLostText={onLostText}
                        onFlushContent={onFlushContent}
                        reloadNonce={reloadNonce}
                        collapsed={collapsed}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              {canEdit && (
                <Button variant="outline" size="sm" onClick={() => onAddField(card)}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add module
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
  const queryClient = useQueryClient();
  const cardIds = useMemo(() => cards.map((c) => c.id), [cards]);
  const { fieldsByCard } = useCardFieldsForCards(cardIds);
  const { entries: binEntries } = useSectionRecycleBin(proposalId, sectionId);
  const {
    createCard,

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
  const [moduleBinCardId, setModuleBinCardId] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [focusedBox, setFocusedBox] = useState<{ fieldId: string; textBox: CardTextBox } | null>(
    null,
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [lostText, setLostText] = useState<LostTextPayload | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const { warning } = useCardLocks();

  /** Last known version per text box, for the save-time version check. */
  const versionsRef = useRef<Record<string, number>>({});

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
    for (const list of Object.values(fieldsByCard)) {
      for (const f of list) {
        const ck = `${f.id}:content`;
        const hk = `${f.id}:header`;
        versionsRef.current[ck] = Math.max(versionsRef.current[ck] ?? 0, f.contentVersion);
        versionsRef.current[hk] = Math.max(versionsRef.current[hk] ?? 0, f.headingVersion);
      }
    }
  }, [fieldsByCard]);

  useEffect(() => {
    for (const c of cards) {
      const k = `card:${c.id}:title`;
      versionsRef.current[k] = Math.max(versionsRef.current[k] ?? 0, c.titleVersion);
    }
  }, [cards]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);

  useEffect(() => {
    setLocalOrder(null);
  }, [freeCards.length]);

  /**
   * Version-checked write of one text box. The server rejects the write if the
   * stored value changed since this client loaded it — the backstop that keeps
   * data safe when locking fails (network drop, suspended tab).
   */
  const saveTextBox = useCallback(
    async (
      fieldId: string,
      cardId: string,
      textBox: CardTextBox,
      value: string,
      isAutoSave: boolean,
    ): Promise<boolean> => {
      const key = `${fieldId}:${textBox}`;
      setSaving(true);
      try {
        const { data, error } = await supabase.rpc('save_card_text', {
          p_field_id: fieldId,
          p_text_box: textBox,
          p_value: value,
          p_expected_version: versionsRef.current[key] ?? null,
          p_is_auto_save: isAutoSave,
        });
        if (error) {
          toast.error(error.message || 'Could not save');
          return false;
        }
        const res = (data ?? {}) as { ok?: boolean; conflict?: boolean; version?: number };
        if (res.version) versionsRef.current[key] = res.version;
        if (!res.ok) {
          // Somebody else wrote this text box first — offer a backup copy and
          // reload the authoritative content.
          setLostText({ text: value, reason: 'conflict' });
          delete dirtyRef.current[fieldId];
          queryClient.invalidateQueries({ queryKey: ['card-fields-batch'] });
          setReloadNonce((n) => n + 1);
          return false;
        }
        delete dirtyRef.current[fieldId];
        setLastSaved(new Date());
        if (Object.keys(dirtyRef.current).length === 0) setIsDirty(false);
        queryClient.invalidateQueries({ queryKey: ['card-fields-batch'] });
        return true;
      } finally {
        setSaving(false);
      }
    },
    [queryClient],
  );

  const persistField = useCallback(
    async (fieldId: string, cardId: string, html: string, isAutoSave = true) => {
      await saveTextBox(fieldId, cardId, 'content', html, isAutoSave);
    },
    [saveTextBox],
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
      await persistField(fieldId, cardId, dirtyRef.current[fieldId]?.html ?? '', false);
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

  const focusedFieldLabel = useMemo(() => {
    if (!focusedBox) return '';
    for (const list of Object.values(fieldsByCard)) {
      const found = list.find((f) => f.id === focusedBox.fieldId);
      if (found) return (found.headingEnabled && found.heading) || 'Untitled module';
    }
    return 'Untitled module';
  }, [fieldsByCard, focusedBox]);

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

  /** Deleted modules per live block, for the per-block bin icon. */
  const deletedModulesByCard = useMemo(() => {
    const map: Record<string, number> = {};
    const deletedCardIds = new Set(binEntries.filter((e) => e.targetType === 'card').map((e) => e.targetId));
    for (const e of binEntries) {
      if (e.targetType !== 'field' || !e.parentCardId) continue;
      if (deletedCardIds.has(e.parentCardId)) continue;
      map[e.parentCardId] = (map[e.parentCardId] ?? 0) + 1;
    }
    return map;
  }, [binEntries]);

  /** Scroll a restored/created block or module into view and flash it briefly. */
  const jumpToRestored = useCallback((targetType: 'card' | 'field', targetId: string) => {
    const domId = targetType === 'card' ? `card-block-${targetId}` : `card-module-${targetId}`;
    void jumpToElementId(domId);
  }, []);

  const cardProps = (card: ProposalCard, draggable: boolean) => ({
    card,
    fields: fieldsByCard[card.id] ?? [],
    proposalId,
    canEdit,
    isCoordinator,
    draggable,
    caseTypeLabels,
    collapsed: isDragging,
    binCount: deletedModulesByCard[card.id] ?? 0,
    onOpenBin: (c: ProposalCard) => setModuleBinCardId(c.id),
    onRename: async (c: ProposalCard, title: string | null) => {
      const key = `card:${c.id}:title`;
      const { data, error } = await supabase.rpc('save_card_title', {
        p_card_id: c.id,
        p_title: title ?? '',
        p_expected_version: versionsRef.current[key] ?? null,
      });
      if (error) {
        toast.error(error.message || 'Could not rename the block');
        return;
      }
      const res = (data ?? {}) as { ok?: boolean; version?: number };
      if (res.version) versionsRef.current[key] = res.version;
      if (!res.ok) setLostText({ text: title ?? '', reason: 'conflict' });
      queryClient.invalidateQueries({ queryKey: sectionCardsKey(proposalId, sectionId) });
    },
    onToggleVisible: (c: ProposalCard) =>
      updateCard.mutate({ cardId: c.id, isVisible: !c.isVisible }),
    onDeleteCard: (c: ProposalCard) => deleteCard.mutate(c.id),
    onAddField: (c: ProposalCard) => createField.mutate({ cardId: c.id }),
    onReorderFields: (c: ProposalCard, orderedIds: string[]) =>
      reorderFields.mutate({ cardId: c.id, orderedFieldIds: orderedIds }),
    onHeadingChange: (f: CardField, heading: string | null) =>
      void saveTextBox(f.id, f.cardId, 'header', heading ?? '', false),
    onToggleHeading: (f: CardField, enabled: boolean) =>
      updateField.mutate({ fieldId: f.id, cardId: f.cardId, headingEnabled: enabled }),

    onContentChange: handleContentChange,
    onDeleteField: (f: CardField) => deleteField.mutate({ fieldId: f.id, cardId: f.cardId }),
    onFocusField: (fieldId: string, textBox: CardTextBox) =>
      setFocusedBox({ fieldId, textBox }),
    onLostText: setLostText,
    onFlushContent: async (f: CardField, html: string) => {
      if (timersRef.current[f.id]) {
        clearTimeout(timersRef.current[f.id]);
        delete timersRef.current[f.id];
      }
      if (!dirtyRef.current[f.id]) return;
      await persistField(f.id, f.cardId, html, false);
    },
    reloadNonce,
  });

  if (isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading blocks…</p>;
  }

  if (cards.length === 0) {
    return (
      <p className="p-6 text-sm italic text-muted-foreground">
        No blocks have been created for this section yet.
      </p>
    );
  }

  return (
    <>
      <OutsideClickClear
        onClear={() => {
          setFocusedBox(null);
          setHistoryOpen(false);
        }}
      />
      <div className="mx-auto w-full max-w-4xl space-y-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-foreground">Methodologies (cards)</h1>
            <p className="text-sm text-muted-foreground">
              Parallel block-model copy of B1.2. The original Methodologies page is unaffected.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  createCard.mutate(undefined, {
                    onSuccess: (newCardId) => jumpToRestored('card', newCardId),
                  })
                }
                disabled={createCard.isPending}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add block
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setBinOpen(true)}>
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Recycle bin
              </Button>
            )}
          </div>
        </div>

        <EditorChrome
          proposalId={proposalId}
          featureBar={
            <EditorFeatureBar
              hasFocusedField={!!focusedBox}
              saving={saving}
              lastSaved={lastSaved}
              savedMode={savedMode}
              isDirty={isDirty}
              onSaveNow={handleSaveNow}
              onOpenShortcuts={() => setShortcutsOpen(true)}
              onOpenVersionHistory={() => setHistoryOpen(true)}
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

        {warning && <LockTimeoutWarning secondsLeft={warning.secondsLeft} />}

        <LostTextDialog payload={lostText} onClose={() => setLostText(null)} />

        {historyOpen && focusedBox && (
          <CardFieldHistoryDialog
            isOpen
            proposalId={proposalId}
            fieldId={focusedBox.fieldId}
            textBox={focusedBox.textBox}
            fieldLabel={focusedFieldLabel}
            canEdit={canEdit}
            onClose={() => setHistoryOpen(false)}
          />
        )}

        {binOpen && (
          <CardRecycleBinDialog
            isOpen
            mode="blocks"
            proposalId={proposalId}
            sectionId={sectionId}
            onClose={() => setBinOpen(false)}
            onRestored={jumpToRestored}
          />
        )}

        {moduleBinCardId && (
          <CardRecycleBinDialog
            isOpen
            mode="modules"
            cardId={moduleBinCardId}
            proposalId={proposalId}
            sectionId={sectionId}
            onClose={() => setModuleBinCardId(null)}
            onRestored={jumpToRestored}
          />
        )}
      </div>
    </>
  );
}

export function MethodologyCardsBoard(props: BoardProps) {
  return (
    <MethodologyEditorFocusProvider>
      <CardLockProvider
        proposalId={props.proposalId}
        sectionId={props.sectionId}
        enabled
      >
        <BoardInner {...props} />
      </CardLockProvider>
    </MethodologyEditorFocusProvider>
  );
}

export default MethodologyCardsBoard;
