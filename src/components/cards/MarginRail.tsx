import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The page-margin control rail.
 *
 * Every block and module control — and every comment button — lives in the
 * margin to the RIGHT of the page frame, in one vertical line across the whole
 * application.
 *
 * The DELIVERABLE ROW is the reference: its comment button's right edge sits
 * `RAIL_COMMENT_RIGHT_INSET` inside the page frame's right edge, its delete
 * button's right edge sits `RAIL_CONTROL_GAP` to the left of the comment
 * button, and controls within a row are separated by the same gap.
 *
 * Positions are MEASURED against the page frame rather than derived from each
 * host row's own padding, so a block header, a task module, a milestone row and
 * a deliverable row all land on exactly the same vertical line, whatever
 * padding their host happens to carry.
 *
 * Controls run gaplessly right to left: comment, delete, visibility, restore,
 * add. A block that lacks a control simply does not reserve its slot, so its
 * remaining controls sit further right.
 */

/** The comment button is a 7-unit icon button: 28 px square. */
export const RAIL_BUTTON_SIZE = 28;

/**
 * How far the comment button's right edge sits INSIDE the page frame's right
 * edge. Taken from the deliverable row, the reference for every other row.
 */
export const RAIL_COMMENT_RIGHT_INSET = 8.63;

/** The gap between two controls on the rail, deliverable-row measured. */
export const RAIL_CONTROL_GAP = 2.2;

/** Where the comment button starts, measured from the frame edge. */
export const RAIL_COMMENT_LEFT = -(RAIL_COMMENT_RIGHT_INSET + RAIL_BUTTON_SIZE);

/**
 * Where a control row's right edge lands, measured from the frame edge: one
 * control gap to the left of the comment button.
 */
export const RAIL_ROW_RIGHT_INSET =
  RAIL_COMMENT_RIGHT_INSET + RAIL_BUTTON_SIZE + RAIL_CONTROL_GAP;

/** How far the comment button sits below its control row's centre line. */
export const RAIL_COMMENT_TOP = 2;

/** Kept for callers that still pass it; the rail is measured, not padded. */
export const RAIL_SHIFT = -41;

/**
 * The deliverable row's own offsets from the shared rail. The row sits in a
 * document table whose right edge is not the page frame, so its controls are
 * nudged onto their final position: the comment button by
 * `RAIL_DELIVERABLE_COMMENT_NUDGE`, the delete button by
 * `RAIL_DELIVERABLE_DELETE_NUDGE`. Linked activities' delete uses the same
 * delete nudge, so the two land on one vertical line.
 */
export const RAIL_DELIVERABLE_COMMENT_NUDGE = 7.4;
export const RAIL_DELIVERABLE_DELETE_NUDGE = 13.6;

/**
 * The page frame a rail aligns to. The OUTERMOST match is used — a page
 * surface nested inside a block card must not pull its controls 1 px off the
 * card's own rail — so every surface resolves to the same edge.
 */
export const RAIL_EDGE_SELECTOR =
  '[data-comment-rail-edge],.wp-block-frame,.doc-surface-page';

export function railFrame(el: Element | null): HTMLElement | null {
  let node: Element | null = el;
  let outermost: HTMLElement | null = null;
  while (node) {
    if (node instanceof HTMLElement && node.matches(RAIL_EDGE_SELECTOR)) outermost = node;
    node = node.parentElement;
  }
  return outermost;
}

/**
 * Measures how far a control group must move horizontally for its right edge
 * to land on the shared rail, and keeps that measurement current as the page
 * resizes. Returns a translateX in CSS pixels.
 */
export function useRailAlign(ref: React.RefObject<HTMLElement>, nudge = 0) {
  const [dx, setDx] = useState(0);
  const applied = useRef(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const node = ref.current;
      if (!node) return;
      const frame = railFrame(node);
      if (!frame) return;
      const rect = node.getBoundingClientRect();
      if (rect.width === 0) return;
      // rect.right already includes the transform we applied last time, so it
      // is removed before the new delta is computed.
      const untransformedRight = rect.right - applied.current;
      const target = frame.getBoundingClientRect().right - RAIL_ROW_RIGHT_INSET;
      // The nudge is part of the transform the element already carries, so it
      // belongs in the applied total; otherwise the next measurement cancels
      // it out and the control creeps back onto the unnudged rail.
      const next = target - untransformedRight + nudge;
      if (Math.abs(next - applied.current) < 0.01) return;
      applied.current = next;
      setDx(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const frame = railFrame(el);
    if (frame) ro.observe(frame);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [ref, nudge]);

  return dx;
}

/**
 * Pulls a trailing control group onto the margin rail. `padding` is accepted
 * for callers written against the older, padding-derived rail; it no longer
 * affects the position, which is measured against the page frame.
 */
export function MarginRail({
  className,
  children,
}: {
  padding?: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const dx = useRailAlign(ref);

  return (
    <div
      ref={ref}
      data-rail-row=""
      className={cn('flex shrink-0 items-center', className)}
      style={{ gap: `${RAIL_CONTROL_GAP}px`, transform: `translateX(${dx}px)` }}
    >
      {children}
    </div>
  );
}


/**
 * The same rail, for a control that hangs off a document table cell rather
 * than sitting in a flow control row — deliverables, milestones and risks.
 * It is placed at the cell's right edge, then measured onto the shared line.
 */
export function MarginRailAbsolute({
  className,
  children,
  nudge = 0,
}: {
  className?: string;
  children: ReactNode;
  /** Per-surface horizontal nudge, in CSS pixels, applied after alignment. */
  nudge?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const dx = useRailAlign(ref, nudge);

  return (
    <div
      ref={ref}
      className={cn('absolute left-full top-1/2 flex items-center', className)}
      style={{
        gap: `${RAIL_CONTROL_GAP}px`,
        transform: `translate(${dx}px, -50%)`,
      }}
    >
      {children}
    </div>
  );
}


export default MarginRail;
