import html2canvas from 'html2canvas';
import { supabase } from '@/integrations/supabase/client';

/**
 * Renders a DOM element to PNG and uploads it to the proposal-backups bucket
 * at `{proposalId}/_figures-cache/{figureId}.png` so the backup edge function
 * can include rendered PERT/Gantt charts in the daily figure backup.
 */
export async function cacheFigurePng(
  proposalId: string,
  figureId: string,
  element: HTMLElement,
): Promise<void> {
  if (!proposalId || !figureId || !element) return;
  try {
    await document.fonts.ready;
    const rect = element.getBoundingClientRect();
    const width = Math.max(rect.width, element.scrollWidth, element.offsetWidth);
    const height = Math.max(rect.height, element.scrollHeight, element.offsetHeight);
    if (!width || !height) return;

    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
      width,
      height,
      windowWidth: width,
      windowHeight: height,
    });

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png'),
    );
    if (!blob) return;

    const path = `${proposalId}/_figures-cache/${figureId}.png`;
    await supabase.storage
      .from('proposal-backups')
      .upload(path, blob, { contentType: 'image/png', upsert: true });
  } catch (e) {
    // Cache best-effort; never throw to the UI.
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
