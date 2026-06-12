import { supabase } from '@/integrations/supabase/client';
import { renderElementToPngBlob } from './domExport';

/**
 * Renders a DOM element to PNG using the same detached-snapshot pipeline as
 * the in-app PNG export (which handles SVGs and overflow correctly), then
 * uploads it to `proposal-backups/{proposalId}/_figures-cache/{figureId}.png`
 * so the backup edge function can include rendered PERT/Gantt charts.
 */
export async function cacheFigurePng(
  proposalId: string,
  figureId: string,
  element: HTMLElement,
): Promise<void> {
  if (!proposalId || !figureId || !element) return;
  try {
    const blob = await renderElementToPngBlob(element);
    if (!blob) return;
    const path = `${proposalId}/_figures-cache/${figureId}.png`;
    await supabase.storage
      .from('proposal-backups')
      .upload(path, blob, { contentType: 'image/png', upsert: true });
  } catch (e) {
    console.warn('cacheFigurePng failed', e);
  }
}

/** Debounced wrapper so we don't spam uploads while the user edits. */
const timers = new Map<string, number>();
export function scheduleFigurePngCache(
  proposalId: string,
  figureId: string,
  getElement: () => HTMLElement | null,
  delayMs = 4000,
): void {
  if (!proposalId || !figureId) return;
  const key = `${proposalId}/${figureId}`;
  const prev = timers.get(key);
  if (prev) window.clearTimeout(prev);
  const t = window.setTimeout(() => {
    timers.delete(key);
    const el = getElement();
    if (el) void cacheFigurePng(proposalId, figureId, el);
  }, delayMs);
  timers.set(key, t);
}
