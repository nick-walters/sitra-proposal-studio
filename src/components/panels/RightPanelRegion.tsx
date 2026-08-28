import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { MessageSquarePlus, X } from 'lucide-react';
import { TrackedChangesIcon } from '@/components/panels/TrackedChangesIcon';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useMethodologyEditorFocus } from '@/components/MethodologyEditorFocusContext';
import { collectChangesFromDoc, type TrackChange } from '@/extensions/TrackChanges';
import { ReviewPanelBody } from '@/components/panels/ReviewPanel';

/**
 * THE RIGHT-HAND PANEL REGION
 *
 * ONE panel on the right of every editing surface, opened by the single
 * "Review" toggle in the page-wide toolbar. Inside it, two TABS:
 *
 *   Tracked changes — an empty shell for now
 *   Comments        — the existing comments panel, portalled into `host`
 *
 * The editor SHIFTS rather than being covered: the region is a fixed column
 * and the surface below gets an equal padding, so the document narrows but is
 * never obscured.
 */

export const RIGHT_PANEL_WIDTH = 340;

export type PanelId = 'comments' | 'review';

interface RightPanelCtx {
  /** Is the region open at all? */
  open: boolean;
  setOpen: (v: boolean) => void;
  /** Which tab is selected — meaningful only while `open`. */
  activeTab: PanelId;
  /** Kept for callers that speak in panels; both map onto the one region. */
  commentsOpen: boolean;
  reviewOpen: boolean;
  setCommentsOpen: (v: boolean) => void;
  setReviewOpen: (v: boolean) => void;
  /** Which panel currently occupies the region — null when the region is closed. */
  visiblePanel: PanelId | null;
  /** Open the region on this tab. Counts as an EXPLICIT choice by default. */
  showPanel: (p: PanelId, opts?: { explicit?: boolean }) => void;

  /** Portal target for the comments panel's own content. */
  host: HTMLElement | null;
  /** Tracked changes in the ACTIVE field only. */
  fieldChanges: TrackChange[];
  hasActiveField: boolean;
}

const Ctx = createContext<RightPanelCtx | null>(null);

export function useRightPanel() {
  return useContext(Ctx);
}

/* --------------------------------------------------------- persistence */

/**
 * The toggle and the selected tab persist PER USER AND PER PROPOSAL in
 * `localStorage`, so they survive reloads and new sessions on that machine,
 * while another proposal — and another user on the same machine — keeps its
 * own state.
 */
const storageKey = (userId: string | undefined, proposalId: string) =>
  `sitra.rightPanel.${userId ?? 'anon'}.${proposalId}`;

function readState(key: string): { open: boolean; tab: PanelId | null } {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { open: false, tab: null };
    const parsed = JSON.parse(raw) as {
      open?: boolean;
      tab?: PanelId | null;
      comments?: boolean;
      review?: boolean;
    };
    // Legacy shape: two independent booleans.
    const open = parsed.open ?? !!(parsed.comments || parsed.review);
    const tab: PanelId | null =
      parsed.tab ?? (parsed.review && !parsed.comments ? 'review' : null);
    return { open, tab };
  } catch {
    return { open: false, tab: null };
  }
}

/* ------------------------------------------------------------ provider */

export function RightPanelProvider({
  proposalId,
  children,
}: {
  proposalId: string;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const key = storageKey(user?.id, proposalId);

  const [open, setOpenState] = useState(false);
  /**
   * The user's EXPLICIT tab choice, or null when the tab is being chosen by
   * context. This one nullable field is the whole distinction: a tab header
   * click (or a control that names a tab, such as the comment buttons) writes
   * a value here; context selection never does. A stored value therefore
   * always came from a deliberate click, and closing the panel clears it so
   * the next opening starts from context again.
   */
  const [explicitTab, setExplicitTab] = useState<PanelId | null>(null);

  // Read once the user is known, so the stored state is the right person's.
  useEffect(() => {
    const s = readState(key);
    setOpenState(s.open);
    setExplicitTab(s.tab);
  }, [key]);

  const persist = useCallback(
    (next: { open: boolean; tab: PanelId | null }) => {
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* a full or blocked store must never break the editor */
      }
    },
    [key],
  );

  const setOpen = useCallback(
    (v: boolean) => {
      setOpenState(v);
      // Closing ends the explicit choice; it sticks only while open.
      setExplicitTab((t) => {
        const tab = v ? t : null;
        persist({ open: v, tab });
        return tab;
      });
    },
    [persist],
  );

  const showPanel = useCallback(
    (p: PanelId, opts?: { explicit?: boolean }) => {
      const explicit = opts?.explicit !== false;
      setOpenState(true);
      if (explicit) {
        setExplicitTab(p);
        persist({ open: true, tab: p });
      } else {
        persist({ open: true, tab: explicitTab });
      }
    },
    [persist, explicitTab],
  );

  const setCommentsOpen = useCallback(
    (v: boolean) => (v ? showPanel('comments') : setOpen(false)),
    [showPanel, setOpen],
  );
  const setReviewOpen = useCallback(
    (v: boolean) => (v ? showPanel('review') : setOpen(false)),
    [showPanel, setOpen],
  );

  /* ------------------------------------------------ the active field */

  const { activeEditor, scalarField } = useMethodologyEditorFocus();
  const [fieldChanges, setFieldChanges] = useState<TrackChange[]>([]);

  useEffect(() => {
    if (!activeEditor || activeEditor.isDestroyed) {
      setFieldChanges([]);
      return;
    }
    const read = () => {
      if (activeEditor.isDestroyed) return;
      setFieldChanges(
        collectChangesFromDoc(activeEditor.state.doc, activeEditor.state.schema),
      );
    };
    read();
    activeEditor.on('update', read);
    activeEditor.on('transaction', read);
    return () => {
      activeEditor.off('update', read);
      activeEditor.off('transaction', read);
    };
  }, [activeEditor]);

  const hasActiveField = !!activeEditor && !activeEditor.isDestroyed;

  /**
   * DOES THE ACTIVE FIELD CARRY TRACKED CHANGES — WITHOUT MOUNTING IT?
   *
   * A mounted editor answers from its own document. An UNMOUNTED field (a
   * lazy rich field showing its static render, or a scalar control inside a
   * block) is answered from the DOM instead: the static renderer keeps the
   * tracked-change marks as `span[data-track-insertion]` /
   * `span[data-track-deletion]`, so a single `querySelector` on the field's
   * wrapper settles it with no editor instance created.
   */
  const [domHasChanges, setDomHasChanges] = useState(false);

  useEffect(() => {
    if (hasActiveField) {
      setDomHasChanges(false);
      return;
    }
    const probe = () => {
      const focused = document.activeElement as HTMLElement | null;
      const field =
        scalarField ??
        (focused?.closest?.(
          '[data-guideline-key], [data-scalar-field], [data-field-root]',
        ) as HTMLElement | null) ??
        null;
      setDomHasChanges(
        !!field?.querySelector('[data-track-insertion], [data-track-deletion]'),
      );
    };
    probe();
    document.addEventListener('focusin', probe);
    return () => document.removeEventListener('focusin', probe);
  }, [hasActiveField, scalarField]);

  const contextTab: PanelId =
    (hasActiveField && fieldChanges.length > 0) || (!hasActiveField && domHasChanges)
      ? 'review'
      : 'comments';

  const activeTab: PanelId = explicitTab ?? contextTab;

  const visiblePanel: PanelId | null = open ? activeTab : null;

  /**
   * FOCUS A MODULE THAT CARRIES COMMENTS AND THE PANEL COMES TO YOU.
   *
   * A module with open threads marks itself `data-has-comments`, so focusing
   * any field inside it opens the region on the Comments tab. A module with
   * none leaves the region exactly as it is, and closing the panel on a module
   * keeps it closed until you move to another one — so the automatic opening
   * never fights a deliberate close.
   */
  const openRef = useRef(open);
  openRef.current = open;
  const dismissedRef = useRef<string | null>(null);
  const focusedTargetRef = useRef<string | null>(null);

  useEffect(() => {
    const onFocusIn = () => {
      const el = document.activeElement as HTMLElement | null;
      const target = el?.closest?.('[data-comment-target]') as HTMLElement | null;
      const key = target?.getAttribute('data-comment-target') ?? null;
      if (key !== focusedTargetRef.current) {
        focusedTargetRef.current = key;
        // A new module clears any previous dismissal.
        if (dismissedRef.current !== key) dismissedRef.current = null;
      }
      if (!key || openRef.current) return;
      if (dismissedRef.current === key) return;
      if (target?.getAttribute('data-has-comments') !== 'true') return;
      showPanel('comments', { explicit: false });
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, [showPanel]);

  // Closing while a module is focused is remembered, so it stays closed there.
  const setOpenTracked = useCallback(
    (v: boolean) => {
      dismissedRef.current = v ? null : focusedTargetRef.current;
      setOpen(v);
    },
    [setOpen],
  );


  const [host, setHost] = useState<HTMLElement | null>(null);

  const ctx: RightPanelCtx = useMemo(
    () => ({
      open,
      setOpen: setOpenTracked,
      activeTab,
      commentsOpen: open,
      reviewOpen: open,
      setCommentsOpen,
      setReviewOpen,
      visiblePanel,
      showPanel,
      host,
      fieldChanges,
      hasActiveField,
    }),
    [
      open,
      setOpenTracked,
      activeTab,
      setCommentsOpen,
      setReviewOpen,
      visiblePanel,
      showPanel,
      host,
      fieldChanges,
      hasActiveField,
    ],
  );

  return (
    <Ctx.Provider value={ctx}>
      {/* The surface itself — narrowed, never covered. */}
      <div
        className="transition-[padding-right] duration-200"
        style={{ paddingRight: open ? RIGHT_PANEL_WIDTH : 0 }}
      >
        {children}
      </div>

      {open &&
        createPortal(
          <aside
            data-right-panel
            className="fixed right-0 top-0 z-40 flex h-screen flex-col border-l border-border bg-background/95 shadow-lg backdrop-blur"
            style={{ width: RIGHT_PANEL_WIDTH }}
          >
            {/* Title row — names the region, so the two controls below it read
                as a switch between its views rather than as page navigation. */}
            <div className="flex items-center justify-between border-b border-border bg-white pl-3 pr-1.5 py-3">
              <span className="text-[18px] font-semibold text-black">Review panel</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setOpenTracked(false)}
                aria-label="Close the review panel"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* The switch itself: two filled buttons, each in its own colour —
                blue for comments, green for tracked changes. */}
            <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
              <button
                type="button"
                onClick={() => showPanel('review')}
                aria-pressed={activeTab === 'review'}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  activeTab === 'review'
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-border bg-white text-foreground hover:bg-muted'
                }`}
              >
                <TrackedChangesIcon className="h-4 w-4" mono={activeTab === 'review'} />
                Tracked changes
              </button>
              <button
                type="button"
                onClick={() => showPanel('comments')}
                aria-pressed={activeTab === 'comments'}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  activeTab === 'comments'
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-border bg-white text-blue-600 hover:bg-muted'
                }`}
              >
                <MessageSquarePlus className="h-4 w-4" />
                Comments
              </button>
            </div>


            {/* The comments panel renders its own content INTO this host, so
                both tabs really are one region rather than two overlays. */}
            <div
              ref={setHost}
              className={`relative min-h-0 flex-1 ${activeTab === 'comments' ? '' : 'hidden'}`}
            />

            {activeTab === 'review' && (
              <ReviewPanelBody
                hasActiveField={hasActiveField}
                changes={fieldChanges}
                editor={activeEditor}
                proposalId={proposalId}
              />
            )}
          </aside>,
          document.body,
        )}
    </Ctx.Provider>
  );
}
