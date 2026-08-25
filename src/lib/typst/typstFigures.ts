/**
 * Rasterises the Pert and Gantt charts for the Typst document.
 *
 * WHY RASTER, NOT NATIVE TYPST: the Gantt is not a drawing — it is nested
 * `div`s whose bars, pennants and month grid are produced by CSS (borders,
 * gradients, absolute positioning, clip paths). There is no vector source to
 * translate; emitting it natively would mean re-implementing the chart's
 * layout arithmetic a second time in Typst and keeping the two in step for
 * ever. The Pert chart does have an SVG core but its node boxes are HTML
 * around it, so the same argument applies. Both are therefore captured from
 * the live board with the SAME snapshot utility the PNG download button uses
 * (`renderElementToPngBlob`, 4× device scale), which guarantees the PDF shows
 * exactly what the user sees and downloads.
 */

import { renderElementToPngBlob } from '@/lib/domExport';
import type { TypstAsset } from './typstCompiler';

export type FigureKind = 'pert' | 'gantt';

export const FIGURE_ASSET_PATH: Record<FigureKind, string> = {
  pert: '/figures/pert.png',
  gantt: '/figures/gantt.png',
};

export interface CapturedFigures {
  assets: TypstAsset[];
  /** Kinds that were not on the page (collapsed, hidden or absent). */
  missing: FigureKind[];
}

async function captureOne(kind: FigureKind): Promise<Uint8Array | null> {
  const el = document.querySelector<HTMLElement>(`[data-figure-type="${kind}"]`);
  if (!el || el.offsetHeight === 0) return null;
  const blob = await renderElementToPngBlob(el);
  if (!blob) return null;
  return new Uint8Array(await blob.arrayBuffer());
}

/** Captures whichever charts are currently rendered on the board. */
export async function captureFigureAssets(
  kinds: FigureKind[] = ['pert', 'gantt'],
): Promise<CapturedFigures> {
  const assets: TypstAsset[] = [];
  const missing: FigureKind[] = [];
  for (const kind of kinds) {
    try {
      const bytes = await captureOne(kind);
      if (bytes) assets.push({ path: FIGURE_ASSET_PATH[kind], bytes });
      else missing.push(kind);
    } catch {
      missing.push(kind);
    }
  }
  return { assets, missing };
}
