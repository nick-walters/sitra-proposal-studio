/**
 * TRACKED CHANGE — HOVER TOOLTIP
 *
 * Colour alone never says who changed what, or when. This mounts once per
 * proposal and watches the whole page: hovering ANY tracked change — inside a
 * live TipTap instance or in the static HTML a lazy field renders when it is
 * not focused — shows the author's name and the time of the change.
 *
 * It is deliberately DOM-based rather than editor-based, so the marks read the
 * same on every surface: Part B modules, WP and case drafts, mirrors.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { smartTimestamp } from '@/lib/smartTimestamp';
import { supabase } from '@/integrations/supabase/client';

const SELECTOR = '[data-track-insertion],[data-track-deletion]';

/** authorId → display name. */
const nameCache = new Map<string, string>();

async function resolveAuthorName(authorId: string, fallback: string): Promise<string> {
  if (!authorId || authorId === 'ai-assistant') return fallback || 'Unknown';
  const cached = nameCache.get(authorId);
  if (cached) return cached;
  try {
    const { data } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', authorId)
      .single();
    const name = data?.full_name || fallback || 'Unknown';
    nameCache.set(authorId, name);
    return name;
  } catch {
    nameCache.set(authorId, fallback || 'Unknown');
    return fallback || 'Unknown';
  }
}

interface HoverState {
  kind: 'insertion' | 'deletion';
  authorId: string;
  authorName: string;
  colour: string;
  when: string | null;
  x: number;
  y: number;
}

export function TrackChangeHoverTooltip() {
  const [hover, setHover] = useState<HoverState | null>(null);
  const [name, setName] = useState<string | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const el = target?.closest?.(SELECTOR) as HTMLElement | null;
      // The document editor carries its own accept/reject bubble, which
      // already names the author — never stack two tooltips there.
      if (el?.closest('[data-track-menu-host]')) return;
      if (!el) {
        clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setHover(null), 120);
        return;
      }
      clearTimeout(hideTimer.current);
      const rect = el.getBoundingClientRect();
      const colour = (el.getAttribute('data-author-color') || '').trim();
      const stamp = el.getAttribute('data-timestamp');
      let when: string | null = null;
      if (stamp) {
        try {
          when = smartTimestamp(new Date(stamp));
        } catch {
          when = null;
        }
      }
      const next: HoverState = {
        kind: el.hasAttribute('data-track-deletion') ? 'deletion' : 'insertion',
        authorId: el.getAttribute('data-author-id') || '',
        authorName: el.getAttribute('data-author-name') || 'Unknown',
        colour: /^#[0-9a-fA-F]{3,8}$/.test(colour) ? colour : '#3B82F6',
        when,
        x: rect.left + rect.width / 2,
        y: rect.top,
      };
      setHover((prev) =>
        prev &&
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

  if (!hover) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed z-[9998] flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[10px] text-muted-foreground shadow-md"
      style={{
        left: hover.x,
        top: hover.y,
        transform: 'translate(-50%, -100%) translateY(-6px)',
      }}
    >
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: hover.colour }}
      />
      {name || hover.authorName} · {hover.kind === 'insertion' ? 'inserted' : 'deleted'}
      {hover.when && <span className="opacity-70">· {hover.when}</span>}
    </div>,
    document.body,
  );
}

export default TrackChangeHoverTooltip;
