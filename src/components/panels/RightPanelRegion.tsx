import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useMethodologyEditorFocus } from '@/components/MethodologyEditorFocusContext';
import { collectChangesFromDoc, type TrackChange } from '@/extensions/TrackChanges';

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

function readState(key: string): { open: boolean; tab: PanelId } {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { open: false, tab: 'comments' };
    const parsed = JSON.parse(raw) as {
      open?: boolean;
      tab?: PanelId;
      comments?: boolean;
      review?: boolean;
    };
    // Legacy shape: two independent booleans.
    const open = parsed.open ?? !!(parsed.comments || parsed.review);
    const tab: PanelId = parsed.tab ?? (parsed.review && !parsed.comments ? 'review' : 'comments');
    return { open, tab };
  } catch {
    return { open: false, tab: 'comments' };
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
  const [activeTab, setActiveTabState] = useState<PanelId>('comments');

  // Read once the user is known, so the stored state is the right person's.
  useEffect(() => {
    const s = readState(key);
    setOpenState(s.open);
    setActiveTabState(s.tab);
  }, [key]);

  const persist = useCallback(
    (next: { open: boolean; tab: PanelId }) => {
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
      setActiveTabState((t) => {
        persist({ open: v, tab: t });
        return t;
      });
    },
    [persist],
  );

  const showPanel = useCallback(
    (p: PanelId) => {
      setOpenState(true);
      setActiveTabState(p);
      persist({ open: true, tab: p });
    },
    [persist],
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

  const { activeEditor } = useMethodologyEditorFocus();
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

  const visiblePanel: PanelId | null = open ? activeTab : null;

  const [host, setHost] = useState<HTMLElement | null>(null);

  const ctx: RightPanelCtx = useMemo(
    () => ({
      open,
      setOpen,
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
      setOpen,
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
            className="fixed right-0 top-0 z-40 flex h-screen flex-col border-l border-border bg-background/95 shadow-lg backdrop-blur"
            style={{ width: RIGHT_PANEL_WIDTH }}
          >
            <div className="flex items-center justify-between border-b border-border pl-3 pr-1.5 py-1.5">
              <div className="flex items-center gap-3 text-[12px]">
                <button
                  type="button"
                  onClick={() => showPanel('review')}
                  className={
                    activeTab === 'review'
                      ? 'font-semibold text-foreground underline underline-offset-4'
                      : 'text-muted-foreground hover:text-foreground'
                  }
                >
                  Tracked changes
                </button>
                <button
                  type="button"
                  onClick={() => showPanel('comments')}
                  className={
                    activeTab === 'comments'
                      ? 'font-semibold text-foreground underline underline-offset-4'
                      : 'text-muted-foreground hover:text-foreground'
                  }
                >
                  Comments
                </button>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setOpen(false)}
                aria-label="Close the review panel"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* The comments panel renders its own content INTO this host, so
                both tabs really are one region rather than two overlays. */}
            <div
              ref={setHost}
              className={`relative min-h-0 flex-1 ${activeTab === 'comments' ? '' : 'hidden'}`}
            />

            {activeTab === 'review' && (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
                <p className="text-[12px] text-muted-foreground">
                  Click in a field to review its tracked changes.
                </p>
              </div>
            )}
          </aside>,
          document.body,
        )}
    </Ctx.Provider>
  );
}
