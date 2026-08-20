import { useCallback, useEffect, useRef } from 'react';

/**
 * 800 ms trailing debounce for free-typing fields — the same delay the cards
 * board and linked-activities table use.
 *
 * `push` records the newest value and restarts the timer; `flush` writes any
 * pending value at once (blur, unmount, tab hide). Nothing is written when no
 * value is pending, so blur after an idle pause does not produce a second row.
 */
export function useDebouncedSave<T>(save: (value: T) => void, delay = 800) {
  const saveRef = useRef(save);
  saveRef.current = save;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ value: T } | null>(null);

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) saveRef.current(pending.value);
  }, []);

  const push = useCallback(
    (value: T) => {
      pendingRef.current = { value };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending) saveRef.current(pending.value);
      }, delay);
    },
    [delay],
  );

  // Navigating away, closing the tab or backgrounding the page must not lose
  // the last keystrokes.
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      flush();
    };
  }, [flush]);

  return { push, flush };
}

export default useDebouncedSave;
