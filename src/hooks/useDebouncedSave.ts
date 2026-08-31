import { useCallback, useEffect, useRef } from 'react';
import { useUnloadFlush } from '@/lib/unloadFlush';

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
  // The pending value carries the save function that was current WHEN THE TEXT
  // WAS TYPED. Without this, text typed into one row and flushed after the
  // component re-pointed at another row (switching work package mid-sentence)
  // was written against the NEW row's id and version — the guard rejected it
  // and the typed text was lost.
  const pendingRef = useRef<{ value: T; save: (value: T) => void } | null>(null);

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) pending.save(pending.value);
  }, []);

  const push = useCallback(
    (value: T) => {
      pendingRef.current = { value, save: saveRef.current };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending) pending.save(pending.value);
      }, delay);
    },
    [delay],
  );

  // Navigating away, closing the tab or backgrounding the page must not lose
  // the last keystrokes. `useUnloadFlush` covers visibilitychange (the first
  // signal, while the document is still alive and a fetch can complete),
  // pagehide and beforeunload.
  useUnloadFlush(flush);
  useEffect(() => () => flush(), [flush]);

  return { push, flush };
}

export default useDebouncedSave;
