import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Longer than a double click, short enough not to feel laggy. */
export const TOOLBAR_REVEAL_DELAY_MS = 800;

/**
 * Focus-triggered toolbar tiers must not steal the second click of a double
 * click: a bar that appears between the two clicks would otherwise sit under
 * the cursor and swallow it as a button press.
 *
 * Two guards, together:
 *   1. The children are MOUNTED IMMEDIATELY on focus, so their height is
 *      reserved and the field beneath never moves.
 *   2. For the first `delayMs` the whole tier is `pointer-events: none` AND
 *      inert, so a click passes straight THROUGH it to whatever is beneath —
 *      the text — and the word still selects.
 *
 * The bars are visible from the start (faded in quickly); only their
 * interactivity is delayed.
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
  const [interactive, setInteractive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(timer.current);
    if (!active) {
      setInteractive(false);
      return;
    }
    timer.current = setTimeout(() => setInteractive(true), delayMs);
    return () => clearTimeout(timer.current);
  }, [active, delayMs]);

  if (!active) return null;

  return (
    <div
      // `inert` keeps keyboard and click targets out of reach as well, so the
      // event genuinely reaches the element underneath rather than being
      // merely ignored by the bar.
      {...(interactive ? {} : { inert: '' as unknown as boolean })}
      className={cn(
        'transition-opacity duration-200 ease-out motion-reduce:transition-none',
        interactive ? 'opacity-100' : 'opacity-90 pointer-events-none select-none',
      )}
    >
      {children}
    </div>
  );
}

export default ToolbarReveal;
