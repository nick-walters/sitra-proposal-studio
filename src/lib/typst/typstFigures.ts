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

/**
 * CACHE BUSTING — ONE TOKEN, PRODUCED ONCE.
 *
 * The virtual asset path carries a token so a compiler/browser cache can never
 * pair a freshly built document with a previously captured `gantt.png`.
 *
 * The token used to live in a module-level variable that `captureFigureAssets`
 * bumped and the emitter re-read. The full-document path captures once in the
 * view and once more inside `buildPartBTypstDocument`, so the second bump
 * changed the token AFTER the assets were registered: the source pointed at a
 * file name the compiler had never been given ("failed to load file (access
 * denied)"). The token is now minted once per capture, baked into the returned
 * asset paths, and the emitter reads the path back OFF THOSE ASSETS — there is
 * no second computation that can disagree.
 */
function mintFigureToken(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function figureAssetPath(kind: FigureKind, token: string): string {
  return `/figures/${kind}-${token}.png`;
}

export type FigurePaths = Partial<Record<FigureKind, string>>;

/**
 * The authoritative emit paths: read straight back off the registered assets,
 * so the source can only ever name a file the compiler actually holds.
 */
export function figurePathsFromAssets(assets: TypstAsset[]): FigurePaths {
  const paths: FigurePaths = {};
  for (const asset of assets) {
    const match = /^\/figures\/(pert|gantt)-/.exec(asset.path);
    if (match) paths[match[1] as FigureKind] = asset.path;
  }
  return paths;
}

export interface CapturedFigures {
  assets: TypstAsset[];
  /** Emit paths for the captured charts — the same strings as `assets`. */
  paths: FigurePaths;
  /** Kinds that were not on the page (collapsed, hidden or absent). */
  missing: FigureKind[];
}

/**
 * The CHART ONLY — never the caption, and never a second implementation.
 *
 * `[data-figure-capture]` is THE capture marker, and exactly one element in
 * the application carries it: the dedicated off-screen host
 * (`GanttCaptureHost`). Earlier revisions marked several nested elements —
 * the B3.1 block wrapper AND the chart's own `overflow: hidden` container —
 * so which one was captured depended on document order, and the clipped one
 * cut off the work-package banner tips. There is no fallback and no
 * widest-of rule: if the marker is absent (or ambiguous) the figure is
 * reported missing.
 */
async function captureOne(kind: FigureKind): Promise<Uint8Array | null> {
  const hosts = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-figure-capture="${kind}"]`),
  ).filter((h) => h.offsetHeight > 0 && h.offsetWidth > 0);
  if (hosts.length !== 1) {
    if (hosts.length > 1) {
      console.error(`[figures] ${hosts.length} capture hosts for "${kind}" — refusing to guess.`);
    }
    return null;
  }
  const blob = await renderElementToPngBlob(hosts[0]);
  if (!blob) return null;
  return new Uint8Array(await blob.arrayBuffer());
}




/** Captures whichever charts are currently rendered on the board. */
export async function captureFigureAssets(
  kinds: FigureKind[] = ['pert', 'gantt'],
): Promise<CapturedFigures> {
  const token = mintFigureToken();
  const assets: TypstAsset[] = [];
  const missing: FigureKind[] = [];

  for (const kind of kinds) {
    try {
      const bytes = await captureOne(kind);
      if (bytes) assets.push({ path: figureAssetPath(kind, token), bytes });
      else missing.push(kind);
    } catch {
      missing.push(kind);
    }
  }
  return { assets, missing, paths: figurePathsFromAssets(assets) };
}
