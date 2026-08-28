import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The page-margin control rail.
 *
 * Every block and module control — and every comment button — lives in the
 * margin to the RIGHT of the page frame, in one vertical line across the whole
 * application. The reference position is the deliverable row's delete button,
 * which sits `RAIL_DELETE_LEFT` past the frame edge; the comment button follows
 * it at `RAIL_COMMENT_LEFT`.
 *
 * Controls run gaplessly right to left: comment, delete, visibility, restore,
 * add. A block that lacks a control simply does not reserve its slot, so its
 * remaining controls sit further right.
 */

/**
 * Where a row-level delete button starts, measured from the frame edge.
 * Negative: the rail sits INSIDE the page, within its 1.5 cm right margin.
 */
export const RAIL_DELETE_LEFT = -65;

/** Where the comment button starts, measured from the frame edge. */
export const RAIL_COMMENT_LEFT = -41;

/**
 * How far a control row is pulled out of the frame so its last control lands
 * immediately to the left of the comment button. Negative pulls it back in.
 */
export const RAIL_SHIFT = -41;

/**
 * Pulls a trailing control group into the margin rail. `padding` is the
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
      data-rail-row=""
      className={cn('flex shrink-0 items-center gap-0.5', className)}
      style={{ marginRight: `calc(-${padding} - ${RAIL_SHIFT}px)` }}
    >
      {children}
    </div>
  );
}


export default MarginRail;
