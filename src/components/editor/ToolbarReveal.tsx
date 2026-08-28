import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Longer than a double click, short enough not to feel laggy. */
export const TOOLBAR_REVEAL_DELAY_MS = 600;

/**
 * Focus-triggered toolbar tiers must not move the field under the user's
 * cursor: a double click sends its second click to wherever the layout has
 * settled, so a bar that pushes content down between the two clicks loses the
 * word selection.
 *
 * The children are therefore MOUNTED IMMEDIATELY on focus — reserving their
 * exact height, so nothing shifts — and only faded in after the delay.
 */
export function ToolbarReveal({
  active,
  delayMs = TOOLBAR_REVEAL_DELAY_MS,
  children,
}: {
  active: boolean;
  delayMs?: number;
  children: ReactNode;
}) {
  const [shown, setShown] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(timer.current);
    if (!active) {
      setShown(false);
      return;
    }
    timer.current = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(timer.current);
  }, [active, delayMs]);

  if (!active) return null;

  return (
    <div
      aria-hidden={!shown}
      className={cn(
        'transition-opacity duration-200 ease-out motion-reduce:transition-none',
        shown ? 'opacity-100' : 'opacity-0 pointer-events-none',
      )}
    >
      {children}
    </div>
  );
}

export default ToolbarReveal;
