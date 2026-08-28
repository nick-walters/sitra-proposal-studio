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
 *   2. ONE toggle, TWO TABS. A single "Review" control in the page-wide
 *      toolbar opens the region; inside it, a tracked-changes tab and a
 *      comments tab share the space. Which tab opens is decided from the
 *      active field, until the user picks one by hand (see `activeTab`).
 */

export const RIGHT_PANEL_WIDTH = 340;

export type PanelId = 'comments' | 'review';

interface RightPanelCtx {
  /** Is the shared region open at all? One toggle governs both tabs. */
  panelOpen: boolean;
  setPanelOpen: (v: boolean) => void;
  /** Compatibility for the comment controls: the region carries comments. */
  commentsOpen: boolean;
  setCommentsOpen: (v: boolean) => void;
  /** Which tab currently occupies the region — null when the region is closed. */
  visiblePanel: PanelId | null;
  /** Pick a tab by hand. The choice sticks until the field changes or it closes. */
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
 * The toggle persists PER USER, not per session and not per proposal: the key
 * carries the signed-in user's id, so a reviewer who works with the panel open
 * finds it open on every proposal and every later visit on that machine, while
 * another user on the same machine starts from their own state.
 */
const storageKey = (userId: string | undefined) =>
  `sitra.reviewPanel.${userId ?? 'anon'}`;

function readState(key: string): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { open?: boolean };
    return !!parsed.open;
  } catch {
    return false;
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
  const key = storageKey(user?.id);

  const [panelOpen, setPanelOpenState] = useState(false);

  // Read once the user is known, so the stored state is the right person's.
  useEffect(() => {
    setPanelOpenState(readState(key));
  }, [key]);

  const persist = useCallback(
    (open: boolean) => {
      try {
        localStorage.setItem(key, JSON.stringify({ open }));
      } catch {
        /* a full or blocked store must never break the editor */
      }
    },
    [key],
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

  /* ------------------------------------------------ which tab is shown */

  /**
   * A HAND-PICKED tab is held in `manualTab`, separate from the automatic
   * choice — that separation is the whole mechanism. `manualTab` is set ONLY
   * by a tab click, and cleared when the caret moves to another field or the
   * panel closes; while it is null the tab is derived from context, so a
   * default never masquerades as a choice.
   */
  const [manualTab, setManualTab] = useState<PanelId | null>(null);
  const lastEditor = useRef(activeEditor);
  useEffect(() => {
    if (lastEditor.current !== activeEditor) {
      lastEditor.current = activeEditor;
      setManualTab(null);
    }
  }, [activeEditor]);

  const hasActiveField = !!activeEditor && !activeEditor.isDestroyed;

  // Context chooses: a field with tracked changes opens on the review tab,
  // anything else opens on comments.
  const autoTab: PanelId =
    hasActiveField && fieldChanges.length > 0 ? 'review' : 'comments';
  const activeTab: PanelId = manualTab ?? autoTab;

  const setPanelOpen = useCallback(
    (v: boolean) => {
      setPanelOpenState(v);
      persist(v);
      // Closing forgets the hand-picked tab, so the next open follows context.
      if (!v) setManualTab(null);
    },
    [persist],
  );

  const showPanel = useCallback(
    (p: PanelId) => {
      setManualTab(p);
      setPanelOpenState(true);
      persist(true);
    },
    [persist],
  );

  const setCommentsOpen = useCallback(
    (v: boolean) => {
      if (v) showPanel('comments');
      else setPanelOpen(false);
    },
    [showPanel, setPanelOpen],
  );

  const visiblePanel: PanelId | null = panelOpen ? activeTab : null;

  const [host, setHost] = useState<HTMLElement | null>(null);

  const ctx: RightPanelCtx = {
    panelOpen,
    setPanelOpen,
    commentsOpen: panelOpen,
    setCommentsOpen,
    visiblePanel,
    showPanel,
    host,
    fieldChanges,
    hasActiveField,
  };

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
            {/* ONE region, TWO TABS. The tabs are always both present, so a
                reviewer can move between page-wide comments and this field's
                tracked changes without touching the toolbar. */}
            <div className="flex items-center border-b border-border">
              {(['review', 'comments'] as PanelId[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => showPanel(tab)}
                  className={`flex-1 border-b-2 px-3 py-1.5 text-[11px] ${
                    visiblePanel === tab
                      ? 'border-primary font-semibold text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab === 'review' ? 'Tracked changes' : 'Comments'}
                  {tab === 'review' && fieldChanges.length > 0 && (
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      {fieldChanges.length}
                    </span>
                  )}
                </button>
              ))}
              <Button
                variant="ghost"
                size="icon"
                className="mr-1 h-6 w-6 shrink-0"
                aria-label="Close the review panel"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setPanelOpen(false)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* The comments panel renders its own content INTO this host, so
                both tabs really are one region rather than two overlays, and
                the comment stack keeps its scroll position across tab
                switches. */}
            <div
              ref={setHost}
              className={`relative min-h-0 flex-1 ${visiblePanel === 'comments' ? '' : 'hidden'}`}
            />

            {visiblePanel === 'review' && (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">
                  This field only
                </div>
                <ReviewPanelBody
                  hasActiveField={hasActiveField}
                  changes={fieldChanges}
                  editor={activeEditor ?? null}
                  proposalId={proposalId}
                />
              </div>
            )}
          </aside>,
          document.body,
        )}
    </Ctx.Provider>
  );
}
