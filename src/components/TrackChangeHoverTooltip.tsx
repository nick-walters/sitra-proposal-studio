/**
 * TRACKED CHANGE — HOVER TOOLTIP
 *
 * Colour alone never says who changed what, or when. This mounts once per
 * proposal and watches the whole page: hovering ANY tracked change — inside a
 * live TipTap instance or in the static HTML a lazy field renders when it is
 * not focused — shows the author's name, the time of the change, and (where
 * permitted) accept/reject controls that resolve the change in place.
 *
 * It is deliberately DOM-based rather than editor-based, so the marks read the
 * same on every surface: Part B modules, WP and case drafts, mirrors.
 *
 * The author is resolved from `data-author-id` at RENDER time, so marks that
 * were recorded with a bad or missing name still name their author.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import { smartTimestamp } from '@/lib/smartTimestamp';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProposalRole } from '@/hooks/useProposalRole';
import { resolveChangeAtElement, trackChangePermissions } from '@/lib/trackChangeResolve';
import { toast } from 'sonner';

const SELECTOR = '[data-track-insertion],[data-track-deletion]';

/** authorId → display name. */
const nameCache = new Map<string, string>();

async function resolveAuthorName(authorId: string, fallback: string): Promise<string> {
  if (!authorId) return fallback || 'Unknown';
  if (authorId === 'ai-assistant') return 'AI assistant';
  const cached = nameCache.get(authorId);
  if (cached) return cached;
  try {
    const { data } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', authorId)
      .maybeSingle();
    const name = data?.full_name || fallback || 'Unknown';
    nameCache.set(authorId, name);
    return name;
  } catch {
    return fallback || 'Unknown';
  }
}

/**
 * Read an attribute from the hovered element or the nearest ancestor that
 * carries it. The decoration span sits INSIDE the mark span, so the identity
 * often lives one level up.
 */
function readAttr(el: HTMLElement, attr: string): string {
  const owner = el.closest(`[${attr}]`) as HTMLElement | null;
  return (owner?.getAttribute(attr) || '').trim();
}

interface HoverState {
  el: HTMLElement;
  changeId: string;
  kind: 'insertion' | 'deletion';
  authorId: string;
  authorName: string;
  colour: string;
  when: string | null;
  x: number;
  y: number;
}

export function TrackChangeHoverTooltip({ proposalId }: { proposalId?: string }) {
  const [hover, setHover] = useState<HoverState | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const tooltipRef = useRef<HTMLDivElement>(null);

  const { user } = useAuth();
  const { roleTier } = useProposalRole(proposalId);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && tooltipRef.current?.contains(target)) {
        clearTimeout(hideTimer.current);
        return;
      }
      const el = target?.closest?.(SELECTOR) as HTMLElement | null;
      // The document editor carries its own accept/reject bubble, which
      // already names the author — never stack two tooltips there.
      if (el?.closest('[data-track-menu-host]')) return;
      if (!el) {
        clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setHover(null), 200);
        return;
      }
      clearTimeout(hideTimer.current);
      const rect = el.getBoundingClientRect();
      const colour = readAttr(el, 'data-author-color');
      const stamp = readAttr(el, 'data-timestamp');
      let when: string | null = null;
      if (stamp) {
        try {
          when = smartTimestamp(new Date(stamp));
        } catch {
          when = null;
        }
      }
      const next: HoverState = {
        el,
        changeId: readAttr(el, 'data-change-id'),
        kind: el.closest('[data-track-deletion]') ? 'deletion' : 'insertion',
        authorId: readAttr(el, 'data-author-id'),
        authorName: readAttr(el, 'data-author-name') || 'Unknown',
        colour: /^#[0-9a-fA-F]{3,8}$/.test(colour) ? colour : '#3B82F6',
        when,
        x: rect.left + rect.width / 2,
        y: rect.top,
      };
      setHover((prev) =>
        prev &&
        prev.changeId === next.changeId &&
        prev.authorId === next.authorId &&
        prev.kind === next.kind &&
        prev.when === next.when &&
        Math.abs(prev.x - next.x) < 1 &&
        Math.abs(prev.y - next.y) < 1
          ? prev
          : next,
      );
    };

    document.addEventListener('mousemove', onMove, true);
    return () => {
      document.removeEventListener('mousemove', onMove, true);
      clearTimeout(hideTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!hover) {
      setName(null);
      return;
    }
    let cancelled = false;
    void resolveAuthorName(hover.authorId, hover.authorName).then((n) => {
      if (!cancelled) setName(n);
    });
    return () => {
      cancelled = true;
    };
  }, [hover?.authorId, hover?.authorName, hover]);

  /**
   * Resolve the hovered change. On a static (unfocused) field the editor is
   * not mounted yet, so the field is asked to hydrate first; the change is
   * then applied through the editor, which writes through the field's normal
   * versioned save path — conflict rejection still applies.
   */
  const resolveChange = useCallback(
    async (action: 'accept' | 'reject') => {
      if (!hover || busy) return;
      const { el, changeId, x, y } = hover;
      if (!changeId) return;
      setBusy(true);
      try {
        // Same path the review panel uses, so both routes behave identically.
        const outcome = await resolveChangeAtElement(el, changeId, action, { x, y: y + 2 });
        if (outcome === 'no-editor') {
          toast.error('Open the field first, then accept or reject the change.');
          return;
        }
        if (outcome === 'failed') {
          toast.error('That change could not be resolved.');
          return;
        }
        setHover(null);
      } finally {
        setBusy(false);
      }
    },
    [hover, busy],
  );

  if (!hover) return null;

  // Coordinator and above may resolve any change. A change's own author may
  // withdraw their own edit — rejecting it is not a review action.
  const { canAccept, canReject } = trackChangePermissions({
    roleTier,
    userId: user?.id,
    authorId: hover.authorId,
  });

  return createPortal(
    <div
      ref={tooltipRef}
      className="pointer-events-auto fixed z-[9998] flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[10px] text-muted-foreground shadow-md"
      style={{
        left: hover.x,
        top: hover.y,
        transform: 'translate(-50%, -100%) translateY(-6px)',
      }}
      onMouseEnter={() => clearTimeout(hideTimer.current)}
      onMouseLeave={() => {
        hideTimer.current = setTimeout(() => setHover(null), 200);
      }}
    >
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: hover.colour }}
      />
      <span>
        {name || hover.authorName} · {hover.kind === 'insertion' ? 'inserted' : 'deleted'}
        {hover.when && <span className="opacity-70"> · {hover.when}</span>}
      </span>
      {canAccept && (
        <button
          type="button"
          disabled={busy}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void resolveChange('accept')}
          className="rounded p-0.5 text-green-600 hover:bg-green-100 disabled:opacity-50 dark:text-green-400 dark:hover:bg-green-900/30"
          title="Accept change"
          aria-label="Accept change"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      )}
      {canReject && (
        <button
          type="button"
          disabled={busy}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void resolveChange('reject')}
          className="rounded p-0.5 text-red-600 hover:bg-red-100 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/30"
          title="Reject change"
          aria-label="Reject change"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>,
    document.body,
  );
}

export default TrackChangeHoverTooltip;
