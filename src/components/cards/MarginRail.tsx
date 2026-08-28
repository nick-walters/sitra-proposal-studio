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

/** Where a row-level delete button starts, measured from the frame edge. */
export const RAIL_DELETE_LEFT = 4;

/** Where the comment button starts, measured from the frame edge. */
export const RAIL_COMMENT_LEFT = 28;

/**
 * How far a control row is pulled out of the frame so its last control lands
 * immediately to the left of the comment button.
 */
export const RAIL_SHIFT = 28;

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
      className={cn('flex shrink-0 items-center gap-0.5', className)}
      style={{ marginRight: `calc(-${padding} - ${RAIL_SHIFT}px)` }}
    >
      {children}
    </div>
  );
}

export default MarginRail;
