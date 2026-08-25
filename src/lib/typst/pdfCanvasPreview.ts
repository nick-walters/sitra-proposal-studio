/**
 * Renders compiled PDF bytes to canvas elements with PDF.js.
 *
 * The preview dialog cannot rely on the browser's built-in PDF viewer: it is
 * a plugin, and whether a `blob:` URL renders inside an iframe depends on the
 * browser and its settings (headless Chromium has no PDF plugin at all, and
 * Safari does not render blob-URL PDFs in iframes). Canvas rendering works
 * everywhere, so the preview is identical in every browser.
 *
 * Like the Typst compiler, PDF.js is loaded lazily — nothing here is imported
 * at app start.
 */

let workerReady: Promise<typeof import('pdfjs-dist')> | null = null;

function getPdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (!workerReady) {
    workerReady = (async () => {
      const [pdfjs, worker] = await Promise.all([
        import('pdfjs-dist'),
        import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
      ]);
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })().catch((error) => {
      workerReady = null;
      throw error;
    });
  }
  return workerReady;
}

/**
 * Replaces `container`'s children with one canvas per page, scaled to the
 * container's width. Returns the page count.
 */
export async function renderPdfToContainer(
  pdf: Uint8Array,
  container: HTMLElement,
): Promise<number> {
  const pdfjs = await getPdfjs();
  // getDocument transfers (detaches) the buffer to the worker — pass a copy so
  // the caller's bytes stay usable for the download link.
  const loadingTask = pdfjs.getDocument({ data: pdf.slice() });
  const doc = await loadingTask.promise;
  container.replaceChildren();
  const targetWidth = container.clientWidth || 800;
  const dpr = window.devicePixelRatio || 1;
  for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
    const page = await doc.getPage(pageNo);
    const base = page.getViewport({ scale: 1 });
    const cssScale = targetWidth / base.width;
    const viewport = page.getViewport({ scale: cssScale * dpr });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.style.display = 'block';
    canvas.style.marginBottom = '8px';
    canvas.style.border = '1px solid hsl(var(--border))';
    canvas.style.borderRadius = '4px';
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    await page.render({ canvasContext: ctx, viewport }).promise;
    container.appendChild(canvas);
  }
  const count = doc.numPages;
  void loadingTask.destroy();
  return count;
}
