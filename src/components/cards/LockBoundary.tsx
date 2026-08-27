import type { ReactNode } from 'react';
import { LockHolderBadge } from '@/components/cards/LockHolderBadge';

/**
 * The single source of truth for how a collaborative lock looks, everywhere:
 * Part B modules, WP drafts, case drafts and Part A cards.
 *
 * Both states carry the SAME 2px boundary — green while this client holds the
 * lock, red while someone else does. Before this component the holder's ring
 * was 1px and the non-holder's border 1px plus a translucent ring, which read
 * as two different thicknesses, and on a page-styled field the white body
 * overhung the boundary and hid it altogether.
 */
export type LockBoundaryState = 'mine' | 'other' | 'none';

export function lockBoundaryClass(state: LockBoundaryState): string {
  if (state === 'other') return 'rounded-md border-2 border-destructive';
  if (state === 'mine') return 'rounded-md border-2 border-emerald-600';
  // Transparent, but present: the box never changes size when a lock is taken.
  return 'rounded-md border-2 border-transparent';
}

export function lockStateOf(lock: { isMine?: boolean; lockedByOther?: boolean }): LockBoundaryState {
  if (lock.lockedByOther) return 'other';
  if (lock.isMine) return 'mine';
  return 'none';
}

export function LockBoundary({
  state,
  holder,
  className = '',
  children,
  ...rest
}: {
  state: LockBoundaryState;
  holder?: { name?: string | null; avatarUrl?: string | null } | null;
  className?: string;
  children: ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'className'>) {
  return (
    <div className="flex min-w-0 flex-1 items-start gap-2">
      <div className={`min-w-0 flex-1 ${lockBoundaryClass(state)} ${className}`} {...rest}>
        {children}
      </div>
      {state === 'other' && holder && <LockHolderBadge holder={holder as never} />}
    </div>
  );
}

export default LockBoundary;
