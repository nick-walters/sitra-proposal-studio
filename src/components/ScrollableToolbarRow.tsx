import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ScrollableToolbarRowProps {
  children: ReactNode;
  className?: string;
}

/**
 * A single-line, horizontally scrolling toolbar row.
 * Never wraps; shows edge fades when content is cut off on either side.
 */
export function ScrollableToolbarRow({ children, className }: ScrollableToolbarRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);

  const update = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setShowLeft(el.scrollLeft > 1);
    setShowRight(max > 1 && el.scrollLeft < max - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    update();
    el.addEventListener('scroll', update, { passive: true });

    const ro = new ResizeObserver(update);
    ro.observe(el);
    Array.from(el.children).forEach((child) => ro.observe(child));

    const mo = new MutationObserver(update);
    mo.observe(el, { childList: true, subtree: true, characterData: true });

    window.addEventListener('resize', update, { passive: true });

    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      ro.disconnect();
      mo.disconnect();
    };
  }, [update]);

  return (
    <div className="relative min-w-0" style={{ ['--toolbar-bg' as string]: 'hsl(var(--card))' }}>
      <div
        ref={scrollRef}
        className={cn(
          'flex flex-nowrap items-center overflow-x-auto whitespace-nowrap [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [&>*]:flex-none',
          className,
        )}
      >
        {children}
      </div>

      {showLeft && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8"
          style={{ background: 'linear-gradient(to right, var(--toolbar-bg), transparent)' }}
        />
      )}
      {showRight && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8"
          style={{ background: 'linear-gradient(to left, var(--toolbar-bg), transparent)' }}
        />
      )}
    </div>
  );
}

export default ScrollableToolbarRow;
