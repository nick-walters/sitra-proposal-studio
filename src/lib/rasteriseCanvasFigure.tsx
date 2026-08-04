import { createRoot } from 'react-dom/client';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ImpactCanvasFreeformRenderer } from '@/components/ImpactCanvasFreeformRenderer';
import { renderElementToPngBlob } from '@/lib/domExport';
import { generateProposalFilePath, uploadProposalFile } from '@/lib/proposalStorage';

/**
 * Stage D — rasterise a Figure Canvas ('canvas' figure type) to a PNG.
 *
 * The canvas ELEMENTS remain the source of truth; the PNG is a derived
 * render that lets a canvas figure flow through the EXISTING image-figure
 * path (InsertFigureDialog filters on content.imageUrl, contain-fit inline
 * rendering, PDF/Word export) with no bespoke insertion/export code.
 *
 * The Impact Canvas is NOT routed through here — it keeps its live B2.1
 * mirror / PDF graphic / Word table-swap / manual PNG download.
 */

/** Logical render width: cm → CSS px at 96 dpi. domExport then captures at
 *  scale 4 (see PNG_EXPORT_SCALE), i.e. ~384 dpi — print-crisp. */
const PX_PER_CM = 96 / 2.54;

/** Stable signature of the canvas content — used to skip re-capture when
 *  nothing meaningful changed. */
export function canvasSignature(
  elements: Array<Record<string, unknown>>,
  widthCm: number,
  heightCm: number,
): string {
  const rows = elements
    .map((e) =>
      JSON.stringify([
        e.id, e.kind, e.x, e.y, e.w, e.h, e.z,
        e.content ?? null, e.style ?? null,
      ]),
    )
    .sort();
  return `${widthCm}x${heightCm}|${rows.join('|')}`;
}

const ELS_KEY = (figureId: string) => ['canvas-elements', figureId];

export async function fetchCanvasElements(qc: QueryClient, figureId: string) {
  return qc.fetchQuery({
    queryKey: ELS_KEY(figureId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('impact_canvas_elements')
        .select('id, kind, bound_row_id, bound_col_key, x, y, w, h, z, content, style')
        .eq('figure_id', figureId)
        .order('z');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 0,
  });
}

function nextFrame() {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}

/**
 * Renders the figure's canvas off-screen (freeform mode, fixed size) and
 * returns a PNG blob. Reuses the same detached-snapshot → html2canvas
 * pipeline as the Impact Canvas PNG export.
 */
export async function renderCanvasFigurePng(
  qc: QueryClient,
  opts: { proposalId: string; figureId: string; widthCm: number; heightCm: number },
): Promise<Blob | null> {
  const { proposalId, figureId, widthCm, heightCm } = opts;

  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.position = 'fixed';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.width = `${Math.round(widthCm * PX_PER_CM)}px`;
  host.style.backgroundColor = '#ffffff';
  document.body.appendChild(host);

  const root = createRoot(host);
  try {
    root.render(
      <QueryClientProvider client={qc}>
        <ImpactCanvasFreeformRenderer
          proposalId={proposalId}
          figureId={figureId}
          fallback="empty"
          canvasSize={{
            widthCm,
            minHeightCm: heightCm,
            maxHeightCm: heightCm,
            headerHeightCm: 0,
            adaptive: false,
          }}
        />
      </QueryClientProvider>,
    );

    // Let React commit, then let fonts/images settle.
    await nextFrame();
    await nextFrame();
    await new Promise((r) => setTimeout(r, 250));

    const graphic =
      (host.querySelector('[data-impact-canvas-graphic="true"]') as HTMLElement | null) ?? host;
    return await renderElementToPngBlob(graphic);
  } finally {
    // Unmount asynchronously — React forbids unmounting during render.
    setTimeout(() => {
      root.unmount();
      host.remove();
    }, 0);
  }
}

/**
 * Rasterise + upload. Returns the storage path to write into
 * figures.content.imageUrl.
 */
export async function rasteriseAndUploadCanvasFigure(
  qc: QueryClient,
  opts: {
    proposalId: string;
    figureId: string;
    figureNumber: string;
    widthCm: number;
    heightCm: number;
  },
): Promise<string | null> {
  const blob = await renderCanvasFigurePng(qc, opts);
  if (!blob) return null;

  const filePath = generateProposalFilePath(
    opts.proposalId,
    'figures',
    `figure-${opts.figureNumber}-canvas.png`,
    { prefix: 'canvas', addTimestamp: true },
  );
  const { storagePath, error } = await uploadProposalFile(blob, filePath, {
    contentType: 'image/png',
  });
  if (error) throw error;
  return storagePath;
}
