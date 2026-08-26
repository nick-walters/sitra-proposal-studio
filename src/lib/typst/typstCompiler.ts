/**
 * Lazily-loaded Typst compiler.
 *
 * Nothing in this module is imported at app start: the wrapper, the 28 MB
 * compiler WASM and the fonts are all pulled in by `dynamic import()` /
 * `fetch()` the first time an export is actually opened. The WASM and the
 * fonts are served from the project's own asset URLs — no third-party CDN is
 * contacted at runtime.
 *
 * Typst has no access to system fonts, so the Nimbus Roman (Times-metric)
 * family is registered explicitly. Without this, every glyph falls back to the
 * compiler's built-in sans and the 11pt Times requirement is not met.
 */

import compilerWasm from '@/assets/typst/compiler.wasm.asset.json';
import nimbusRegular from '@/assets/typst/NimbusRoman-Regular.otf.asset.json';
import nimbusBold from '@/assets/typst/NimbusRoman-Bold.otf.asset.json';
import nimbusItalic from '@/assets/typst/NimbusRoman-Italic.otf.asset.json';
import nimbusBoldItalic from '@/assets/typst/NimbusRoman-BoldItalic.otf.asset.json';
// Display face for the banner, the H1/H2 headings and figure text. The
// compiler has no system-font access, so the same TTF the platform relies on
// (`local('Arial Black')` in index.css) is represented in Typst by the bundled
// Archivo Black fallback. It is registered explicitly and is embeddable.
import archivoBlackUrl from '@/assets/fonts/archivo_black.ttf?url';

const FONT_URLS = [
  archivoBlackUrl,
  nimbusRegular.url,
  nimbusBold.url,
  nimbusItalic.url,
  nimbusBoldItalic.url,
];

export interface TypstFontDiagnostics {
  displayFontByteLength: number;
  loadedFonts: string[];
}

let fontDiagnostics: TypstFontDiagnostics | null = null;

/* eslint-disable @typescript-eslint/no-explicit-any */
let snippetPromise: Promise<any> | null = null;

async function getSnippet(): Promise<any> {
  if (snippetPromise) return snippetPromise;
  snippetPromise = (async () => {
    const mod: any = await import('@myriaddreamin/typst.ts/contrib/snippet');
    const { TypstSnippet } = mod;
    const typst = new TypstSnippet();
    typst.setCompilerInitOptions({
      // Explicit BufferSource rather than a Response: the asset host does not
      // have to answer with `application/wasm` for streaming instantiation.
      getModule: () => fetch(compilerWasm.url).then((r) => r.arrayBuffer()),
      beforeBuild: [],
    });
    // Resolve the assets ourselves and hand the compiler the raw bytes. Passing
    // Vite's URL strings through typst.ts made the requests succeed, but the
    // Arial face was silently absent from the resolver and Typst substituted
    // Nimbus Roman. Raw buffers take the unambiguous add_raw_font path.
    const fontBuffers = await Promise.all(
      FONT_URLS.map(async (url) => {
        // `cache: 'reload'` bypasses the HTTP cache for the font bodies. The
        // display face lives at an unhashed dev URL, so a stale or truncated
        // cache entry from an earlier build could be replayed — that is what
        // produced the recurring "unknown font family: archivo black"
        // warnings, and renaming the file only papered over it once.
        const response = await fetch(url, { cache: 'reload' });
        if (!response.ok) throw new Error(`Unable to load Typst font (${response.status})`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength < 1024) {
          throw new Error(`Typst font at ${url} came back empty (${bytes.byteLength} bytes)`);
        }
        return bytes;
      }),
    );
    typst.use(
      TypstSnippet.disableDefaultFontAssets(),
      TypstSnippet.preloadFonts(fontBuffers),
    );
    const compiler = await typst.getCompiler();
    const loaded = compiler?.compiler?.get_loaded_fonts?.();
    fontDiagnostics = {
      displayFontByteLength: fontBuffers[0]?.byteLength ?? 0,
      loadedFonts: Array.isArray(loaded) ? loaded.map(String) : [],
    };
    return typst;
  })();
  return snippetPromise;
}

/** Warms the compiler and fonts without compiling anything. */
export async function preloadTypst(): Promise<void> {
  const typst = await getSnippet();
  await typst.getCompiler();
}

/** Runtime evidence from the same buffers and resolver used for compilation. */
export async function getTypstFontDiagnostics(): Promise<TypstFontDiagnostics> {
  await getSnippet();
  return fontDiagnostics ?? { displayFontByteLength: 0, loadedFonts: [] };
}

export interface TypstCompileResult {
  pdf: Uint8Array;
  /** Wall-clock milliseconds for the compile call only (not the WASM load). */
  compileMs: number;
}

/** A binary file (a rasterised figure) made visible to the compiler. */
export interface TypstAsset {
  /** Virtual path referenced from the source, e.g. "/figures/gantt.png". */
  path: string;
  bytes: Uint8Array;
}

/** Compiles Typst source to PDF bytes. Throws with the compiler diagnostic. */
export async function compileTypstToPdf(
  source: string,
  assets: TypstAsset[] = [],
): Promise<TypstCompileResult> {
  const typst = await getSnippet();
  // Shadow files are global to the compiler instance; clear anything a
  // previous compile left behind so a deleted figure cannot linger.
  await typst.resetShadow();
  for (const asset of assets) {
    await typst.mapShadow(asset.path, asset.bytes);
  }
  const started = performance.now();
  const pdf: Uint8Array = await typst.pdf({ mainContent: source });
  return { pdf, compileMs: Math.round(performance.now() - started) };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
