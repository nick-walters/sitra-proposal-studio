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
import { Eye, EyeOff, GripVertical, Plus, Recycle, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { CitationDialog } from '@/components/CitationDialog';
import { useProposalReferences } from '@/hooks/useProposalReferences';
import { useReferenceData } from '@/lib/referenceData';
import { scheduleCitationInstanceReconcile } from '@/lib/reconcileCitationInstances';
import { MethodologyRichEditor } from '@/components/MethodologyRichEditor';
import {
  MethodologyEditorFocusProvider,
  useMethodologyEditorFocus,
} from '@/components/MethodologyEditorFocusContext';
import { KeyboardShortcutsDialog } from '@/components/KeyboardShortcutsDialog';
import { CardRecycleBinDialog } from '@/components/cards/CardRecycleBinDialog';
import { CardFieldHistoryDialog } from '@/components/cards/CardFieldHistoryDialog';
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
import { type LostTextPayload } from '@/components/cards/LostTextDialog';
import { reportLostTextPayload } from '@/lib/lostTextBus';

/**
 * Rejections are surfaced through the app-level bus rather than board-local
 * state: a save can be rejected AFTER the board unmounts (text flushed while
 * navigating away), and a board-owned dialog cannot render once unmounted.
 */
const setLostText = (payload: LostTextPayload | null) => {
  if (payload) reportLostTextPayload(payload);
};
import { useSectionCards, sectionCardsKey } from '@/hooks/useSectionCards';
import { ReferencesBlock } from './ReferencesBlock';
import { useSectionCitedReferences } from '@/hooks/useSectionCitedReferences';
import { SourceFedBlock } from '@/components/cards/SourceFedBlock';
import LinkedActivitiesTable from '@/components/LinkedActivitiesTable';
import { useLinkedActivities } from '@/hooks/useLinkedActivities';
import { CasesTableLiveView } from '@/components/CasesTableNodeView';
import { RefDataProvider } from '@/lib/refDataContext';
import { CardFigureBlock } from '@/components/cards/CardFigureBlock';
import { AddBlockDialog, type NewBlockChoice } from '@/components/cards/AddBlockDialog';
import { useSectionRecycleBin } from '@/hooks/useSectionRecycleBin';
import { useCardFieldsForCards } from '@/hooks/useCardFields';
import { useCardMutations } from '@/hooks/useCardMutations';
import { getCaseTypeLabel } from '@/lib/caseTypeLabels';
import { jumpToElementId } from '@/lib/jumpToElement';
import { isHtmlBlank } from '@/lib/htmlBlank';
import { useUserRole } from '@/hooks/useUserRole';
import { TypstPreviewDialog } from '@/components/cards/TypstPreviewDialog';

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
  const [citationOpen, setCitationOpen] = useState(false);
  const {
    references: proposalReferences,
    isLoading: referencesLoading,
    addReference,
    updateReference,
    findExistingReference,
    getNextCitationNumber,
  } = useProposalReferences(proposalId);
  const { data: refData } = useReferenceData(proposalId);

  // Same insertion path as the legacy section editor: the reference is minted
  // server-side if new, and the stable internal id — never a display number —
  // is what goes onto the node. The display number is resolved at render time
  // by the numbering module, like every other surface.
  const handleInsertCitation = useCallback(
    async (
      reference: Parameters<React.ComponentProps<typeof CitationDialog>['onInsertCitation']>[0],
      formattedCitation: string,
      citationNumber: number,
    ) => {
      const editor = activeEditor;
      if (!editor || editor.isDestroyed) return;
      const existing = findExistingReference(reference);
      let refKey = existing?.ref_key ?? citationNumber;
      if (!existing) {
        const saved = await addReference(reference, formattedCitation, citationNumber);
        if (!saved) {
          toast.error('Failed to save reference. Citation was not inserted.');
          return;
        }
        refKey = saved.ref_key;
      }
      const citationType = editor.schema.nodes.citation;
      if (!citationType) return;
      const node = citationType.create({ citationNumber: refKey });
      const tr = editor.state.tr
        .replaceSelectionWith(node, false)
        .setMeta('trackChangesInternal', true)
        .scrollIntoView();
      editor.view.focus();
      editor.view.dispatch(tr);
    },
    [activeEditor, addReference, findExistingReference],
  );

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
        onOpenCitationDialog={canEdit ? () => setCitationOpen(true) : undefined}
        crossRefDropdown={
          <>
            <PartBCrossRefControls
              editor={activeEditor}
              proposalId={proposalId}
              disabled={!canEdit}
              showKeyboardButton={false}
              acronymSegments={acronymSegments}
            />
          </>
        }
      />
      <CitationDialog
        isOpen={citationOpen}
        onClose={() => setCitationOpen(false)}
        onInsertCitation={handleInsertCitation}
        proposalReferences={proposalReferences}
        isLoadingReferences={referencesLoading}
        nextCitationNumber={getNextCitationNumber()}
        onUpdateReference={updateReference}
        citationDisplayOrder={refData?.citationNumbers}
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

  // A browser fires editor blur when the WINDOW loses focus (alt-tab, desktop
  // switch, clicking another browser). That must never surrender the lock —
  // only a genuine in-app focus move away from this box does. The deferred
  // `document.hasFocus()` check distinguishes the two.
  const onBlur = useCallback(() => {
    if (!isMine) return;
    window.setTimeout(() => {
      if (!document.hasFocus()) return; // window/app blur — keep the lock
      void release(targetId, { save: true });
    }, 0);
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



/**
 * Green when held by me, red when held by someone else.
 * The `focus-visible:` overrides matter: shadcn inputs paint the ordinary blue
 * focus ring on focus, which would otherwise win over the green lock border
 * exactly when the holder is typing.
 */
function lockBorderClass(isMine: boolean, lockedByOther: boolean) {
  if (lockedByOther) return 'border-destructive ring-1 ring-destructive/40';
  if (isMine)
    return 'border-emerald-600 ring-1 ring-emerald-600/40 focus-visible:border-emerald-600 focus-visible:ring-emerald-600/60 focus-visible:ring-offset-0';
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
  /** 0-based caption letter for case-study placeholder tables. */
  caseLetterIndex?: number;
}

function FieldRow({
  field,
  proposalId,
  canEdit,
  isCoordinator,
  onHeadingChange,
  onContentChange,
  onDelete,
  onToggleHeading,
  onFocusField,
  onLostText,
  onFlushContent,
  reloadNonce,
  collapsed,
  caseLetterIndex,
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
  /** False until the user focuses this editor — blocks mount-time writes. */
  const touchedRef = useRef(false);
  useEffect(() => {
    initialHtml.current = field.contentHtml ?? '';
    contentRef.current = field.contentHtml ?? '';
    touchedRef.current = false;
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

  // Header mirroring — same rule as the content box below. Keep the last
  // streamed value so that when the holder moves on, the header settles on
  // their final text instead of snapping back to the pre-stream draft (the
  // saved value only arrives later, on the next query refetch).
  const mirroredHeading = useRef<string | null>(null);
  if (headerLock.lockedByOther && headerLock.streamed !== null) {
    mirroredHeading.current = headerLock.streamed;
  }
  const wasHeaderLocked = useRef(false);
  useEffect(() => {
    if (headerLock.lockedByOther) {
      wasHeaderLocked.current = true;
      return;
    }
    if (!wasHeaderLocked.current) return;
    wasHeaderLocked.current = false;
    if (mirroredHeading.current !== null) {
      setHeadingDraft(mirroredHeading.current);
      lastCommittedHeading.current = mirroredHeading.current.trim();
    }
  }, [headerLock.lockedByOther]);
  const headingView = headerLock.streamed ?? mirroredHeading.current ?? headingDraft;



  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const isPlaceholder = field.fieldRole === 'case_placeholder';

  // While another user holds the lock the same editor instance stays mounted
  // (non-editable) and mirrors their live text; when the lock is released the
  // last mirrored value is kept so the box does not snap back to stale text.
  const lockedView = contentLock.lockedByOther
    ? (contentLock.streamed ?? field.contentHtml ?? '')
    : null;
  const mirroredHtml = useRef(initialHtml.current);
  if (lockedView !== null) mirroredHtml.current = lockedView;
  const contentViewHtml = lockedView ?? mirroredHtml.current;


  return (
    <div
      ref={setNodeRef}
      id={`card-module-${field.id}`}
      style={style}
      className="space-y-2 rounded-md border border-border p-3 transition-shadow"
    >
      <div className="flex items-center gap-1">
        {canEdit && (
          <button
            type="button"
            className="shrink-0 cursor-grab touch-none rounded active:cursor-grabbing hover:bg-muted"
            aria-label="Reorder module"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4 text-blue-500" />
          </button>
        )}


        {isPlaceholder ? (
          <div className={collapsed ? 'hidden' : 'min-w-0 flex-1'}>
            <RefDataProvider proposalId={proposalId}>
              <CasesTableLiveView
                proposalId={proposalId}
                caseTypeId={field.placeholderCaseTypeId ?? null}
                letterIndex={caseLetterIndex ?? 0}
              />
            </RefDataProvider>
          </div>
        ) : (
          <>
            {field.headingEnabled ? (
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {headerLock.lockedByOther ? (
                  // Read-only surface: a plain element, so no caret can be
                  // placed, while the text stays selectable for copying.
                  <div
                    className="h-7 flex-1 select-text truncate rounded-md border border-destructive bg-background px-2.5 py-0.5 text-sm font-bold ring-1 ring-destructive/40"
                    aria-readonly="true"
                  >
                    {headingView}
                  </div>
                ) : (
                  <Input
                    value={headingDraft}
                    placeholder="Header"
                    disabled={!canEdit}
                    onFocus={() => {
                      headingFocused.current = true;
                      onFocusField(field.id, 'header');
                    }}
                    onMouseDown={() => onFocusField(field.id, 'header')}
                    onKeyDown={() => headerLock.onType()}
                    onChange={(e) => {
                      setHeadingDraft(e.target.value);
                      headerLock.push(e.target.value);
                    }}
                    onBlur={() => {
                      headingFocused.current = false;
                      const next = headingDraft.trim();
                      if (lastCommittedHeading.current !== next) {
                        lastCommittedHeading.current = next;
                        onHeadingChange(field, next || null);
                      }
                      headerLock.onBlur();
                    }}
                    className={`h-7 flex-1 px-2.5 font-bold ${lockBorderClass(headerLock.isMine, false)}`}
                  />
                )}
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

      {!isPlaceholder && (
        <div className={collapsed ? 'hidden' : `flex items-start gap-2 ${canEdit ? 'ml-[20px]' : ''}`}>
          <div
            className={`min-w-0 flex-1 rounded-md ${
              contentLock.lockedByOther
                ? 'border border-destructive ring-1 ring-destructive/40'
                : contentLock.isMine
                  ? 'ring-1 ring-emerald-600/60'
                  : ''
            }`}
            onFocusCapture={() => {
              if (contentLock.lockedByOther) return;
              // Mount-time normalisation by the editor must never count as an
              // edit — only content changed after the user focused the box does.
              touchedRef.current = true;
              onFocusField(field.id, 'content');
            }}
            onMouseDownCapture={() => {
              if (contentLock.lockedByOther) return;
              onFocusField(field.id, 'content');
            }}
            onKeyDownCapture={() => {
              if (contentLock.lockedByOther) return;
              contentLock.onType();
            }}
            onBlurCapture={(e) => {
              const next = e.relatedTarget as Node | null;
              if (next && e.currentTarget.contains(next)) return;
              contentLock.onBlur();
            }}
          >
            <MethodologyRichEditor
              key={`${field.id}-${reloadNonce}`}
              proposalId={proposalId}
              value={contentViewHtml}
              onChange={(html) => {
                // A non-holder never contributes content: the editor is
                // non-editable, and any programmatic normalisation it emits
                // while showing someone else's live text must be discarded.
                if (contentLock.lockedByOther) return;
                contentRef.current = html;
                if (!touchedRef.current) return;
                contentLock.push(html);
                onContentChange(field, html);
              }}
              canEdit={canEdit && !contentLock.lockedByOther}
              isCoordinator={isCoordinator}
              activeRingClass={
                contentLock.isMine
                  ? 'border-emerald-600 ring-1 ring-emerald-600/60'
                  : 'border-primary ring-1 ring-primary/40'
              }
            />
          </div>
          {contentLock.lockedByOther && contentLock.holder && (
            <LockHolderBadge holder={contentLock.holder} />
          )}
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
  /** Caption letters for case-study placeholder modules, keyed by field id. */
  caseLetterByFieldId: Record<string, number>;
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
  /** "Table 1.2.a." / "Figure 1.2.a." for table and figure blocks. */
  captionLabel?: string;
  /** Section declares that figures and tables are always full width (B3.1). */
  figuresFullWidth: boolean;
}

function CardBlock({
  card,
  fields,
  proposalId,
  canEdit,
  isCoordinator,
  draggable,
  caseTypeLabels,
  caseLetterByFieldId,
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
  captionLabel,
  figuresFullWidth,
}: CardBlockProps) {
  const sortable = useSortable({ id: card.id, disabled: !draggable });
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(card.title ?? '');
  const [localFieldOrder, setLocalFieldOrder] = useState<string[] | null>(null);

  // Linked-activities block: the controller lives here so its Add/Restore
  // buttons can sit in the block header with the other blocks' controls.
  const isLinkedActivities = card.sourceKey === 'b12.linked_activities' && !card.isSourceFed;
  const linkedActivities = useLinkedActivities(isLinkedActivities ? proposalId : '');
  const [activityBinOpen, setActivityBinOpen] = useState(false);

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
    onLoseRace: (typed, holderName) => {
      setTitleDraft(card.title ?? '');
      setEditingTitle(false);
      onLostText(lostTextPayload(typed, holderName));
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

  // Title mirroring — as for module headers and content boxes: keep the last
  // streamed value after the holder releases, so the heading does not appear
  // to empty out while the saved value is still in flight.
  const mirroredTitle = useRef<string | null>(null);
  if (titleLock.lockedByOther && titleLock.streamed !== null) {
    mirroredTitle.current = titleLock.streamed;
  }
  const [titleView, setTitleView] = useState<string | null>(null);
  const wasTitleLocked = useRef(false);
  useEffect(() => {
    if (titleLock.lockedByOther) {
      wasTitleLocked.current = true;
      return;
    }
    if (!wasTitleLocked.current) return;
    wasTitleLocked.current = false;
    if (mirroredTitle.current !== null) {
      setTitleView(mirroredTitle.current);
      setTitleDraft(mirroredTitle.current);
      lastCommittedTitle.current = mirroredTitle.current.trim();
    }
  }, [titleLock.lockedByOther]);
  // The authoritative value, once it lands, takes over again.
  useEffect(() => {
    setTitleView(null);
  }, [card.title]);

  const displayedTitle =
    (titleLock.lockedByOther ? (titleLock.streamed ?? mirroredTitle.current) : titleView) ??
    card.title ??
    null;


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
  // Authored, but backed by its own relational table rather than card fields:
  // the block renders the same editor as the old methodologies page.
  const isLinkedActivitiesCard = card.sourceKey === 'b12.linked_activities' && !card.isSourceFed;
  // Only authored text cards grow new modules; source-fed, figure and
  // linked-activities blocks have a fixed structure.
  const canAddModule =
    canEdit && !isPlaceholderCard && !isLinkedActivitiesCard && card.kind !== 'figure';

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
        <CardHeader className="relative flex flex-row items-center gap-1.5 space-y-0 px-5 py-3">
          {/* Grip sits in the header padding, out of flow, so the block title
              starts at the same left edge as the module boxes below it. */}
          {draggable && canEdit && (
            <button
              type="button"
              className="absolute left-0.5 top-1/2 shrink-0 -translate-y-1/2 cursor-grab touch-none rounded active:cursor-grabbing hover:bg-muted"
              aria-label="Reorder block"
              {...sortable.attributes}
              {...sortable.listeners}
            >
              <GripVertical className="h-4 w-4 text-blue-500" />
            </button>
          )}
          {/* Figure blocks carry no title: the caption under the figure is the
              only label, so a block title would duplicate it. */}
          <div className="min-w-0 flex-1">
            {card.kind === 'figure' ? null : isCoordinator && editingTitle && !titleLock.lockedByOther ? (
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
                    displayedTitle ? '' : 'italic text-muted-foreground no-underline'
                  } ${titleLock.lockedByOther ? 'rounded border border-destructive px-1' : ''}`}
                  onClick={() => isCoordinator && !titleLock.lockedByOther && setEditingTitle(true)}
                >
                  {displayedTitle ?? 'No title'}
                </h3>
                {titleLock.lockedByOther && titleLock.holder && (
                  <LockHolderBadge holder={titleLock.holder} />
                )}
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1">
            {/* The title is cleared by editing it inline; no icon that could be
                mistaken for the delete control. */}

            {canEdit && card.isHideable && (
              // Two-state toggle (mock-evaluation model switch style): green
              // knob on the left with an eye = visible, red knob on the right
              // with a struck-through eye = hidden. No separate chip.
              <button
                type="button"
                role="switch"
                aria-checked={!card.isVisible}
                aria-label={card.isVisible ? 'Block visible — click to hide' : 'Block hidden — click to show'}
                title={card.isVisible ? 'Visible' : 'Hidden'}
                onClick={() => onToggleVisible(card)}
                className="relative h-5 w-9 shrink-0 rounded-full border border-input bg-background transition-colors"
              >
                <span
                  className="absolute left-0 top-1/2 flex h-3.5 w-3.5 items-center justify-center rounded-full shadow transition-transform"
                  style={{
                    backgroundColor: card.isVisible ? '#16a34a' : '#dc2626',
                    transform: `translateY(-50%) translateX(${card.isVisible ? 3 : 19}px)`,
                  }}
                >
                  {card.isVisible ? (
                    <Eye className="h-2.5 w-2.5 text-white" strokeWidth={2.5} />
                  ) : (
                    <EyeOff className="h-2.5 w-2.5 text-white" strokeWidth={2.5} />
                  )}
                </span>
              </button>
            )}

            {isLinkedActivitiesCard && canEdit && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    linkedActivities
                      .addActivity()
                      .catch(() => toast.error('Could not add the activity'))
                  }
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add
                </Button>
                {linkedActivities.deletedActivities.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Restore activity (${linkedActivities.deletedActivities.length} deleted)`}
                    onClick={() => setActivityBinOpen(true)}
                  >
                    <Recycle className="mr-1 h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} />
                    Restore
                  </Button>
                )}
              </>
            )}

            {canAddModule && (
              <Button
                variant="ghost"
                size="sm"
                aria-label="Add module"
                onClick={() => onAddField(card)}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add
              </Button>
            )}

            {canEdit && binCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Restore module (${binCount} deleted)`}
                onClick={() => onOpenBin(card)}
              >
                <Recycle className="mr-1 h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} />
                Restore
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

        <CardContent className="space-y-3 px-5">
          {card.kind === 'references' ? (
            <ReferencesBlock proposalId={proposalId} sectionId={card.sectionId} />
          ) : isLinkedActivitiesCard ? (
            <LinkedActivitiesTable
              proposalId={proposalId}
              canEdit={canEdit}
              isCoordinator={isCoordinator}
              controller={linkedActivities}
            />
          ) : isPlaceholderCard ? (
            <SourceFedBlock
              proposalId={proposalId}
              sourceKey={card.sourceKey}
              kind={card.kind}
            />
          ) : card.kind === 'figure' ? (
            <CardFigureBlock
              cardId={card.id}
              proposalId={proposalId}
              canEdit={canEdit}
              isCoordinator={isCoordinator}
              fullWidthOnly={figuresFullWidth}
              captionLabel={captionLabel ?? 'Figure.'}
            />
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
                        caseLetterIndex={caseLetterByFieldId[f.id] ?? 0}
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

            </>
          )}
        </CardContent>

        <Dialog open={activityBinOpen} onOpenChange={setActivityBinOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Restore activity</DialogTitle>
              <DialogDescription>
                Deleted linked activities are kept here. Restoring brings the row back with all of
                its content.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[320px]">
              <div className="space-y-1 p-1">
                {linkedActivities.deletedActivities.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {a.acronym || <span className="italic text-muted-foreground">No acronym</span>}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        linkedActivities
                          .restoreActivity(a.id)
                          .then(() => {
                            if (linkedActivities.deletedActivities.length === 1)
                              setActivityBinOpen(false);
                          })
                          .catch(() => toast.error('Could not restore the activity'))
                      }
                    >
                      <RotateCcw className="mr-1 h-3.5 w-3.5" />
                      Restore
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Board                                                               */
/* ------------------------------------------------------------------ */

/** The cards board is the B1.2 methodologies section. */
const SECTION_CAPTION_NUMBER = '1.2';

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

  /**
   * Section-level rule, read off the template rather than a hardcoded section
   * id: B3.1 declares that every figure and table is full width, so pairing
   * and width adjustment are not offered there.
   */
  const { data: figuresFullWidth = false } = useQuery({
    queryKey: ['section-figures-full-width', sectionId],
    enabled: !!sectionId,
    queryFn: async () => {
      const { data } = await supabase
        .from('proposal_template_sections')
        .select('figures_full_width')
        .eq('id', sectionId)
        .maybeSingle();
      return data?.figures_full_width ?? false;
    },
  });

  // Structural changes (add / delete / restore / reorder of blocks and
  // modules) made by other sessions. Content already streams; this covers the
  // shape of the board so nobody has to refresh.
  useEffect(() => {
    if (!proposalId) return;
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: sectionCardsKey(proposalId, sectionId) });
      queryClient.invalidateQueries({ queryKey: ['card-fields-batch'] });
      queryClient.invalidateQueries({ queryKey: ['card-recycle-bin', proposalId] });
      // Citation numbers and per-section reference lists depend on card
      // visibility/order/deletion and field order/content as well as the card
      // list itself. Keep those derived views on the same realtime signal.
      queryClient.invalidateQueries({ queryKey: ['reference-data', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['section-citation-sources', proposalId] });
    };
    const channel = supabase
      .channel(`card-structure:${proposalId}:${sectionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'card_fields', filter: `proposal_id=eq.${proposalId}` },
        invalidate,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'proposal_cards', filter: `section_id=eq.${sectionId}` },
        invalidate,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'card_deletions', filter: `proposal_id=eq.${proposalId}` },
        invalidate,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [proposalId, sectionId, queryClient]);

  const {
    createCard,
    createFigureCard,

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
  // Temporary Phase 5 control: platform owners only.
  const { isAdminOrOwner } = useUserRole();
  const [typstOpen, setTypstOpen] = useState(false);
  const [addBlockOpen, setAddBlockOpen] = useState(false);
  const [moduleBinCardId, setModuleBinCardId] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [focusedBox, setFocusedBox] = useState<{ fieldId: string; textBox: CardTextBox } | null>(
    null,
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const { warning, locks, myUserId } = useCardLocks();

  /**
   * Live view of the lock table for the save path: this client must never
   * write to a text box held by somebody else, whatever the version check says.
   */
  const locksRef = useRef(locks);
  locksRef.current = locks;
  const myUserIdRef = useRef(myUserId);
  myUserIdRef.current = myUserId;
  const heldByOther = useCallback((targetId: string) => {
    const holder = locksRef.current[targetId];
    return !!holder && holder.userId !== myUserIdRef.current;
  }, []);


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
      // Defence in depth: never write a text box held by another user.
      if (heldByOther(fieldTargetId(fieldId, textBox))) {
        delete dirtyRef.current[fieldId];
        return false;
      }
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
          // reload the authoritative content. Nothing typed ⇒ no dialog.
          if (!isHtmlBlank(value)) setLostText({ text: value, reason: 'conflict' });
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
    [heldByOther, queryClient],
  );


  const persistField = useCallback(
    async (fieldId: string, cardId: string, html: string, isAutoSave = true) => {
      await saveTextBox(fieldId, cardId, 'content', html, isAutoSave);
      // Keep the derived citation index in step with the saved HTML.
      scheduleCitationInstanceReconcile({ proposalId, fieldId, cardId, html });
    },
    [saveTextBox, proposalId],
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

  // A references block appears only when the section cites something. It stays
  // undeletable and unhideable; it simply renders nothing when empty.
  const { hasAny: sectionCitesAnything } = useSectionCitedReferences(proposalId, sectionId);
  const visibleCard = (c: ProposalCard) =>
    (c.kind !== 'references' || sectionCitesAnything) && (c.isVisible || isCoordinator);

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

  /** Deleted blocks in this section, for the page-level bin button. */
  const deletedBlockCount = useMemo(
    () => binEntries.filter((e) => e.targetType === 'card').length,
    [binEntries],
  );


  /** Scroll a restored/created block or module into view and flash it briefly. */
  const jumpToRestored = useCallback((targetType: 'card' | 'field', targetId: string) => {
    const domId = targetType === 'card' ? `card-block-${targetId}` : `card-module-${targetId}`;
    void jumpToElementId(domId);
  }, []);

  // Figure blocks are labelled per section in document order (a, b, c…).
  const captionLabels = useMemo(() => {
    const ordered = [...headCards, ...freeCards, ...tailCards];
    const labels: Record<string, string> = {};
    let figureIndex = 0;
    for (const card of ordered) {
      // Tables are captioned inside the text block that contains them, by the
      // editor's own caption sequence — only figures get a block-level label.
      if (card.kind === 'figure') {
        labels[card.id] = `Figure ${SECTION_CAPTION_NUMBER}.${String.fromCharCode(97 + figureIndex)}.`;
        figureIndex += 1;
      }
    }
    return labels;
  }, [headCards, freeCards, tailCards]);

  /**
   * Case-study placeholder tables are lettered per section in document order
   * (a, b, c…), like figure block labels. Hidden blocks do not burn a letter.
   */
  const caseLetterByFieldId = useMemo(() => {
    const map: Record<string, number> = {};
    let idx = 0;
    for (const card of [...headCards, ...orderedFree, ...tailCards]) {
      if (!visibleCard(card)) continue;
      for (const f of fieldsByCard[card.id] ?? []) {
        if (f.fieldRole === 'case_placeholder') {
          map[f.id] = idx;
          idx += 1;
        }
      }
    }
    return map;
    // visibleCard derives from sectionCitesAnything and isCoordinator.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headCards, orderedFree, tailCards, fieldsByCard, sectionCitesAnything, isCoordinator]);

  const handleCreateBlock = (choice: NewBlockChoice) => {
    const onSuccess = (newCardId: string) => {
      setAddBlockOpen(false);
      jumpToRestored('card', newCardId);
    };
    if (choice.kind === 'figure') {
      createFigureCard.mutate(undefined, { onSuccess });
    } else {
      createCard.mutate(undefined, { onSuccess });
    }
  };

  const cardProps = (card: ProposalCard, draggable: boolean) => ({
    card,
    captionLabel: captionLabels[card.id],
    figuresFullWidth,
    fields: fieldsByCard[card.id] ?? [],
    caseLetterByFieldId,
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
      if (heldByOther(cardTitleTargetId(c.id))) return;
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
      if (!res.ok && (title ?? '').trim()) setLostText({ text: title ?? '', reason: 'conflict' });

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
                onClick={() => setAddBlockOpen(true)}
                disabled={createCard.isPending || createFigureCard.isPending}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add block
              </Button>
            )}
            {canEdit && deletedBlockCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                aria-label={`Restore block (${deletedBlockCount})`}
                onClick={() => setBinOpen(true)}
              >
                <Recycle className="mr-1 h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} />
                Restore block ({deletedBlockCount})
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
              onPreview={isAdminOrOwner ? () => setTypstOpen(true) : undefined}
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

        <AddBlockDialog
          open={addBlockOpen}
          onOpenChange={setAddBlockOpen}
          onCreate={handleCreateBlock}
          isPending={createCard.isPending || createFigureCard.isPending}
        />

        <KeyboardShortcutsDialog isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

        {warning && <LockTimeoutWarning secondsLeft={warning.secondsLeft} />}

        {historyOpen && focusedBox && (
          <CardFieldHistoryDialog
            isOpen
            proposalId={proposalId}
            fieldId={focusedBox.fieldId}
            textBox={focusedBox.textBox}
            fieldLabel={focusedFieldLabel}
            canEdit={canEdit}
            onClose={() => setHistoryOpen(false)}
            onReverted={() => jumpToRestored('field', focusedBox.fieldId)}
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

        {typstOpen && (
          <TypstPreviewDialog
            open
            onOpenChange={setTypstOpen}
            proposalId={proposalId}
            sectionId={sectionId}
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
