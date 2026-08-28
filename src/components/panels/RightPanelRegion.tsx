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
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useMethodologyEditorFocus } from '@/components/MethodologyEditorFocusContext';
import { collectChangesFromDoc, type TrackChange } from '@/extensions/TrackChanges';
import { ReviewPanelBody } from '@/components/panels/ReviewPanel';

/**
 * THE RIGHT-HAND PANEL REGION
 *
 * One region on the right of every editing surface, shared by the comments
 * panel and the tracked-changes review panel. Two rules make it work:
 *
 *   1. The editor SHIFTS rather than being covered. The region is a fixed
 *      column on the right, and the surface below gets an equal padding, so
 *      the document is never obscured — it simply narrows.
 *   2. ONE panel occupies the region at a time. Both buttons are independent
 *      toggles; which of the two is actually SHOWING is decided from the
 *      active field (see `visiblePanel`), with a tab link to switch by hand.
 */

export const RIGHT_PANEL_WIDTH = 340;

export type PanelId = 'comments' | 'review';

interface RightPanelCtx {
  commentsOpen: boolean;
  reviewOpen: boolean;
  setCommentsOpen: (v: boolean) => void;
  setReviewOpen: (v: boolean) => void;
  /** Which panel currently occupies the region — null when the region is closed. */
  visiblePanel: PanelId | null;
  /** Tab link: show this panel until the active field changes. */
  showPanel: (p: PanelId) => void;
  /** Portal target for the comments panel's own content. */
  host: HTMLElement | null;
  /** Tracked changes in the ACTIVE field only — the review panel's whole scope. */
  fieldChanges: TrackChange[];
  hasActiveField: boolean;
}

const Ctx = createContext<RightPanelCtx | null>(null);

export function useRightPanel() {
  return useContext(Ctx);
}

/* --------------------------------------------------------- persistence */

/**
 * The toggles persist PER USER AND PER PROPOSAL, in `localStorage`, so a
 * reviewer who works with both panels open keeps them open across visits and
 * across sessions on that machine, while another proposal — and another user
 * on the same machine — starts from its own state.
 */
const storageKey = (userId: string | undefined, proposalId: string) =>
  `sitra.rightPanel.${userId ?? 'anon'}.${proposalId}`;

function readState(key: string): { comments: boolean; review: boolean } {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { comments: false, review: false };
    const parsed = JSON.parse(raw) as { comments?: boolean; review?: boolean };
    return { comments: !!parsed.comments, review: !!parsed.review };
  } catch {
    return { comments: false, review: false };
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

  const [commentsOpen, setCommentsOpenState] = useState(false);
  const [reviewOpen, setReviewOpenState] = useState(false);

  // Read once the user is known, so the stored state is the right person's.
  useEffect(() => {
    const s = readState(key);
    setCommentsOpenState(s.comments);
    setReviewOpenState(s.review);
  }, [key]);

  const persist = useCallback(
    (next: { comments: boolean; review: boolean }) => {
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* a full or blocked store must never break the editor */
      }
    },
    [key],
  );

  const setCommentsOpen = useCallback(
    (v: boolean) => {
      setCommentsOpenState(v);
      setReviewOpenState((r) => {
        persist({ comments: v, review: r });
        return r;
      });
    },
    [persist],
  );

  const setReviewOpen = useCallback(
    (v: boolean) => {
      setReviewOpenState(v);
      setCommentsOpenState((c) => {
        persist({ comments: c, review: v });
        return c;
      });
    },
    [persist],
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

  /* --------------------------------------------- which panel is shown */

  // A hand-picked tab wins until the caret moves to another field, at which
  // point the automatic choice takes over again.
  const [override, setOverride] = useState<PanelId | null>(null);
  const lastEditor = useRef(activeEditor);
  useEffect(() => {
    if (lastEditor.current !== activeEditor) {
      lastEditor.current = activeEditor;
      setOverride(null);
    }
  }, [activeEditor]);

  const hasActiveField = !!activeEditor && !activeEditor.isDestroyed;

  const visiblePanel: PanelId | null = useMemo(() => {
    if (!commentsOpen && !reviewOpen) return null;
    if (commentsOpen && !reviewOpen) return 'comments';
    if (reviewOpen && !commentsOpen) return 'review';
    if (override) return override;
    // Both on: the review panel takes the region only when the active field
    // actually has something to review.
    return hasActiveField && fieldChanges.length > 0 ? 'review' : 'comments';
  }, [commentsOpen, reviewOpen, override, hasActiveField, fieldChanges.length]);

  const showPanel = useCallback((p: PanelId) => {
    setOverride(p);
    if (p === 'comments') setCommentsOpen(true);
    else setReviewOpen(true);
  }, [setCommentsOpen, setReviewOpen]);

  const [host, setHost] = useState<HTMLElement | null>(null);

  const ctx: RightPanelCtx = {
    commentsOpen,
    reviewOpen,
    setCommentsOpen,
    setReviewOpen,
    visiblePanel,
    showPanel,
    host,
    fieldChanges,
    hasActiveField,
  };

  const bothOpen = commentsOpen && reviewOpen;

  return (
    <Ctx.Provider value={ctx}>
      {/* The surface itself — narrowed, never covered. */}
      <div
        className="transition-[padding-right] duration-200"
        style={{ paddingRight: visiblePanel ? RIGHT_PANEL_WIDTH : 0 }}
      >
        {children}
      </div>

      {visiblePanel &&
        createPortal(
          <aside
            className="fixed right-0 top-0 z-40 flex h-screen flex-col border-l border-border bg-background/95 shadow-lg backdrop-blur"
            style={{ width: RIGHT_PANEL_WIDTH }}
          >
            {bothOpen && (
              <div className="flex items-center gap-3 border-b border-border px-3 py-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => showPanel('comments')}
                  className={
                    visiblePanel === 'comments'
                      ? 'font-semibold text-foreground underline underline-offset-4'
                      : 'text-muted-foreground hover:text-foreground'
                  }
                >
                  Comments
                </button>
                <button
                  type="button"
                  onClick={() => showPanel('review')}
                  className={
                    visiblePanel === 'review'
                      ? 'font-semibold text-foreground underline underline-offset-4'
                      : 'text-muted-foreground hover:text-foreground'
                  }
                >
                  Review changes
                </button>
              </div>
            )}

            {/* The comments panel renders its own content INTO this host, so
                both panels really are one region rather than two overlays. */}
            <div
              ref={setHost}
              className={`relative min-h-0 flex-1 ${visiblePanel === 'comments' ? '' : 'hidden'}`}
            />

            {visiblePanel === 'review' && (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <div className="text-[13px] font-semibold">
                    Review changes
                    <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                      this field
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setReviewOpen(false)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <ReviewPanelBody
                  hasActiveField={hasActiveField}
                  changes={fieldChanges}
                />
              </div>
            )}
          </aside>,
          document.body,
        )}
    </Ctx.Provider>
  );
}
