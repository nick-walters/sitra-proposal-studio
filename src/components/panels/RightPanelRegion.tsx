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
import { ReviewPanelBody } from '@/components/panels/ReviewPanel';

/**
 * THE RIGHT-HAND PANEL REGION
 *
 * ONE region on the right of every editing surface, opened by ONE toggle and
 * carrying TWO tabs: tracked changes and comments. Two rules make it work:
 *
 *   1. The editor SHIFTS rather than being covered. The region is a fixed
 *      column on the right, and the surface below gets an equal padding, so
 *      the document is never obscured — it simply narrows.
 *   2. Which tab is showing is decided from context (see `visiblePanel`)
 *      UNLESS the user has clicked a tab, which sticks until they click the
 *      other one or close the panel.
 */

export const RIGHT_PANEL_WIDTH = 340;

export type PanelId = 'comments' | 'review';

interface RightPanelCtx {
  /** Is the region open at all? One toggle governs both tabs. */
  open: boolean;
  setOpen: (v: boolean) => void;
  /** Which tab occupies the region — null when the region is closed. */
  visiblePanel: PanelId | null;
  /** An EXPLICIT tab choice; also opens the region. */
  showPanel: (p: PanelId) => void;
  /** Portal target for the comments panel's own content. */
  host: HTMLElement | null;
  /** Tracked changes in the ACTIVE field only — the review tab's whole scope. */
  fieldChanges: TrackChange[];
  hasActiveField: boolean;

  /* Back-compatible aliases: both old toggles now drive the one region. */
  commentsOpen: boolean;
  reviewOpen: boolean;
  setCommentsOpen: (v: boolean) => void;
  setReviewOpen: (v: boolean) => void;
}

const Ctx = createContext<RightPanelCtx | null>(null);

export function useRightPanel() {
  return useContext(Ctx);
}

/* --------------------------------------------------------- persistence */

/**
 * The toggle persists PER USER AND PER PROPOSAL, in `localStorage` under
 * `sitra.rightPanel.<userId>.<proposalId>` — not in component state and not in
 * `sessionStorage` — so a reviewer who works with the panel open keeps it open
 * across visits and across sessions on that machine, while another proposal,
 * and another user on the same machine, each start from their own state.
 */
const storageKey = (userId: string | undefined, proposalId: string) =>
  `sitra.rightPanel.${userId ?? 'anon'}.${proposalId}`;

function readState(key: string): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { open?: boolean; comments?: boolean; review?: boolean };
    // Older stores kept two booleans; either one counts as "was open".
    return !!(parsed.open ?? (parsed.comments || parsed.review));
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
  const key = storageKey(user?.id, proposalId);

  const [open, setOpenState] = useState(false);

  // Read once the user is known, so the stored state is the right person's.
  useEffect(() => {
    setOpenState(readState(key));
  }, [key]);

  /**
   * A manual tab choice is distinguished from the automatic one by being
   * stored SEPARATELY: `override` is null while the tab is chosen by context,
   * and holds a panel id only when the user clicked a tab. It is cleared when
   * the region closes, so the next opening starts from context again.
   */
  const [override, setOverride] = useState<PanelId | null>(null);

  const setOpen = useCallback(
    (v: boolean) => {
      setOpenState(v);
      if (!v) setOverride(null);
      try {
        localStorage.setItem(key, JSON.stringify({ open: v }));
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

  const hasActiveField = !!activeEditor && !activeEditor.isDestroyed;

  /* --------------------------------------------- which tab is showing */

  const visiblePanel: PanelId | null = useMemo(() => {
    if (!open) return null;
    if (override) return override;
    // Context: a field with something to review opens on the review tab;
    // everything else — a clean field, or no field at all — opens on comments.
    return hasActiveField && fieldChanges.length > 0 ? 'review' : 'comments';
  }, [open, override, hasActiveField, fieldChanges.length]);

  const showPanel = useCallback(
    (p: PanelId) => {
      setOverride(p);
      setOpen(true);
    },
    [setOpen],
  );

  const [host, setHost] = useState<HTMLElement | null>(null);

  const ctx: RightPanelCtx = {
    open,
    setOpen,
    visiblePanel,
    showPanel,
    host,
    fieldChanges,
    hasActiveField,
    commentsOpen: open,
    reviewOpen: open,
    setCommentsOpen: setOpen,
    setReviewOpen: setOpen,
  };

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
            <div className="flex items-center justify-between border-b border-border pl-1 pr-2">
              <div className="flex items-center">
                <TabButton
                  active={visiblePanel === 'review'}
                  onClick={() => showPanel('review')}
                  label="Tracked changes"
                  count={hasActiveField ? fieldChanges.length : undefined}
                />
                <TabButton
                  active={visiblePanel === 'comments'}
                  onClick={() => showPanel('comments')}
                  label="Comments"
                />
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
              className={`relative min-h-0 flex-1 ${visiblePanel === 'comments' ? '' : 'hidden'}`}
            />

            {visiblePanel === 'review' && (
              <div className="flex min-h-0 flex-1 flex-col">
                <ReviewPanelBody
                  proposalId={proposalId}
                  hasActiveField={hasActiveField}
                  changes={fieldChanges}
                  editor={activeEditor ?? null}
                />
              </div>
            )}
          </aside>,
          document.body,
        )}
    </Ctx.Provider>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={
        active
          ? 'border-b-2 border-primary px-2.5 py-2 text-[12px] font-semibold text-foreground'
          : 'border-b-2 border-transparent px-2.5 py-2 text-[12px] text-muted-foreground hover:text-foreground'
      }
    >
      {label}
      {typeof count === 'number' && count > 0 && (
        <span className="ml-1 text-[11px] font-normal text-muted-foreground">{count}</span>
      )}
    </button>
  );
}
