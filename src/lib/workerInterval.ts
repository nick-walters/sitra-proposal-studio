/**
 * A timer that keeps ticking when the window is minimised.
 *
 * Main-thread `setInterval` is clamped hard by browsers once a window is
 * hidden or minimised (typically once per minute, and on some platforms
 * suspended altogether once the compositor stops the tab). Worker timers are
 * not subject to that clamping, so the lock heartbeat runs from a Worker
 * created from an inline blob. If Workers are unavailable the helper falls
 * back to `setInterval`, which is no worse than the previous behaviour.
 */
export function createWorkerInterval(periodMs: number, tick: () => void): () => void {
  if (typeof Worker !== 'undefined' && typeof URL.createObjectURL === 'function') {
    try {
      const src = `let id=null;onmessage=(e)=>{if(e.data&&e.data.type==='start'){if(id)clearInterval(id);id=setInterval(()=>postMessage('tick'),e.data.period);}else if(e.data&&e.data.type==='stop'){if(id)clearInterval(id);id=null;}};`;
      const url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
      const worker = new Worker(url);
      worker.onmessage = () => tick();
      worker.postMessage({ type: 'start', period: periodMs });
      return () => {
        worker.postMessage({ type: 'stop' });
        worker.terminate();
        URL.revokeObjectURL(url);
      };
    } catch {
      /* fall through to the main-thread timer */
    }
  }
  const id = window.setInterval(tick, periodMs);
  return () => window.clearInterval(id);
}
