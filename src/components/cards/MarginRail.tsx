import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The page-margin control rail.
 *
 * Every block and module control — and every comment button — sits in one
 * vertical line across the whole application, tucked into the page's own
 * 1.5 cm right margin. Nothing extends past the page's right edge.
 *
 * Controls run gaplessly right to left: comment, delete, visibility, restore,
 * add. A block that lacks a control simply does not reserve its slot, so its
 * remaining controls sit further right.
 */

/**
 * Nothing extends past the page's right edge. The 1.5 cm right margin is
 * 56.7 px wide and a control button is 28 px, so the two outermost controls —
 * comment, then delete — sit side by side INSIDE that margin, and every other
 * control sits to their left inside the content column.
 */

/** Width of one control button (h-7 / w-7). */
export const RAIL_BUTTON = 28;

/**
 * Where the comment button's left edge sits, measured from the frame edge.
 * Negative: the button is inside the page, flush with its right edge.
 */
export const RAIL_COMMENT_LEFT = -RAIL_BUTTON;

/**
 * How far a control row is inset from the frame edge so its last control (the
 * delete button) lands immediately to the left of the comment slot.
 */
export const RAIL_SHIFT = RAIL_BUTTON;

/**
 * Pulls a trailing control group out into the margin rail. `padding` is the
 * host row's own right padding, which is cancelled first: pass `'13px'` for a
 * block header and `'1.5cm'` for a page-margin row.
 */
export function MarginRail({
  padding = '13px',
  className,
  children,
}: {
  padding?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      // Tagged so the floating comment control can align its vertical centre
      // to this row rather than to the top of the module it wraps.
      data-control-row=""
      // Buttons already carry 7 px of internal padding on each side, so a
      // zero gap reads as a tight, even 14 px between glyphs — the same
      // spacing on every block and module across the platform.
      className={cn('flex shrink-0 items-center gap-0', className)}
      style={{ marginRight: `calc(-${padding} + ${RAIL_SHIFT}px)` }}
    >
      {children}
    </div>
  );
}

export default MarginRail;
