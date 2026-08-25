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
 * Text-layer CSS. PDF.js positions transparent spans over the canvas so the
 * page can be selected and copied; the styles below are the minimum the
 * viewer stylesheet provides, without pulling the whole viewer in.
 */
const TEXT_LAYER_CSS = `
.typst-text-layer{position:absolute;inset:0;overflow:hidden;line-height:1;
 text-align:initial;text-size-adjust:none;forced-color-adjust:none;
 transform-origin:0 0;caret-color:CanvasText;z-index:1;}
.typst-text-layer :is(span,br){color:transparent;position:absolute;
 white-space:pre;cursor:text;transform-origin:0% 0%;}
.typst-text-layer span[role="img"]{user-select:none;}
.typst-text-layer ::selection{background:rgba(59,130,246,0.35);}
`;

function ensureTextLayerStyles(): void {
  if (document.getElementById('typst-text-layer-styles')) return;
  const style = document.createElement('style');
  style.id = 'typst-text-layer-styles';
  style.textContent = TEXT_LAYER_CSS;
  document.head.appendChild(style);
}

/**
 * Replaces `container`'s children with one page per PDF page — a canvas with a
 * transparent PDF.js text layer over it, so the preview is selectable and
 * copyable, not a picture of a document. Returns the page count.
 */
export async function renderPdfToContainer(
  pdf: Uint8Array,
  container: HTMLElement,
): Promise<number> {
  const pdfjs = await getPdfjs();
  ensureTextLayerStyles();
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
    const cssViewport = page.getViewport({ scale: cssScale });
    const viewport = page.getViewport({ scale: cssScale * dpr });

    const pageEl = document.createElement('div');
    pageEl.style.position = 'relative';
    pageEl.style.width = '100%';
    pageEl.style.height = `${cssViewport.height}px`;
    pageEl.style.marginBottom = '8px';
    pageEl.style.border = '1px solid hsl(var(--border))';
    pageEl.style.borderRadius = '4px';
    pageEl.style.overflow = 'hidden';
    pageEl.style.setProperty('--scale-factor', String(cssScale));
    pageEl.style.setProperty('--total-scale-factor', String(cssScale));

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    pageEl.appendChild(canvas);

    const textLayerEl = document.createElement('div');
    textLayerEl.className = 'typst-text-layer';
    pageEl.appendChild(textLayerEl);
    container.appendChild(pageEl);

    await page.render({ canvasContext: ctx, viewport }).promise;
    try {
      const textLayer = new pdfjs.TextLayer({
        textContentSource: page.streamTextContent(),
        container: textLayerEl,
        viewport: cssViewport,
      });
      await textLayer.render();
    } catch {
      // A page whose text layer fails still shows its canvas.
      textLayerEl.remove();
    }
  }
  const count = doc.numPages;
  void loadingTask.destroy();
  return count;
}

