/**
 * One place where "the page is going away — write what is pending" is decided.
 *
 * Every debounced editing surface registers a flusher here. The listeners are
 * installed once for the whole application and fire in the order the browser
 * itself guarantees:
 *
 *  - `visibilitychange` → hidden: the FIRST reliable signal, and the only one
 *    where the document is still fully alive, so an ordinary `fetch` started
 *    from a flusher completes normally. This is what actually saves the text
 *    on a tab switch, an app switch on mobile, or a tab close.
 *  - `pagehide` and `beforeunload`: the last chance. A plain `fetch` started
 *    here is cancelled with the document, so a flusher that must survive this
 *    point has to use `keepalive` (see `unloadRpc.ts`).
 *
 * Flushers must be synchronous and must not throw: one broken surface may not
 * stop the others from writing.
 */

import { useEffect } from 'react';

type Flusher = () => void;

const flushers = new Set<Flusher>();
let installed = false;

/** Runs every registered flusher, isolating failures. */
export function runUnloadFlushers(): void {
  for (const flush of Array.from(flushers)) {
    try {
      flush();
    } catch {
      /* a failing surface must not block the others */
    }
  }
}

function install(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') runUnloadFlushers();
  });
  window.addEventListener('pagehide', runUnloadFlushers);
  window.addEventListener('beforeunload', runUnloadFlushers);
}

/** Registers a flusher for the lifetime of the caller. Returns an unregister. */
export function registerUnloadFlusher(flush: Flusher): () => void {
  install();
  flushers.add(flush);
  return () => {
    flushers.delete(flush);
  };
}

/**
 * Hook form: flush this surface when the tab is hidden or closed. The flusher
 * is read through a ref-free closure, so pass a stable callback.
 */
export function useUnloadFlush(flush: Flusher): void {
  useEffect(() => registerUnloadFlusher(flush), [flush]);
}
