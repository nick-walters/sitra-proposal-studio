/**
 * THROWAWAY SPIKE — in-browser Typst → PDF proof of concept.
 *
 * Nothing here is wired into the real export pipeline. It exists only to
 * answer the Phase 0 feasibility questions on /typst-spike.
 *
 * Compiler: @myriaddreamin/typst.ts 0.7.0 (Typst 0.13 core), compiled to
 * WebAssembly and run entirely in the browser. The 27 MB .wasm is fetched
 * from a CDN at runtime, so it never enters the JS bundle.
 */
import { createTypstCompiler, type TypstCompiler } from '@myriaddreamin/typst.ts/compiler';
import { loadFonts, disableDefaultFontAssets } from '@myriaddreamin/typst.ts/options.init';

const WASM_URL =
  'https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-ts-web-compiler@0.7.0/pkg/typst_ts_web_compiler_bg.wasm';

/** Nimbus Roman No. 9 L (URW), metric-compatible with Times New Roman. */
const FONT_URLS = [
  '/typst/fonts/NimbusRoman-Regular.otf',
  '/typst/fonts/NimbusRoman-Bold.otf',
  '/typst/fonts/NimbusRoman-Italic.otf',
  '/typst/fonts/NimbusRoman-BoldItalic.otf',
];

let compilerPromise: Promise<TypstCompiler> | null = null;

export interface CompileTimings {
  initMs: number;
  compileMs: number;
  totalMs: number;
  pageCount: number;
  pdfBytes: number;
  wasmBytes: number;
}

async function getCompiler(onStage?: (s: string) => void): Promise<TypstCompiler> {
  if (!compilerPromise) {
    compilerPromise = (async () => {
      onStage?.('Downloading Typst WASM compiler (~27 MB)…');
      const wasm = await fetch(WASM_URL).then((r) => r.arrayBuffer());
      wasmDownloadedBytes = wasm.byteLength;
      onStage?.('Loading Nimbus Roman fonts…');
      const fonts = await Promise.all(
        FONT_URLS.map(async (u) => new Uint8Array((await fetch(u).then((r) => r.arrayBuffer())) as ArrayBuffer)),
      );
      onStage?.('Initialising compiler…');
      const compiler = createTypstCompiler();
      await compiler.init({
        getModule: () => wasm,
        beforeBuild: [disableDefaultFontAssets(), loadFonts(fonts)],
      });
      return compiler;
    })();
  }
  return compilerPromise;
}

let wasmDownloadedBytes = 0;

/** Sample raster image, fetched and embedded into the document at compile time. */
const IMAGE_URL = 'https://picsum.photos/id/1015/900/500.jpg';

function countPdfPages(pdf: Uint8Array): number {
  // Cheap structural count: every page object carries `/Type /Page` (not /Pages).
  let text = '';
  const chunk = 0x8000;
  for (let i = 0; i < pdf.length; i += chunk) {
    text += String.fromCharCode(...pdf.subarray(i, i + chunk));
  }
  const matches = text.match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : 0;
}

export function buildTypstSource(opts: { watermark: boolean }): string {
  const watermark = opts.watermark
    ? `align(center + horizon, rotate(-45deg, text(
        size: 54pt, weight: "bold", fill: rgb(0, 0, 0, 28),
      )[DRAFT: CONFIDENTIAL]))`
    : 'none';

  return String.raw`
// ---------- page setup: A4, 15 mm margins, 11 pt body, single line spacing
#set page(
  paper: "a4",
  margin: 15mm,
  background: ${watermark},
  numbering: "1",
)
#set text(font: "Nimbus Roman No9 L", size: 11pt, lang: "en")
#set par(justify: true, leading: 0.42em, spacing: 0.9em)
#show heading: set text(font: "Nimbus Roman No9 L")

// footnotes: entry text at 8 pt, rendered at the foot of the page holding the mark
#show footnote.entry: set text(size: 8pt)
#set footnote.entry(separator: line(length: 30%, stroke: 0.5pt))

// ---------- cross-reference chips
// Shape 1: rounded rectangle
#let chip(label, colour) = box(
  baseline: 0.18em,
  inset: (x: 3.5pt, y: 1.4pt),
  radius: 2.5pt,
  fill: rgb(colour),
  text(fill: white, weight: "bold", size: 8.5pt, font: "Nimbus Roman No9 L", label),
)

// Shape 2: chevron / pentagon (drawn as a vector polygon)
#let chevron(label, colour) = context {
  let body = text(fill: white, weight: "bold", size: 8.5pt, font: "Nimbus Roman No9 L", label)
  let m = measure(body)
  let w = m.width + 13pt
  let h = m.height + 3.4pt
  box(baseline: 0.18em, width: w, height: h)[
    #place(top + left, polygon(
      fill: rgb(colour),
      (0pt, 0pt), (w - 5pt, 0pt), (w, h / 2), (w - 5pt, h), (0pt, h), (5pt, h / 2),
    ))
    #place(center + horizon, body)
  ]
}

// ---------- table to the Sitra / HE spec
#let he-table(label, caption, cols, header, rows) = {
  let n = rows.len()
  block(width: 18cm)[
    #block(spacing: 0.4em)[#strong(emph(label))#h(0.35em)#emph(caption)]
    #table(
      columns: cols,
      inset: (x: 0.3pt, y: 0pt),
      align: left + top,
      stroke: (x, y) => (
        bottom: if y == 0 { 1.125pt + black }        // 1.5 px header rule
                else if y < n { 0.75pt + rgb("#e5e7eb") }  // 1 px body rule
                else { none },                        // no rule under last row
      ),
      fill: none,
      table.header(repeat: false, ..header.map(h => text(weight: "bold", h))),
      ..rows.flatten(),
    )
  ]
}

= Work packages, resources and implementation

This is a throwaway Typst rendering spike for Sitra Proposal Studio. It exercises the
Horizon Europe Part B page geometry (A4, 15 mm margins, 11 pt Nimbus Roman, single
spacing) together with the constructs that the browser print engine handles badly:
per-page footnotes, tables that break across a page boundary, inline vector chips and
a full-page watermark.

The work programme is organised around six work packages, of which #chevron("WP5", "#0f766e")
carries the demonstration effort and #chevron("WP6", "#b45309") the exploitation
activities.#footnote[This footnote is anchored on page 1 and must render at the foot of
page 1. It is set at 8 pt with a short separator rule above it.] The deliverable
#chip("D6.1", "#1d4ed8") is due at month 18, and milestone #chip("MS1", "#7c2d12") gates
the transition between the two.

#lorem(150)

== Objectives and expected outcomes

#lorem(230)

#figure(
  image("/spike-image.jpg", width: 11cm),
  caption: [An image fetched over the network in JavaScript and embedded into the
  document at compile time.],
)

#lorem(180)

== Methodology

#lorem(260)

The consortium will apply the methodology across all pilots, coordinated through
#chevron("WP5", "#0f766e") and reported in #chip("D6.1", "#1d4ed8").#footnote[This second
footnote is anchored roughly on page 3 and must render at the foot of page 3, not
collected as an endnote and not pushed onto the previous or following page.]

#lorem(240)

#he-table(
  [Table 3.1.d.],
  [Short table, well within a single page, used to check the border, padding and
  caption specification.],
  (2.6cm, 7.4cm, 4cm, 4cm),
  ([Ref], [Deliverable name], [Lead], [Due]),
  (
    (chip("D6.1", "#1d4ed8"), [Stakeholder engagement plan], [Sitra], [M18]),
    (chip("D6.2", "#1d4ed8"), [Pilot evaluation framework], [Partner 3], [M24]),
    (chip("D6.3", "#1d4ed8"), [Final exploitation roadmap], [Partner 7], [M36]),
    (chevron("MS1", "#7c2d12"), [First pilot wave complete], [Sitra], [M20]),
  ),
)

#v(0.6em)

#lorem(120)

== Long table crossing a page boundary

#he-table(
  [Table 3.1.e.],
  [Deliberately long table used to observe what Typst does at a page boundary: whether
  the header repeats, whether a row is split mid-cell, and whether the borders survive
  on both pages.],
  (2.2cm, 8.3cm, 3.5cm, 4cm),
  ([Ref], [Task description], [Participant], [Period]),
  range(1, 41).map(i => (
    chip("T5." + str(i), "#0f766e"),
    [Task #i — #lorem(calc.rem(i, 5) * 6 + 8)],
    [Partner #(calc.rem(i, 9) + 1)],
    [M#(i) – M#(i + 6)],
  )),
)

#lorem(200)

#context [#metadata(counter(page).final().first()) <pagecount>]
`;
}

export async function compileSpikePdf(
  opts: { watermark: boolean },
  onStage?: (s: string) => void,
): Promise<{ pdf: Uint8Array; timings: CompileTimings }> {
  const t0 = performance.now();
  const compiler = await getCompiler(onStage);
  const initMs = performance.now() - t0;

  onStage?.('Fetching image…');
  const img = new Uint8Array((await fetch(IMAGE_URL).then((r) => r.arrayBuffer())) as ArrayBuffer);
  compiler.mapShadow('/spike-image.jpg', img);
  compiler.addSource('/main.typ', buildTypstSource(opts));

  onStage?.('Compiling…');
  const t1 = performance.now();
  const out = await compiler.runWithWorld({ mainFilePath: '/main.typ' }, async (world) => {
    const res = await world.pdf({ diagnostics: 'unix' });
    let pages = 0;
    try {
      const q = (await world.query<number[]>({ selector: '<pagecount>', field: 'value' })) ?? [];
      pages = Array.isArray(q) ? Number(q[0]) || 0 : 0;
    } catch {
      pages = 0;
    }
    return { pdf: res.result as Uint8Array | undefined, diags: res.diagnostics, pages };
  });
  const compileMs = performance.now() - t1;

  if (!out.pdf) {
    const diags = (out.diags ?? []) as unknown as string[];
    throw new Error(diags.join('\n') || 'Typst compilation failed with no diagnostics.');
  }

  return {
    pdf: out.pdf,
    timings: {
      initMs: Math.round(initMs),
      compileMs: Math.round(compileMs),
      totalMs: Math.round(performance.now() - t0),
      pageCount: out.pages || countPdfPages(out.pdf),
      pdfBytes: out.pdf.byteLength,
      wasmBytes: wasmDownloadedBytes,
    },
  };
}

