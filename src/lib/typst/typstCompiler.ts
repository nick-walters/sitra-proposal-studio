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

const FONT_URLS = [nimbusRegular.url, nimbusBold.url, nimbusItalic.url, nimbusBoldItalic.url];

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
    typst.use(
      TypstSnippet.disableDefaultFontAssets(),
      TypstSnippet.preloadFonts(FONT_URLS),
    );
    return typst;
  })();
  return snippetPromise;
}

/** Warms the compiler and fonts without compiling anything. */
export async function preloadTypst(): Promise<void> {
  const typst = await getSnippet();
  await typst.getCompiler();
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
