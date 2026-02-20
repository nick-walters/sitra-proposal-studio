import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface StickyToolbarWrapperProps {
  children: React.ReactNode;
  scrollContainerSelector?: string;
}

/**
 * Wraps a toolbar so it sticks to the top of its scroll container
 * when the user scrolls past it.
 */
export function StickyToolbarWrapper({ children, scrollContainerSelector = '.flex-1.overflow-auto' }: StickyToolbarWrapperProps) {
  const placeholderRef = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    const placeholder = placeholderRef.current;
    if (!placeholder) return;

    const scrollContainer = placeholder.closest(scrollContainerSelector) as HTMLElement | null;
    if (!scrollContainer) return;

    const update = () => {
      const containerRect = scrollContainer.getBoundingClientRect();
      const placeholderRect = placeholder.getBoundingClientRect();

      if (placeholderRect.top < containerRect.top) {
        setIsStuck(true);
        setStyle({
          position: 'fixed',
          top: containerRect.top,
          left: placeholderRect.left,
          width: placeholderRect.width,
          zIndex: 20,
        });
      } else {
        setIsStuck(false);
      }
    };

    scrollContainer.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();

    return () => {
      scrollContainer.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [scrollContainerSelector]);

  return (
    <>
      <div ref={placeholderRef}>
        {!isStuck && children}
        {isStuck && <div style={{ visibility: 'hidden' }}>{children}</div>}
      </div>
      {isStuck && createPortal(
        <div style={style}>{children}</div>,
        document.body
      )}
    </>
  );
}
