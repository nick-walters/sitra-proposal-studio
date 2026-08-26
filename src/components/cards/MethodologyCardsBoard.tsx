import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LazyRichField } from '@/components/participant/LazyRichField';
import { HEADING_TITLE_FIELD_EXTENSIONS } from '@/components/wp/wpDraftFieldExtensions';
import { ensureRichHtml, displayRichHtml } from '@/lib/richTextUpgrade';
import { htmlToPlainText } from '@/lib/htmlToPlainText';
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
import {
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  ChevronUp,
  Download,
  Eye,
  EyeOff,
  GripVertical,
  Pencil,
  Plus,
  Recycle,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tip } from '@/components/ui/control-tip';

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
import { EditorToolbars } from "@/components/editor/EditorToolbars";
import { FormattingToolbar } from '@/components/RichTextEditor';
import { PartBCrossRefControls } from '@/components/PartBCrossRefControls';
import { CitationDialog } from '@/components/CitationDialog';
import { useProposalReferences } from '@/hooks/useProposalReferences';
import { useReferenceData } from '@/lib/referenceData';
import { scheduleCitationInstanceReconcile } from '@/lib/reconcileCitationInstances';
import type { Editor } from '@tiptap/core';
import { MethodologyRichEditor } from '@/components/MethodologyRichEditor';
import { ImpactSummaryRowControls } from '@/components/cards/ImpactSummaryRowControls';
import { IMPACT_SUMMARY_KEY } from '@/lib/cards/impactSummaryRows';

import {
  MethodologyEditorFocusProvider,
  useMethodologyEditorFocus,
} from '@/components/MethodologyEditorFocusContext';
import { KeyboardShortcutsDialog } from '@/components/KeyboardShortcutsDialog';
import { CardRecycleBinDialog } from '@/components/cards/CardRecycleBinDialog';
import { CardFieldHistoryDialog } from '@/components/cards/CardFieldHistoryDialog';
import { GuidelinesDialog } from '@/components/GuidelinesDialog';
import { useCardGuidelines, useSectionCriteria } from '@/hooks/useCardGuidelines';
import { useProposalTemplateVersion } from '@/hooks/useProposalTemplateVersion';

import { useFocusedGuidelineKey } from '@/hooks/useFocusedGuidelineKey';
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
import { B32BlockMirrors, b32BlockHasMirrors } from '@/components/cards/B32BlockMirrors';
import { MilestonesEditor, RisksEditor } from '@/components/ProposalMilestonesRisksManager';
import LinkedActivitiesTable from '@/components/LinkedActivitiesTable';
import { useLinkedActivities } from '@/hooks/useLinkedActivities';
import { CasesTableLiveView } from '@/components/CasesTableNodeView';
import { captionLetter, countCaptionSlots } from '@/lib/cards/captionSlots';
import type { CaptionNumbering } from '@/extensions/CaptionAutoNumber';
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
import { useCardCollapse } from '@/hooks/useCardCollapse';
import { useCardFigureSummaries } from '@/hooks/useCardFigureSummaries';
import { TypstPreviewDialog } from '@/components/cards/TypstPreviewDialog';
import {
  PageSearchProvider,
  usePageSearch,
  usePageSearchSource,
} from '@/lib/findReplace/PageSearchProvider';
import type { FieldSaveOutcome, SearchableField } from '@/lib/findReplace/types';
import { PageFindReplacePanel } from '@/components/findReplace/PageFindReplacePanel';


import type { CardField, CardTextBox, ProposalCard } from '@/types/cards';
import { useB32Conditions } from '@/hooks/useB32Conditions';
import { useB31UnmetSourceBlocks, b31UnmetReason } from '@/hooks/useB31UnmetSourceBlocks';
import { resolveB32Condition, b32UnmetReason } from '@/lib/cards/b32Conditions';

interface BoardProps {
  proposalId: string;
  sectionId: string;
  sectionNumber?: string;
  canEdit: boolean;
  isCoordinator: boolean;
  proposalAcronym?: string;
  acronymSegments?: { text: string; color: string }[];
}

/* ------------------------------------------------------------------ */
/* Citation dialog for the board, bound to the last-focused editor      */
/* ------------------------------------------------------------------ */

function CardsCitationDialogHost({
  proposalId,
  proposalAcronym,
  acronymSegments: acronymSegmentsProp,
  citationOpen,
  setCitationOpen,
}: Omit<BoardProps, 'sectionId'> & {
  citationOpen: boolean;
  setCitationOpen: (open: boolean) => void;
}) {
  const { activeEditor } = useMethodologyEditorFocus();
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
    <>
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
    </>
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

/** Blocks whose modules are fixed by the template and cannot be deleted. */
const UNDELETABLE_MODULE_CARD_KEYS = new Set(['b11.maturity']);

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
  onToggleVisible: (field: CardField, visible: boolean) => void;
  onFocusField: (fieldId: string, textBox: CardTextBox) => void;
  onLostText: (payload: LostTextPayload) => void;
  /** Flushes the content text box immediately (used before a lock release). */
  onFlushContent: (field: CardField, html: string) => Promise<void>;
  /** Bumped when authoritative content is reloaded, to remount the editor. */
  reloadNonce: number;
  collapsed: boolean;
  /** 0-based caption letter for case-study placeholder tables. */
  caseLetterIndex?: number;
  /** Section caption sequences this text box starts from (derived, uneditable). */
  captionNumbering?: CaptionNumbering | null;
  /** Section number without the "B" prefix, for the cases-table caption. */
  captionSectionNumber?: string;
  /** Template key of the owning block, e.g. 'b21.impact_summary'. */
  cardTemplateKey?: string | null;
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
  onToggleVisible,
  onFocusField,
  onLostText,
  onFlushContent,
  reloadNonce,
  collapsed,
  caseLetterIndex,
  captionNumbering,
  captionSectionNumber,
  cardTemplateKey,

}: FieldRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
  });
  const [headingDraft, setHeadingDraft] = useState(field.heading ?? '');
  // The rich field emits its final value and blurs within the same tick, so
  // the blur handler reads the draft from a ref rather than from state.
  const headingDraftRef = useRef(field.heading ?? '');
  const setHeadingDraftBoth = (v: string) => {
    headingDraftRef.current = v;
    setHeadingDraft(v);
  };
  const headingFocused = useRef(false);
  // The editor is uncontrolled after mount — feed it the loaded value once.
  const initialHtml = useRef(field.contentHtml ?? '');

  useEffect(() => {
    if (!headingFocused.current) setHeadingDraftBoth(field.heading ?? '');
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
    getTyped: () => headingDraftRef.current,
    onLoseRace: (typed, holderName) => {
      setHeadingDraftBoth(field.heading ?? '');
      onLostText(lostTextPayload(typed, holderName));
    },
    save: async () => {
      const next = headingDraftRef.current.trim();
      if (lastCommittedHeading.current !== next) {
        lastCommittedHeading.current = next;
        onHeadingChange(field, next || null);
      }
    },
    snapshot: () => headingDraftRef.current,
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
      setHeadingDraftBoth(mirroredHeading.current);
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
  // Card fields can mount before their asynchronously loaded/template-seeded
  // content arrives. Keep an untouched editor's source in step with that
  // authoritative prop; otherwise it remains permanently initialised from the
  // first empty render, so CaptionAutoNumber has no caption paragraph to walk.
  // Once the user has focused the field, the live editor owns the draft and a
  // query refresh must not replace it.
  if (!touchedRef.current && lockedView === null) {
    mirroredHtml.current = field.contentHtml ?? '';
    contentRef.current = field.contentHtml ?? '';
  }
  const contentViewHtml = lockedView ?? mirroredHtml.current;

  // B2.1 impact summary: the six-column table is stored as two stacked
  // three-column tables in this one text box, so rows are added and removed in
  // both parts together — as ProseMirror transactions on the LIVE document, so
  // nothing typed since mount is lost and the change joins TipTap's history.
  const isImpactSummary = cardTemplateKey === IMPACT_SUMMARY_KEY;
  const contentEditor = useRef<Editor | null>(null);
  const [rowTick, setRowTick] = useState(0);
  // The page-like editing surface is now the standard for every text module
  // in every Part B block. Case-study placeholder modules are not text
  // modules: they render a live table, so they keep the plain module frame.
  const isDocumentSurface = !isPlaceholder;

  // The module's H3 header. On the page-styled surface it is not a form input
  // above the page: it is the first field ON the page, sharing its white
  // background, its typography and its growth behaviour.
  const headerField = field.headingEnabled ? (
    <div
      className={
        // On the page surface the header is an inline H4, so its field sizes
        // to its own text rather than filling the column.
        isDocumentSurface
          ? 'inline-flex max-w-full items-start gap-2'
          : 'flex min-w-0 flex-1 items-center gap-2'
      }
    >
      {headerLock.lockedByOther ? (
        // Read-only surface: a plain element, so no caret can be
        // placed, while the text stays selectable for copying.
        <div
          className={
            isDocumentSurface
              ? 'doc-surface-heading doc-surface-heading-inline select-text border border-destructive ring-1 ring-destructive/40 [&_p]:m-0'
              : 'h-7 flex-1 select-text truncate rounded-md border border-destructive bg-background px-2.5 py-0.5 text-sm font-bold italic ring-1 ring-destructive/40 [&_p]:m-0 [&_p]:inline'
          }
          aria-readonly="true"
          dangerouslySetInnerHTML={{ __html: displayRichHtml(headingView) }}
        />
      ) : (
        // Single-line rich text, baseline formatting only.
        <LazyRichField
          singleLine
          proposalId={proposalId}
          value={ensureRichHtml(headingDraft)}
          placeholder="Header"
          disabled={!canEdit}
          minHeight={isDocumentSurface ? '16px' : '28px'}
          documentSurface={isDocumentSurface}
          placeholderHideOnFocus={isDocumentSurface}
          className={
            isDocumentSurface
              ? `doc-surface-heading doc-surface-heading-inline ${lockBorderClass(headerLock.isMine, false)}`
              : `flex-1 text-sm [&_.ProseMirror]:font-bold [&_.ProseMirror]:italic [&_[role=textbox]]:font-bold [&_[role=textbox]]:italic [&_p]:m-0 ${lockBorderClass(headerLock.isMine, false)}`
          }
          staticExtensions={HEADING_TITLE_FIELD_EXTENSIONS}
          onFocus={() => {
            headingFocused.current = true;
            onFocusField(field.id, 'header');
          }}
          onChange={(html) => {
            headerLock.onType();
            setHeadingDraftBoth(html);
            headerLock.push(html);
          }}
          onBlur={() => {
            headingFocused.current = false;
            const next = headingDraftRef.current.trim();
            if (lastCommittedHeading.current !== next) {
              lastCommittedHeading.current = next;
              onHeadingChange(field, next || null);
            }
            headerLock.onBlur();
          }}
        />
      )}

      {headerLock.lockedByOther && headerLock.holder && (
        <LockHolderBadge holder={headerLock.holder} />
      )}
    </div>
  ) : null;





  return (
    <div
      ref={setNodeRef}
      id={`card-module-${field.id}`}
      style={style}
      className={`rounded-md border border-border transition-shadow ${
        // The page-styled module is exactly one text column wide: 18 cm of
        // content between 1.5 cm margins that run to the module's own edge,
        // so the module measures 21 cm. The board's own 768 px column is
        // narrower than that, so the module is NOT clamped to it (`max-w-none`)
        // and the symmetric negative margin lets it grow evenly past the
        // column instead of being squeezed to ~16 cm of text.
        isDocumentSurface
          ? 'box-content w-[21cm] max-w-none mx-[calc((100%_-_21cm)/2)]'
          : 'space-y-2 p-3'
      } ${field.isVisible ? '' : 'opacity-50 print:hidden'}`}
    >
      <div className={`flex items-center gap-1 ${isDocumentSurface ? 'px-3 pt-3' : ''}`}>
        {canEdit && (
          <Tip label="Drag to reorder this module">
            <button
              type="button"
              className="shrink-0 cursor-grab touch-none rounded active:cursor-grabbing hover:bg-muted"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4 text-blue-500" />
            </button>
          </Tip>
        )}



        {isPlaceholder ? (
          <div className={collapsed ? 'hidden' : 'min-w-0 flex-1'}>
            <RefDataProvider proposalId={proposalId}>
              <CasesTableLiveView
                proposalId={proposalId}
                caseTypeId={field.placeholderCaseTypeId ?? null}
                letterIndex={caseLetterIndex ?? 0}
                sectionNumber={captionSectionNumber}
              />
            </RefDataProvider>
          </div>
        ) : (
          <>
            {headerField && !isDocumentSurface ? (
              headerField
            ) : (

              <span className="flex-1" aria-hidden="true" />
            )}

            {canEdit && (
              <div className="flex shrink-0 items-center gap-1.5">
                <Tip
                  label={
                    field.headingEnabled
                      ? 'Remove this module’s header from Part B'
                      : 'Include a header for this module in Part B'
                  }
                >
                  {/* TooltipTrigger also owns a `data-state` attribute. Keep it
                      on this wrapper so it cannot replace Radix Switch's
                      checked/unchecked state on the actual control. */}
                  <span className="inline-flex">
                    <Switch
                      id={`include-header-${field.id}`}
                      checked={field.headingEnabled}
                      onCheckedChange={(v) => onToggleHeading(field, v)}
                      aria-label={
                        field.headingEnabled
                          ? 'Remove this module’s header from Part B'
                          : 'Include a header for this module in Part B'
                      }
                      className="scale-75 border border-border data-[state=checked]:!bg-primary data-[state=unchecked]:!bg-muted-foreground/50"
                    />
                  </span>
                </Tip>
                <Label
                  htmlFor={`include-header-${field.id}`}
                  className="cursor-pointer whitespace-nowrap text-[11px] text-muted-foreground"
                >
                  Include header
                </Label>
              </div>
            )}

            {canEdit && (
              <Tip
                label={
                  field.isVisible
                    ? 'Hide this module from Part B'
                    : 'Show this module in Part B'
                }
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  aria-pressed={!field.isVisible}
                  onClick={() => onToggleVisible(field, !field.isVisible)}
                  aria-label={
                    field.isVisible
                      ? 'Hide this module from Part B'
                      : 'Show this module in Part B'
                  }
                >
                  {/* Same colour logic as the block-level eye: green when the
                      module is included, red when it is left out. */}
                  {field.isVisible ? (
                    <Eye className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5 text-destructive" strokeWidth={2.5} />
                  )}
                </Button>
              </Tip>
            )}

            {canEdit && !UNDELETABLE_MODULE_CARD_KEYS.has(cardTemplateKey ?? '') && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Tip label="Delete module">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </Tip>
                </AlertDialogTrigger>

                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Delete “{(field.headingEnabled && htmlToPlainText(field.heading ?? '')) || 'this module'}”?
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
        <div
          className={
            collapsed
              ? 'hidden'
              : isDocumentSurface
                // The page itself: white, 1.5 cm side margins running to the
                // module's edge, and 3 pt of air above and below the text —
                // the same spacing a body paragraph carries, no more.
                ? 'doc-surface-page bg-white px-[1.5cm] py-[3pt]'
                : `flex items-start gap-2 ${canEdit ? 'ml-[20px]' : ''}`
          }
        >
          {isDocumentSurface && headerField}
          <div className={isDocumentSurface ? 'flex items-start gap-2' : 'contents'}>
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
            {isImpactSummary && canEdit && !contentLock.lockedByOther && (
              <ImpactSummaryRowControls editor={contentEditor.current} tick={rowTick} />
            )}
            <MethodologyRichEditor
              key={`${field.id}-${reloadNonce}`}
              proposalId={proposalId}
              value={contentViewHtml}
              onEditorReady={(ed) => {
                contentEditor.current = ed;
                if (!isImpactSummary) return;
                // Row controls mirror the live document, so re-read on update.
                ed.on('update', () => setRowTick((t) => t + 1));
                setRowTick((t) => t + 1);
              }}

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
              captionNumbering={captionNumbering ?? null}
              documentSurface={isDocumentSurface}
              pairedTables={isImpactSummary}
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
  /** Where each module's text box starts in the section caption sequences. */
  captionNumberingByFieldId?: Record<string, CaptionNumbering>;
  /** Section number without the "B" prefix, e.g. "1.2". */
  captionSectionNumber?: string;
  collapsed: boolean;
  /** Per-user view preference: content hidden, header + summary stay. */
  userCollapsed: boolean;
  onToggleCollapse: () => void;
  /** For the references block's collapsed summary. */
  referenceCount: number;
  /** Caption or figure title, for a figure block's collapsed summary. */
  figureSummary?: string;
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
  onToggleFieldVisible: (field: CardField, visible: boolean) => void;
  onFocusField: (fieldId: string, textBox: CardTextBox) => void;
  onLostText: (payload: LostTextPayload) => void;
  onFlushContent: (field: CardField, html: string) => Promise<void>;
  reloadNonce: number;
  /** "Table 1.2.a." / "Figure 1.2.a." for table and figure blocks. */
  captionLabel?: string;
  /** Section declares that figures and tables are always full width (B3.1). */
  figuresFullWidth: boolean;
  /** B3.2 conditional blocks: heading computed from A2 at render. */
  conditionTitle?: string | null;
  /** B3.2 conditional blocks: condition not met, so the block is left out downstream. */
  conditionUnmet?: boolean;
  /** Explains why a conditional block is left out. */
  conditionReason?: string;
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
  captionNumberingByFieldId,
  captionSectionNumber,
  collapsed,
  userCollapsed,
  onToggleCollapse,
  referenceCount,
  figureSummary,
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
  onToggleFieldVisible,
  onFocusField,
  onLostText,
  onFlushContent,
  reloadNonce,
  captionLabel,
  figuresFullWidth,
  conditionTitle,
  conditionUnmet,
  conditionReason,
}: CardBlockProps) {
  const queryClient = useQueryClient();
  const sortable = useSortable({ id: card.id, disabled: !draggable });
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraftState] = useState(card.title ?? '');
  // Same reason as the module header: the rich field emits and blurs in one
  // tick, so commits read the draft from a ref.
  const titleDraftRef = useRef(card.title ?? '');
  const setTitleDraft = (v: string) => {
    titleDraftRef.current = v;
    setTitleDraftState(v);
  };
  const [localFieldOrder, setLocalFieldOrder] = useState<string[] | null>(null);

  // Linked-activities block: the controller lives here so its Add/Restore
  // buttons can sit in the block header with the other blocks' controls.
  const isLinkedActivities = card.sourceKey === 'b12.linked_activities' && !card.isSourceFed;
  const isMilestonesCard = card.sourceKey === 'b31.table_d' && !card.isSourceFed;
  const isRisksCard = card.sourceKey === 'b31.table_e' && !card.isSourceFed;
  const linkedActivities = useLinkedActivities(isLinkedActivities ? proposalId : '');
  const [activityBinOpen, setActivityBinOpen] = useState(false);
  const relationalBinTable = isMilestonesCard
    ? 'proposal_milestones'
    : isRisksCard
      ? 'proposal_risks'
      : null;
  const [relationalBinOpen, setRelationalBinOpen] = useState(false);
  const { data: relationalBinEntries = [] } = useQuery({
    queryKey: ['proposal-row-bin', proposalId, relationalBinTable],
    enabled: !!relationalBinTable,
    queryFn: async () => {
      if (!relationalBinTable) return [];
      const { data, error } = await supabase
        .from('proposal_row_bin')
        .select('id, label, created_at')
        .eq('proposal_id', proposalId)
        .eq('table_name', relationalBinTable)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const restoreRelationalRow = async (binId: string) => {
    const { data, error } = await supabase.rpc('restore_binned_row', { p_bin_id: binId });
    const result = data as { ok?: boolean; error?: string } | null;
    if (error || !result?.ok) {
      toast.error(error?.message || result?.error || 'Could not restore the row');
      return;
    }
    const queryKey = isMilestonesCard
      ? ['proposal-milestones-mgr', proposalId]
      : ['proposal-risks-mgr', proposalId];
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ['proposal-row-bin', proposalId, relationalBinTable] }),
    ]);
    window.dispatchEvent(new CustomEvent('cross-ref-data-changed'));
    if (relationalBinEntries.length === 1) setRelationalBinOpen(false);
    toast.success(isMilestonesCard ? 'Milestone restored' : 'Risk restored');
  };

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
    getTyped: () => titleDraftRef.current,
    onLoseRace: (typed, holderName) => {
      setTitleDraft(card.title ?? '');
      setEditingTitle(false);
      onLostText(lostTextPayload(typed, holderName));
    },

    save: async () => {
      const next = titleDraftRef.current.trim();
      if (next !== lastCommittedTitle.current) {
        lastCommittedTitle.current = next;
        onRename(card, next || null);
      }
    },
    snapshot: () => titleDraftRef.current,
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
    conditionTitle ??
    ((titleLock.lockedByOther ? (titleLock.streamed ?? mirroredTitle.current) : titleView) ??
      card.title ??
      null);



  useEffect(() => {
    setLocalFieldOrder(null);
  }, [fields]);

  const orderedFields = useMemo(() => {
    if (!localFieldOrder) return fields;
    const byId = new Map(fields.map((f) => [f.id, f]));
    const list = localFieldOrder.map((id) => byId.get(id)).filter(Boolean) as CardField[];
    return list.length === fields.length ? list : fields;
  }, [fields, localFieldOrder]);

  // Hidden blocks dim their CONTENT only (see contentDimClass below); the
  // header controls must stay fully legible so the toggle that brings the
  // block back is never itself greyed out.
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.6 : 1,
  };
  const contentDimClass = card.isVisible && !conditionUnmet ? '' : 'opacity-60';


  const commitTitle = () => {
    setEditingTitle(false);
    const next = titleDraftRef.current.trim();
    if (next !== lastCommittedTitle.current) {
      lastCommittedTitle.current = next;
      onRename(card, next || null);
    }
  };

  // Header mode. Figure blocks historically carried no header at all (their
  // caption is the label); they only get one when the template explicitly
  // marks it editor-only, as the B3.1 Pert and Gantt blocks do.
  const headerMode: 'off' | 'mirrored' | 'editor_only' =
    card.titleMode === 'editor_only'
      ? 'editor_only'
      : card.titleMode === 'off' || card.kind === 'figure'
        ? 'off'
        : 'mirrored';

  const isPlaceholderCard = card.kind === 'references' || card.isSourceFed;
  // Authored, but backed by its own relational table rather than card fields:
  // the block renders the same editor as the old methodologies page.
  const isLinkedActivitiesCard = card.sourceKey === 'b12.linked_activities' && !card.isSourceFed;
  // Same arrangement for B3.1's milestones and risks: authored in place,
  // stored in proposal_milestones / proposal_risks.
  const isRelationalCard = isLinkedActivitiesCard || isMilestonesCard || isRisksCard;
  // The two B3.1 charts: no add / restore / delete, so those header columns
  // carry the chart's own Edit and Download controls instead.
  const isPertCard = card.sourceKey === 'b31.pert';
  const isGanttCard = card.sourceKey === 'b31.gantt';

  // The chart itself is rendered by SourceFedBlock, which tags its wrapper
  // with data-figure-type; the header control finds it and hands it to the
  // shared figure export path.
  const downloadFigurePng = async (kind: 'pert' | 'gantt') => {
    // A collapsed block is display:none, which snapshots as a blank 0x0
    // canvas — expand it first and let it lay out before capturing.
    if (contentHidden) {
      onToggleCollapse();
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    const el = document.querySelector<HTMLElement>(`[data-figure-type="${kind}"]`);
    if (!el || el.offsetHeight === 0) {
      toast.error('The chart is not on the page yet');
      return;
    }
    try {
      const { exportAsPng } = await import('@/lib/figureExport');
      await exportAsPng(el, kind === 'pert' ? 'PERT-chart' : 'Gantt-chart');
      toast.success('PNG downloaded');
    } catch {
      toast.error('Could not download the figure');
    }
  };

  const onEditPert = () => {
    // The figures manager is a page of the proposal editor, opened by id.
    window.dispatchEvent(new CustomEvent('open-proposal-section', { detail: { sectionId: 'figures' } }));
  };
  // Only authored text cards grow new modules; source-fed, figure and
  // linked-activities blocks have a fixed structure.
  const canAddModule =
    canEdit && !isPlaceholderCard && !isRelationalCard && card.kind !== 'figure';

  /* The milestones and risks editors own their insert, but the button belongs
     in the block header alongside every other "Add" — so each hands its add
     action up here on mount. */
  const [relationalAdd, setRelationalAdd] = useState<(() => void) | null>(null);
  const registerRelationalAdd = useCallback((fn: () => void) => setRelationalAdd(() => fn), []);


  // Dragging also collapses (kept from before); the user's own collapse
  // preference is independent of it and persists across page loads.
  const contentHidden = collapsed || userCollapsed;

  /** One-line "what's inside" shown in the header while collapsed. */
  const collapsedSummary = (() => {
    if (card.kind === 'references')
      return `${referenceCount} reference${referenceCount === 1 ? '' : 's'}`;
    if (card.kind === 'figure')
      return card.isSourceFed
        ? 'Source-fed figure'
        : `User-written content — ${figureSummary ?? 'figure'}`;
    if (card.isSourceFed) return 'Source-fed table';
    if (isLinkedActivitiesCard) {
      const n = linkedActivities.activities.length;
      return `User-written content — ${n} linked ${n === 1 ? 'activity' : 'activities'}`;
    }
    // Authored relational blocks carry their own row editors, so there are no
    // modules to count — the label just states who writes them.
    if (isMilestonesCard || isRisksCard) return 'User-written content';
    const n = fields.length;
    return `User-written content — ${n} module${n === 1 ? '' : 's'}`;
  })();


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
          {/* Left edge control stack: collapse chevron on top, drag grip
              beneath it, so both sit together at the block's left edge. */}
          <div className="-ml-3.5 flex shrink-0 flex-col items-center gap-0.5 self-start">
            <Tip label={userCollapsed ? 'Expand block' : 'Collapse block'}>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleCollapse}
                className="h-6 w-6"
              >
                {userCollapsed ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </Button>
            </Tip>
            {draggable && canEdit && (
              <Tip label="Drag to reorder this block">
                <button
                  type="button"
                  className="shrink-0 cursor-grab touch-none rounded active:cursor-grabbing hover:bg-muted"
                  {...sortable.attributes}
                  {...sortable.listeners}
                >
                  <GripVertical className="h-4 w-4 text-blue-500" />
                </button>
              </Tip>
            )}
          </div>


          {/* Header visibility follows the block's `titleMode`:
              'off'         → no header at all (B3.1 intro block),
              'mirrored'    → header prints in the preview/export (B1.2),
              'editor_only' → header shows here for navigation only and is
                              never emitted to the preview, PDF or DOCX. */}
          <div className="min-w-0 flex-1">
            {headerMode === 'off' ? null : isCoordinator && editingTitle && !titleLock.lockedByOther ? (
              // Single-line rich text: baseline formatting only (see
              // TITLE_FIELD_CAPABILITIES). Legacy plain-string titles are
              // upgraded to HTML on read by `ensureRichHtml`.
              <LazyRichField
                autoFocus
                singleLine
                proposalId={proposalId}
                value={ensureRichHtml(titleDraft)}
                minHeight="32px"
                className={`[&_.ProseMirror]:font-bold [&_.ProseMirror]:underline [&_p]:m-0 ${lockBorderClass(titleLock.isMine, false)}`}
                staticExtensions={HEADING_TITLE_FIELD_EXTENSIONS}
                onChange={(html) => {
                  titleLock.onType();
                  setTitleDraft(html);
                  titleLock.push(html);
                }}
                onBlur={() => {
                  commitTitle();
                  titleLock.onBlur();
                }}
              />
            ) : (
              <div className="flex min-w-0 items-center gap-2">
                <h3
                  className={`truncate font-bold underline [&_p]:m-0 [&_p]:inline ${isCoordinator && !titleLock.lockedByOther ? 'cursor-text' : ''} ${
                    displayedTitle ? '' : 'italic text-muted-foreground no-underline'
                  } ${titleLock.lockedByOther ? 'rounded border border-destructive px-1' : ''}`}
                  onClick={() => isCoordinator && !titleLock.lockedByOther && setEditingTitle(true)}
                  {...(displayedTitle
                    ? { dangerouslySetInnerHTML: { __html: displayRichHtml(displayedTitle) } }
                    : { children: 'No title' })}
                />
                {titleLock.lockedByOther && titleLock.holder && (
                  <LockHolderBadge holder={titleLock.holder} />
                )}
              </div>
            )}

            {userCollapsed && (
              <p className="truncate text-xs text-muted-foreground">{collapsedSummary}</p>
            )}
            {conditionUnmet && (
              <p className="text-xs italic text-muted-foreground">
                Not applicable — left out of the preview and the export. {conditionReason}
              </p>
            )}
          </div>


          {/* The Pert and Gantt blocks carry no add / restore / delete, so
              their own Edit and Download controls take those columns and
              match the rest of the block chrome. */}
          {/* Fixed control columns: visibility | add | restore | delete.
              Every block reserves all four, so a block that lacks a control
              leaves its column empty instead of pulling the rest out of line.
              Controls stay at full opacity when the block is hidden — only the
              block's content dims. */}
          <div className="ml-auto grid shrink-0 grid-cols-[40px_88px_88px_40px] items-center justify-items-center gap-1 opacity-100">

            {/* Column 1 — visibility */}
            {canEdit && card.isHideable ? (
              <Tip label={card.isVisible ? 'Hide block in Part B' : 'Show block in Part B'}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-pressed={!card.isVisible}
                  onClick={() => onToggleVisible(card)}
                >
                  {card.isVisible ? (
                    <Eye className="h-4 w-4 text-emerald-600" strokeWidth={2.5} />
                  ) : (
                    <EyeOff className="h-4 w-4 text-destructive" strokeWidth={2.5} />
                  )}
                </Button>
              </Tip>
            ) : (
              <span aria-hidden="true" />
            )}

            {/* Column 2 — add (or "Edit" on the Pert block) */}
            {isPertCard ? (
              <Tip label="Edit the Pert chart in the figures manager">
                <Button variant="ghost" size="sm" onClick={onEditPert}>
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  Edit
                </Button>
              </Tip>
            ) : isLinkedActivitiesCard && canEdit ? (
              <Tip label="Add activity">
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
              </Tip>
            ) : (isMilestonesCard || isRisksCard) && canEdit && relationalAdd ? (
              <Tip label={isMilestonesCard ? 'Add milestone' : 'Add risk'}>
                <Button variant="ghost" size="sm" onClick={() => relationalAdd()}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add
                </Button>
              </Tip>
            ) : canAddModule ? (

              <Tip label="Add module to this block">
                <Button variant="ghost" size="sm" onClick={() => onAddField(card)}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add
                </Button>
              </Tip>
            ) : (
              <span aria-hidden="true" />
            )}

            {/* Column 3 — restore (or "Download" on the Pert and Gantt blocks) */}
            {isPertCard || isGanttCard ? (
              <Tip label={`Download the ${isPertCard ? 'Pert' : 'Gantt'} chart as a PNG`}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => downloadFigurePng(isPertCard ? 'pert' : 'gantt')}
                >
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Download
                </Button>
              </Tip>
            ) : isLinkedActivitiesCard && canEdit && linkedActivities.deletedActivities.length > 0 ? (
              <Tip
                label={`Restore deleted activity (${linkedActivities.deletedActivities.length} in the recycle bin)`}
              >
                <Button variant="ghost" size="sm" onClick={() => setActivityBinOpen(true)}>
                  <Recycle className="mr-1 h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} />
                  Restore
                </Button>
              </Tip>
            ) : (isMilestonesCard || isRisksCard) && canEdit && relationalBinEntries.length > 0 ? (
              <Tip
                label={`Restore deleted ${isMilestonesCard ? 'milestone' : 'risk'} (${relationalBinEntries.length} in the recycle bin)`}
              >
                <Button variant="ghost" size="sm" onClick={() => setRelationalBinOpen(true)}>
                  <Recycle className="mr-1 h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} />
                  Restore
                </Button>
              </Tip>
            ) : !isRelationalCard && canEdit && binCount > 0 ? (
              <Tip label={`Restore deleted module (${binCount} in the recycle bin)`}>
                <Button variant="ghost" size="sm" onClick={() => onOpenBin(card)}>
                  <Recycle className="mr-1 h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} />
                  Restore
                </Button>
              </Tip>
            ) : (
              <span aria-hidden="true" />
            )}

            {/* Column 4 — delete */}
            {canEdit && card.isDeletable ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Tip label="Delete block">
                    <Button variant="ghost" size="icon" className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </Tip>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Delete “{htmlToPlainText(card.title ?? '') || 'this block'}”?
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
            ) : (
              <span aria-hidden="true" />
            )}

          </div>
        </CardHeader>

        {/* Hidden, not unmounted: editors keep their state and no unmount-time
            flush can fire. Collapse changes nothing the document records. */}
        {/* Every field inside the block — card fields and the relational
            tables alike — inherits the block's guideline key from here, so
            the Guidelines button resolves from any of them. */}
        <CardContent
          data-guideline-key={card.templateKey ?? undefined}
          className={contentHidden ? 'hidden' : `space-y-3 px-5 ${contentDimClass}`}
        >
          {card.kind === 'references' ? (
            <ReferencesBlock proposalId={proposalId} sectionId={card.sectionId} />
          ) : isMilestonesCard ? (
            <MilestonesEditor proposalId={proposalId} canEdit={canEdit} />
          ) : isRisksCard ? (
            <RisksEditor proposalId={proposalId} canEdit={canEdit} />
          ) : isLinkedActivitiesCard ? (
            <LinkedActivitiesTable
              proposalId={proposalId}
              canEdit={canEdit}
              isCoordinator={isCoordinator}
              controller={linkedActivities}
              captionLabel={captionLabel}
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
              {/* B3.2 blocks are authored, but also mirror their A2 sources. */}
              {b32BlockHasMirrors(card.templateKey) && (
                <B32BlockMirrors
                  proposalId={proposalId}
                  templateKey={card.templateKey}
                  fields={orderedFields}
                />
              )}

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
                        captionNumbering={captionNumberingByFieldId?.[f.id] ?? null}
                        captionSectionNumber={captionSectionNumber}
                        onHeadingChange={onHeadingChange}
                        onContentChange={onContentChange}
                        onDelete={onDeleteField}
                        onToggleHeading={onToggleHeading}
                        onToggleVisible={onToggleFieldVisible}
                        onFocusField={onFocusField}
                        onLostText={onLostText}
                        onFlushContent={onFlushContent}
                        reloadNonce={reloadNonce}
                        collapsed={contentHidden}
                        cardTemplateKey={card.templateKey}

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
                      {htmlToPlainText(a.acronym ?? '').trim() || (
                        <span className="italic text-muted-foreground">No acronym</span>
                      )}

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

        <Dialog open={relationalBinOpen} onOpenChange={setRelationalBinOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{isMilestonesCard ? 'Restore milestone' : 'Restore risk'}</DialogTitle>
              <DialogDescription>
                Deleted {isMilestonesCard ? 'milestones' : 'risks'} are kept here. Restoring brings the row back with all of its content.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[320px]">
              <div className="space-y-1 p-1">
                {relationalBinEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {htmlToPlainText(entry.label ?? '').trim() || (
                        <span className="italic text-muted-foreground">Untitled</span>
                      )}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => restoreRelationalRow(entry.id)}>
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

/** Fallback caption sequence when the board is mounted without a section number. */
const DEFAULT_CAPTION_NUMBER = '1.2';


function BoardInner({
  proposalId,
  sectionId,
  sectionNumber,
  canEdit,
  isCoordinator,
  proposalAcronym,
  acronymSegments,
}: BoardProps) {
  const { cards, headCards, freeCards, tailCards, isLoading } = useSectionCards(
    proposalId,
    sectionId,
  );
  const sectionMeta = useMemo(() => {
    const normalized = (sectionNumber ?? '').replace(/^B/i, '');
    const names: Record<string, string> = {
      '1.1': 'Objectives & ambition',
      '1.2': 'Methodologies',
      '2.1': "Project's pathways towards impact",
      '2.2': 'Measures to maximise impact',
      '3.1': 'Work plan & resources',
      '3.2': 'Capacity of participants & consortium',
    };
    const previewLabel = normalized ? `Part B${normalized}` : 'Part B';
    const name = names[normalized];
    return {
      title: name ? `${previewLabel}. ${name}` : previewLabel,
      description: `Content written in this editor is mirrored to the ${previewLabel} preview.`,
      previewLabel,
    };
  }, [sectionNumber]);

  const queryClient = useQueryClient();
  const cardIds = useMemo(() => cards.map((c) => c.id), [cards]);
  const { fieldsByCard } = useCardFieldsForCards(cardIds);
  const { entries: binEntries } = useSectionRecycleBin(proposalId, sectionId);

  // Per-user collapse preferences — view state only, never document state.
  const allCardIds = useMemo(() => cards.map((c) => c.id), [cards]);
  const { collapsedIds, setCollapsed, setAllCollapsed } = useCardCollapse(allCardIds);
  const figureCardIds = useMemo(
    () => cards.filter((c) => c.kind === 'figure').map((c) => c.id),
    [cards],
  );
  const { data: figureSummaries = {} } = useCardFigureSummaries(figureCardIds);

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
  const [citationOpen, setCitationOpen] = useState(false);
  const [focusedBox, setFocusedBox] = useState<{ fieldId: string; textBox: CardTextBox } | null>(
    null,
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);
  const [criteriaOpen, setCriteriaOpen] = useState(false);
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
      if (found) return (found.headingEnabled && htmlToPlainText(found.heading ?? '')) || 'Untitled module';
    }
    return 'Untitled module';
  }, [fieldsByCard, focusedBox]);

  /* Commission guidelines follow the FOCUSED block: its template key selects
     the block-level guidelines, and the document-level ones (formatting,
     definitions) are always appended by the hook. */
  const focusedCard = useMemo(() => {
    if (!focusedBox) return null;
    for (const [cardId, list] of Object.entries(fieldsByCard)) {
      if (list.some((f) => f.id === focusedBox.fieldId)) {
        return cards.find((c) => c.id === cardId) ?? null;
      }
    }
    return null;
  }, [cards, fieldsByCard, focusedBox]);
  /* Blocks whose fields are NOT card fields — the linked-activities table
     owns its own relational rows — resolve no focused card, so the key falls
     back to the `data-guideline-key` the block writes onto its content. */
  const focusedGuidelineKey = useFocusedGuidelineKey();
  /* Guidance is resolved against the version this proposal was created from,
     never the latest template content. */
  const { data: proposalTemplateVersionId } = useProposalTemplateVersion(proposalId);
  const { data: focusedGuidelines = [] } = useCardGuidelines(
    focusedCard?.templateKey ?? focusedGuidelineKey ?? null,
    'part_b',
    proposalTemplateVersionId,
    proposalId,
  );

  /* Criteria are a category of their own: they belong to the SECTION, not to a
     block, so they hang off the page-wide tier and never follow the focus. */
  const { data: sectionCriteria = [] } = useSectionCriteria(sectionId, proposalTemplateVersionId, proposalId);


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

  // The references block is part of the required sequence for every Part B section
  // (B1.2, B3.1, …). It always appears so authors can hide it if needed, and it
  // shows a note when the section currently cites nothing.
  const { hasAny: sectionCitesAnything, entries: sectionCitedEntries } =
    useSectionCitedReferences(proposalId, sectionId);
  const referenceCount = sectionCitedEntries.length;
  // B3.2's two conditional blocks stay reachable in the editor (their content
  // must never disappear), but a block whose condition is not met is excluded
  // from the mirror, the preview and the export — see b32Conditions.ts.
  const b32Signals = useB32Conditions(proposalId, (sectionNumber ?? '').replace(/^B/i, '') === '3.2');
  // B3.1's two cost tables (3.1.g, 3.1.h) behave the same way: the block stays
  // on the board with its explanation, but is marked not applicable and left
  // out of the preview and the export until its source data appears.
  const b31Unmet = useB31UnmetSourceBlocks(
    proposalId,
    (sectionNumber ?? '').replace(/^B/i, '') === '3.1',
  );
  const visibleCard = (c: ProposalCard) => c.isVisible || isCoordinator;

  /** Blocks this user can see — the target set for Collapse all / Expand all. */
  const visibleCardIds = useMemo(
    () => [...headCards, ...orderedFree, ...tailCards].filter(visibleCard).map((c) => c.id),
    // visibleCard derives from sectionCitesAnything and isCoordinator.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [headCards, orderedFree, tailCards, sectionCitesAnything, isCoordinator],
  );

  const allBlocksCollapsed =
    visibleCardIds.length > 0 && visibleCardIds.every((id) => collapsedIds.has(id));

  /**
   * Figure blocks are rasterised from the live board, and a collapsed block is
   * `display: none`, so it captures as nothing. Opening the preview therefore
   * expands EVERY collapsed figure block (authored figures as well as the
   * source-fed Gantt/Pert charts) before the snapshot runs.
   *
   * WHICH ONES WE EXPANDED is tracked in `autoExpandedRef`: only the ids that
   * were collapsed at the moment the preview opened go into it, so closing the
   * preview (or leaving the section) re-collapses exactly those and leaves a
   * figure the user had already expanded alone.
   */
  const autoExpandedRef = useRef<string[]>([]);

  const isFigureBlock = useCallback(
    (c: (typeof cards)[number]) =>
      c.kind === 'figure' || c.sourceKey === 'b31.gantt' || c.sourceKey === 'b31.pert',
    [],
  );

  const restoreAutoExpanded = useCallback(() => {
    const ids = autoExpandedRef.current;
    autoExpandedRef.current = [];
    if (!ids.length) return;
    setAllCollapsed.mutate({ ids, collapsed: true });
  }, [setAllCollapsed]);

  const openTypstPreview = async () => {
    const figureCardIds = cards
      .filter((c) => isFigureBlock(c) && collapsedIds.has(c.id))
      .map((c) => c.id);
    autoExpandedRef.current = figureCardIds;
    if (figureCardIds.length) {
      await setAllCollapsed.mutateAsync({ ids: figureCardIds, collapsed: false });
      // One frame for the charts to lay out before the snapshot is taken.
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 250)));
    }
    setTypstOpen(true);
  };

  // Navigating away (section switch, route change, unmount) restores the
  // blocks the preview expanded, exactly as closing the dialog does.
  useEffect(() => {
    return () => {
      const ids = autoExpandedRef.current;
      autoExpandedRef.current = [];
      if (ids.length) setAllCollapsed.mutate({ ids, collapsed: true });
    };
    // Deliberately mount-scoped: the ref carries the ids across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);




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

  // Tables and figures are numbered by POSITION, in one pass over the whole
  // section: figures run their own sequence (a, b, c…) and tables another, and
  // both are handed down as derived, uneditable labels. B3.1 keeps its own
  // fixed sequence (its tables are compulsory and already correct), so the
  // walk there only labels figure blocks.
  const captionNumber = (sectionNumber ?? '').replace(/^B/i, '') || DEFAULT_CAPTION_NUMBER;
  const isB31 = captionNumber === '3.1';

  const numbering = useMemo(() => {
    const ordered = [...headCards, ...orderedFree, ...tailCards];
    const cardLabels: Record<string, string> = {};
    const caseLetters: Record<string, number> = {};
    const fieldNumbering: Record<string, CaptionNumbering> = {};
    let tableIdx = 0;
    let figureIdx = 0;

    for (const card of ordered) {
      if (!visibleCard(card)) continue;

      if (card.kind === 'figure') {
        cardLabels[card.id] = `Figure ${captionNumber}.${captionLetter(figureIdx)}.`;
        figureIdx += 1;
        continue;
      }

      // Relational tables authored in place carry a block-level caption.
      if (card.sourceKey === 'b12.linked_activities' && !card.isSourceFed) {
        cardLabels[card.id] = `Table ${captionNumber}.${captionLetter(tableIdx)}.`;
        tableIdx += 1;
        continue;
      }

      if (card.isSourceFed || card.kind === 'references') continue;

      for (const f of fieldsByCard[card.id] ?? []) {
        // A hidden MODULE consumes no letter, exactly as a hidden block does.
        if (!f.isVisible) continue;
        if (f.fieldRole === 'case_placeholder') {
          caseLetters[f.id] = tableIdx;
          tableIdx += 1;
          continue;
        }
        fieldNumbering[f.id] = {
          sectionNumber: captionNumber,
          tableOffset: tableIdx,
          figureOffset: figureIdx,
        };
        const slots = countCaptionSlots(f.contentHtml);
        tableIdx += slots.tables;
        figureIdx += slots.figures;
      }
    }

    return { cardLabels, caseLetters, fieldNumbering };
    // visibleCard derives from sectionCitesAnything and isCoordinator.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    headCards,
    orderedFree,
    tailCards,
    fieldsByCard,
    captionNumber,
    sectionCitesAnything,
    isCoordinator,
  ]);

  const captionLabels = numbering.cardLabels;
  const caseLetterByFieldId = numbering.caseLetters;
  /** B3.1 numbers its own captions; every other section derives them here. */
  const captionNumberingByFieldId = isB31 ? undefined : numbering.fieldNumbering;


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
    ...(() => {
      const r = resolveB32Condition(card.templateKey, b32Signals);
      return r.conditional
        ? {
            conditionTitle: r.title,
            conditionUnmet: !r.met,
            conditionReason: r.met ? undefined : b32UnmetReason(card.templateKey),
          }
        : {};
    })(),
    ...(card.sourceKey && b31Unmet.has(card.sourceKey)
      ? {
          conditionUnmet: true,
          conditionReason: b31UnmetReason(card.sourceKey),
        }
      : {}),
    captionLabel: captionLabels[card.id],
    captionNumberingByFieldId,
    captionSectionNumber: captionNumber,
    figuresFullWidth,
    fields: fieldsByCard[card.id] ?? [],
    caseLetterByFieldId,
    proposalId,
    canEdit,
    isCoordinator,
    draggable,
    caseTypeLabels,
    collapsed: isDragging,
    userCollapsed: collapsedIds.has(card.id),
    onToggleCollapse: () =>
      setCollapsed.mutate({ cardId: card.id, collapsed: !collapsedIds.has(card.id) }),
    referenceCount,
    figureSummary: figureSummaries[card.id],
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
    onAddField: (c: ProposalCard) =>
      createField.mutate(
        { cardId: c.id },
        // Same helper as a new block: bring the new module into view.
        { onSuccess: (f) => jumpToRestored('field', f.id) },
      ),
    onReorderFields: (c: ProposalCard, orderedIds: string[]) =>
      reorderFields.mutate({ cardId: c.id, orderedFieldIds: orderedIds }),
    onHeadingChange: (f: CardField, heading: string | null) =>
      void saveTextBox(f.id, f.cardId, 'header', heading ?? '', false),
    onToggleHeading: (f: CardField, enabled: boolean) =>
      updateField.mutate({ fieldId: f.id, cardId: f.cardId, headingEnabled: enabled }),
    onToggleFieldVisible: (f: CardField, visible: boolean) =>
      updateField.mutate({ fieldId: f.id, cardId: f.cardId, isVisible: visible }),

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

  /* NOTE: no early return may appear above the remaining hooks — see the
     loading/empty guards below, which now sit after every hook call. */


  /**
   * Page-wide find and replace reads the STORED value of every text box on
   * the board — block titles, module headers and module content — so blocks
   * the user collapsed, and editors that never mounted, are searched too.
   * One React Query read per surface (cards + fields) covers the whole page.
   */
  const searchFieldsForPage = useCallback((): SearchableField[] => {
    const out: SearchableField[] = [];
    const ordered = [...headCards, ...orderedFree, ...tailCards];

    const revealCard = (cardId: string) => async () => {
      // A block the user collapsed is expanded to show the match and LEFT
      // open: silently re-collapsing would hide an edit they just made.
      if (collapsedIds.has(cardId)) {
        await setCollapsed.mutateAsync({ cardId, collapsed: false });
      }
      await jumpToElementId(`card-block-${cardId}`);
    };

    const saveText = (
      fieldId: string,
      textBox: CardTextBox,
      cardId: string,
    ) => async (next: string): Promise<FieldSaveOutcome> => {
      const key = `${fieldId}:${textBox}`;
      const { data, error } = await supabase.rpc('save_card_text', {
        p_field_id: fieldId,
        p_text_box: textBox,
        p_value: next,
        p_expected_version: versionsRef.current[key] ?? null,
        p_is_auto_save: false,
      });
      if (error) return { ok: false, conflict: false, error: error.message };
      const res = (data ?? {}) as { ok?: boolean; version?: number };
      if (res.version) versionsRef.current[key] = res.version;
      if (!res.ok) return { ok: false, conflict: true };
      queryClient.invalidateQueries({ queryKey: ['card-fields-batch'] });
      if (textBox === 'content') {
        scheduleCitationInstanceReconcile({ proposalId, fieldId, cardId, html: next });
      }
      return { ok: true };
    };

    for (const card of ordered) {
      const cardLabel = htmlToPlainText(card.title ?? '').trim() || 'Untitled block';
      const hidden = !card.isVisible;
      const readOnly = !canEdit || card.isSourceFed;

      if (card.title) {
        out.push({
          id: `card:${card.id}:title`,
          label: `${cardLabel} › block title`,
          groupId: card.id,
          groupLabel: cardLabel,
          hidden,
          // Stored as HTML since the title became a rich-text field; legacy
          // plain strings are upgraded on read.
          format: 'html',
          value: ensureRichHtml(card.title),
          readOnly,
          reveal: revealCard(card.id),
          save: readOnly
            ? undefined
            : async (next) => {
                const key = `card:${card.id}:title`;
                const { data, error } = await supabase.rpc('save_card_title', {
                  p_card_id: card.id,
                  p_title: next,
                  p_expected_version: versionsRef.current[key] ?? null,
                });
                if (error) return { ok: false, conflict: false, error: error.message };
                const res = (data ?? {}) as { ok?: boolean; version?: number };
                if (res.version) versionsRef.current[key] = res.version;
                if (!res.ok) return { ok: false, conflict: true };
                queryClient.invalidateQueries({ queryKey: sectionCardsKey(proposalId, sectionId) });
                return { ok: true };
              },
        });
      }

      for (const field of fieldsByCard[card.id] ?? []) {
        const revealField = async () => {
          if (collapsedIds.has(card.id)) {
            await setCollapsed.mutateAsync({ cardId: card.id, collapsed: false });
          }
          // Scrolling to the module mounts its lazily-rendered editor.
          await jumpToElementId(`card-module-${field.id}`);
        };
        if (field.heading) {
          out.push({
            id: `field:${field.id}:header`,
            label: `${cardLabel} › module header`,
            groupId: card.id,
            groupLabel: cardLabel,
            hidden,
            format: 'html',
            value: ensureRichHtml(field.heading),
            readOnly,
            reveal: revealField,
            save: readOnly ? undefined : saveText(field.id, 'header', card.id),
          });
        }
        if (field.contentHtml) {
          out.push({
            id: `field:${field.id}:content`,
            label: `${cardLabel} › ${htmlToPlainText(field.heading ?? '').trim() || 'module content'}`,
            groupId: card.id,
            groupLabel: cardLabel,
            hidden,
            format: 'html',
            value: field.contentHtml,
            // Case placeholders are fed from the pilot drafts, so their text
            // is searchable but must be edited at its source.
            readOnly: readOnly || field.fieldRole === 'case_placeholder',
            reveal: revealField,
            save:
              readOnly || field.fieldRole === 'case_placeholder'
                ? undefined
                : saveText(field.id, 'content', card.id),
          });
        }
      }
    }
    return out;
  }, [
    headCards,
    orderedFree,
    tailCards,
    fieldsByCard,
    collapsedIds,
    setCollapsed,
    canEdit,
    proposalId,
    sectionId,
    queryClient,
  ]);

  usePageSearchSource('cards-board', 'Methodologies', searchFieldsForPage);
  const pageSearch = usePageSearch();

  // Guards live AFTER every hook: an early return above them would change the
  // hook count between the loading and loaded renders.
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
      {/* 21 cm page column: a page-styled module is one full printed page
          wide (18 cm of text between two 1.5 cm margins), so the board that
          holds it — and the three toolbar tiers inside it — measure 21 cm. */}
      <div className="mx-auto w-full max-w-[21cm] space-y-4 p-6">

        {/* Page title and description scroll away normally: they sit ABOVE the
            floating toolbars and the description spans the full page width. */}
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-foreground">{sectionMeta.title}</h1>
          <p className="w-full text-sm text-muted-foreground">{sectionMeta.description}</p>
        </div>

        <EditorToolbars
          proposalId={proposalId}
          save={{ saving, lastSaved, savedMode, isDirty, onSaveNow: handleSaveNow }}
          topBar={{
              onPreview: isAdminOrOwner ? () => void openTypstPreview() : undefined,
              previewLabel: sectionMeta.previewLabel,
              collapseAll: {
                allCollapsed: allBlocksCollapsed,
                disabled: setAllCollapsed.isPending || visibleCardIds.length === 0,
                onToggle: () =>
                  setAllCollapsed.mutate({
                    ids: visibleCardIds,
                    collapsed: !allBlocksCollapsed,
                  }),
              },
              onAddBlock: canEdit ? () => setAddBlockOpen(true) : undefined,
              addBlockDisabled: createCard.isPending || createFigureCard.isPending,
              onRestoreBlock:
                canEdit && deletedBlockCount > 0 ? () => setBinOpen(true) : undefined,
              restoreBlockCount: deletedBlockCount,
              onFindReplace: pageSearch ? () => pageSearch.setOpen(true) : undefined,
              onOpenCriteria:
                sectionCriteria.length > 0 ? () => setCriteriaOpen(true) : undefined,

          }}
          fieldBar={{
            onOpenVersionHistory: () => setHistoryOpen(true),
            onOpenGuidelines:
              focusedGuidelines.length > 0 ? () => setGuidelinesOpen(true) : undefined,
          }}
          formatting={{
            proposalId,
            canManageCustomColors: isCoordinator,
            isPartB: true,
            isReadOnly: !canEdit,
            onOpenCitationDialog: canEdit ? () => setCitationOpen(true) : undefined,
            crossRefDropdown: (editor) => (
              <PartBCrossRefControls
                editor={editor}
                proposalId={proposalId}
                disabled={!canEdit}
                showKeyboardButton={false}
                acronymSegments={acronymSegments}
              />
            ),
          }}
        >
          {/* The chrome is a sibling in the page column, so the gap above the
              first block is the column's own space-y-4 plus the chrome's
              padding. Pull it back to the 12px used between blocks. */}
          <div className="space-y-3 -mt-2">
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
        </EditorToolbars>

        <CardsCitationDialogHost
          proposalId={proposalId}
          canEdit={canEdit}
          isCoordinator={isCoordinator}
          proposalAcronym={proposalAcronym}
          acronymSegments={acronymSegments}
          citationOpen={citationOpen}
          setCitationOpen={setCitationOpen}
        />

        <AddBlockDialog
          open={addBlockOpen}
          onOpenChange={setAddBlockOpen}
          onCreate={handleCreateBlock}
          isPending={createCard.isPending || createFigureCard.isPending}
        />

        {warning && <LockTimeoutWarning secondsLeft={warning.secondsLeft} />}

        <GuidelinesDialog
          isOpen={guidelinesOpen}
          onClose={() => setGuidelinesOpen(false)}
          sectionTitle={htmlToPlainText(focusedCard?.title ?? '') || focusedFieldLabel || 'Guidelines'}
          guidelines={focusedGuidelines}
        />

        <GuidelinesDialog
          isOpen={criteriaOpen}
          onClose={() => setCriteriaOpen(false)}
          sectionTitle=""
          dialogTitle="Evaluation criteria for this section"
          guidelines={sectionCriteria}
        />

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
            onOpenChange={(next) => {
              setTypstOpen(next);
              if (!next) restoreAutoExpanded();
            }}
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

        <PageFindReplacePanel />
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
        <PageSearchProvider>
          <BoardInner {...props} />
        </PageSearchProvider>
      </CardLockProvider>

    </MethodologyEditorFocusProvider>
  );
}

export default MethodologyCardsBoard;
