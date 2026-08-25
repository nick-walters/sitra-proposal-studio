/**
 * The fixed Typst preamble every converted document starts with.
 *
 * Page setup is the Horizon Europe Part B geometry: A4, 15mm margins,
 * Times-metric serif at 11pt, single line spacing (CSS `line-height: 1.0`
 * equivalent), justified body text, 3pt paragraph spacing. The serif is
 * Nimbus Roman (the URW Times metric clone) because a WASM compiler has no
 * access to system fonts — see `typstCompiler.ts`.
 *
 * ORDER MATTERS: every `#let` helper is defined BEFORE `#set page(...)`,
 * because the running footer is a closure that calls `chip-acronym` and `t`.
 * A `set page` rule placed before those definitions would capture an empty
 * scope and fail with "unknown variable".
 *
 * The helper functions below are the chip vocabulary and the shared table /
 * figure / banner furniture. Every cross-reference chip is reduced to
 * `(label, colour, weight)` by `typstChips.ts` and drawn here as a real
 * vector shape wrapped around REAL TEXT, so the label survives a copy out of
 * the PDF.
 */

import { typstString } from './htmlToTypst';

/** Family name reported by the bundled Nimbus Roman OTFs. */
export const TYPST_SERIF = 'Nimbus Roman';

/**
 * Display face for the banner, the H1/H2 headings and figure text — the same
 * family the platform names in `index.css`. The TTF is bundled and registered
 * with the compiler in `typstCompiler.ts`; without that registration Typst
 * silently falls back to the only loaded family (the serif), which is what
 * made every heading look like Times.
 */
export const TYPST_DISPLAY = 'Arial Black';


/** Tables are capped at the Part B maximum printable width. */
export const TABLE_MAX_WIDTH_CM = 18;

/**
 * Single line spacing.
 *
 * Typst's baseline-to-baseline distance is `top-edge - bottom-edge + leading`.
 * Setting the edges to 0.75em / -0.25em and the leading to zero gives a pitch
 * of exactly 1em (11pt at 11pt type) — the same metric as the browser-print
 * path's `line-height: 1.0`.
 *
 * That pitch only holds if nothing on the line is TALLER than 1em. Inline
 * boxes contribute their own height to the line, which is why every chip is
 * drawn with `outset` (paint-only, no layout) over a box whose measured height
 * is the label's cap-height-to-descender extent — comfortably under 11pt. A
 * line with chips therefore has exactly the same leading as one without.
 */
export const TYPST_TOP_EDGE = '0.75em';
export const TYPST_BOTTOM_EDGE = '-0.25em';
export const TYPST_LEADING = '0pt';
/** 3pt before and after; adjacent paragraph margins collapse, as in CSS. */
export const TYPST_PAR_SPACING = '3pt';

export interface TypstAcronymSegment {
  text: string;
  color: string;
}

export interface TypstDocMeta {
  /** Proposal acronym, plain text (footer fallback when no segments). */
  acronym?: string;
  /** Coloured acronym segments, so the footer carries the acronym CHIP. */
  acronymSegments?: TypstAcronymSegment[];
  /** Footer middle segment, e.g. "Part B3.1. Work plan & resources". */
  partLabel?: string;
  /** Page-one banner: topic line, acronym and full title. */
  banner?: { topicLine?: string; acronym?: string; title?: string } | null;
  /**
   * Running header text — the topic identifier, e.g.
   * "HORIZON-CL4-2026-01-TWIN-TRANSITION-15: …". Printed centred at the top of
   * every page EXCEPT page one, which carries the banner instead. Same text as
   * the browser-print export's `@top-center`.
   */
  runningHeader?: string;
  /** Section heading pair, numbered from the template (see `fetchTypstDocMeta`). */
  headings?: { h1?: string; h2?: string } | null;
}


/** Splits on newlines so a stored manual break survives into the banner. */
function lineArray(value: string): string {
  const lines = value.split(/\r?\n/).filter((l, i, a) => l.trim() !== '' || (i > 0 && i < a.length - 1));
  return `(${lines.map((l) => typstString(l)).join(', ')}${lines.length === 1 ? ',' : ''})`;
}

function hex(value: string | undefined): string {
  const raw = (value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : '#000000';
}

function segmentsSource(meta: TypstDocMeta): string {
  const segments = (meta.acronymSegments || []).filter((s) => (s.text || '').length > 0);
  if (!segments.length) return '()';
  const src = segments.map((s) => `(${typstString(s.text)}, ${typstString(hex(s.color))})`).join(', ');
  return `(${src}${segments.length === 1 ? ',' : ''})`;
}

/**
 * The running footer: acronym CHIP | section label | Page X of Y.
 *
 * The document is compiled one section at a time, so the section label is the
 * same on every page and needs no per-page lookup.
 */
function footerSource(meta: TypstDocMeta): string {
  const acronym = (meta.acronym || '').trim();
  const part = (meta.partLabel || 'Part B').trim();
  const segments = segmentsSource(meta);
  // Every segment is one term of a single `+` chain: the whole footer has to
  // stay on ONE line (a newline in a code block ends the expression), and the
  // terms must be joined explicitly or the parser sees two statements.
  const terms: string[] = [];
  if (segments !== '()') terms.push(`chip-acronym(${segments})`, 't(" | ")');
  else if (acronym) terms.push(`t(${typstString(acronym)})`, 't(" | ")');
  if (part) terms.push(`t(${typstString(part)})`, 't(" | ")');
  terms.push(
    't("Page ")',
    'str(counter(page).at(here()).first())',
    't(" of ")',
    'str(counter(page).final().first())',
  );
  return `context {
  set align(center)
  set text(font: "${TYPST_SERIF}", size: 9pt, fill: rgb("#666666"))
  ${terms.join(' + ')}
}`;
}

/**
 * The running header: the topic identifier, centred, on every page except the
 * first — page one carries the full-bleed banner, and a header above it would
 * print inside the black area.
 */
function headerSource(meta: TypstDocMeta): string {
  const text = (meta.runningHeader || '').trim();
  if (!text) return 'none';
  return `context {
  if counter(page).at(here()).first() > 1 {
    set align(center)
    set text(font: "${TYPST_SERIF}", size: 9pt, fill: rgb("#666666"))
    t(${typstString(text)})
  }
}`;
}


/** The whole preamble, parameterised by the document's footer/banner text. */
export function buildTypstPreamble(meta: TypstDocMeta = {}): string {
  return `#set text(
  font: "${TYPST_SERIF}",
  size: 11pt,
  lang: "en",
  top-edge: ${TYPST_TOP_EDGE},
  bottom-edge: ${TYPST_BOTTOM_EDGE},
)
#set par(justify: true, leading: ${TYPST_LEADING}, spacing: ${TYPST_PAR_SPACING})
#set table(stroke: 0.5pt + rgb("#666666"), inset: 4pt)

// Literal text: strings render verbatim, so no Typst markup can be injected
// by document content.
#let t(s) = s

/// A list of strings as hard-broken lines.
#let t-lines(items) = items.map(t).join(linebreak())

// ── chip vocabulary ────────────────────────────────────────────────────────
#let chip-size = 10pt
#let chip-pad = 3.5pt
#let chip-out = 1.6pt

/// Chip text. The explicit edges make the measured height cap-height →
/// descender only, so a chip never grows the line it sits on.
#let chip-label(s, colour) = text(
  font: "${TYPST_SERIF}",
  size: chip-size,
  weight: "bold",
  style: "normal",
  top-edge: "cap-height",
  bottom-edge: "descender",
  fill: colour,
  s,
)

/// Rounded pill. Filled (WP, participant) or outlined (task, case).
/// Horizontal padding is INSET (it must push neighbouring text away); the
/// vertical padding is OUTSET, which paints outside the box without adding
/// anything to the line height.
#let chip-pill(label, colour, filled: false) = box(
  baseline: 0pt,
  inset: (x: chip-pad, y: 0pt),
  outset: (y: chip-out),
  radius: 999pt,
  fill: if filled { colour } else { white },
  stroke: 1pt + colour,
  chip-label(label, if filled { white } else { colour }),
)

/// Shared polygon chip: \`kind\` is "pentagon" (deliverable) or "chevron"
/// (milestone). The box reserves only the label's own height, and the shape is
/// PLACED over it, so — like the pill — it leaves the leading untouched.
/// The label is ordinary text ON TOP of the polygon, never an outline, so it
/// is selectable and copies out of the PDF as "D5.2".
#let chip-poly(label, colour, kind: "pentagon", filled: false) = context {
  let body = chip-label(label, if filled { white } else { colour })
  let m = measure(body)
  let nose = 4pt
  let lead = if kind == "chevron" { nose } else { 0pt }
  let h = m.height + 2 * chip-out
  let w = m.width + 2 * chip-pad + nose + lead
  let pts = if kind == "chevron" {
    (
      (nose, 0pt), (w - nose, 0pt), (w, h / 2),
      (w - nose, h), (nose, h), (0pt, h / 2),
    )
  } else {
    ((0pt, 0pt), (w - nose, 0pt), (w, h / 2), (w - nose, h), (0pt, h))
  }
  box(baseline: 0pt, width: w, height: m.height, {
    place(top + left, dy: -chip-out, polygon(
      fill: if filled { colour } else { white },
      stroke: 1pt + colour,
      ..pts,
    ))
    place(top + left, dx: chip-pad + lead, body)
  })
}

#let chip-deliverable(label, colour) = chip-poly(label, colour, kind: "pentagon")
#let chip-milestone(label) = chip-poly(label, black, kind: "chevron", filled: true)

/// Acronym: coloured segments, heavy weight, no shape. Serif only — the
/// document has no sans face loaded, so naming one only triggers a fallback
/// with different metrics, which is what made the chip ride high.
#let chip-acronym(segments) = box(baseline: 0pt, segments.map(seg =>
  text(font: "${TYPST_SERIF}", weight: "bold", top-edge: "cap-height", bottom-edge: "descender", fill: rgb(seg.at(1)), seg.at(0))
).join())

// ── tables and figures ─────────────────────────────────────────────────────
#let he-table-width = ${TABLE_MAX_WIDTH_CM}cm
#let he-inset = (x: 5pt, y: 2.5pt)

/// Caption above a table: bold-italic label, italic description.
#let he-caption(label, caption) = block(
  width: he-table-width,
  above: 6pt,
  below: 1pt,
  text(size: 11pt, strong(emph(t(label))) + t(" ") + emph(caption)),
)

/// Caption below a figure, same typography.
#let he-figure-caption(label, caption) = block(
  width: he-table-width,
  above: 3pt,
  below: 6pt,
  text(size: 11pt, strong(emph(t(label))) + t(" ") + emph(caption)),
)

/// The Horizon Europe table: no vertical rules, a 1.5pt black rule under the
/// header, hairline row separators, no rule under the final row.
#let he-table(cols, header, rows, aligns: none) = block(
  width: he-table-width,
  above: 0pt,
  below: 6pt,
  table(
    columns: cols,
    inset: he-inset,
    align: if aligns == none { left + horizon } else { (x, y) => aligns.at(x) + horizon },
    stroke: (x, y) => (
      left: none,
      right: none,
      top: none,
      bottom: if y == 0 { 1.5pt + black }
        else if y == rows.len() { none }
        else { 0.5pt + rgb("#e5e7eb") },
    ),
    ..header.map(cell => text(weight: "bold", cell)),
    ..rows.flatten(),
  ),
)

/// Same look as \`he-table\`, but takes an ALREADY FLATTENED cell list so a
/// cell can span rows (\`table.cell(rowspan: n, …)\`). \`nrows\` is the grid row
/// count, header included, so the last row keeps no rule under it.
#let he-cell-table(cols, cells, nrows, aligns: none) = block(
  width: he-table-width,
  above: 0pt,
  below: 6pt,
  table(
    columns: cols,
    inset: he-inset,
    align: if aligns == none { left + horizon } else { (x, y) => aligns.at(x) + horizon },
    stroke: (x, y) => (
      left: none,
      right: none,
      top: none,
      bottom: if y == 0 { 1.5pt + black }
        else if y == nrows - 1 { none }
        else { 0.5pt + rgb("#e5e7eb") },
    ),
    ..cells,
  ),
)

/// A rule-free grid whose cells carry their own fills — the staff-effort
/// matrix, which on screen is a block of coloured cells separated by a 5pt
/// gutter, not a ruled table. Cell padding lives INSIDE the coloured block so
/// the fill hugs the figure exactly as the board draws it.
#let he-grid(cols, cells) = block(
  width: he-table-width,
  above: 0pt,
  below: 6pt,
  table(
    columns: cols,
    inset: 0pt,
    column-gutter: 5pt,
    stroke: none,
    align: left + horizon,
    ..cells,
  ),
)

/// One coloured cell of the staff-effort matrix. \`pos\` rounds the outer
/// corners of the band: "top" for the header row, "bottom" for the totals row.
#let effort-cell(colour, body, pos) = block(
  width: 100%,
  fill: colour,
  radius: if pos == "top" { (top: 9pt) } else if pos == "bottom" { (bottom: 9pt) } else { 0pt },
  inset: (x: 3pt, y: 1.5pt),
  align(center, text(fill: white, body)),
)

/// An unfilled cell of the staff-effort matrix (participant column, totals).
#let effort-plain(body, al) = block(
  width: 100%,
  inset: (x: 3pt, y: 1.5pt),
  align(al, body),
)

/// The WP-coloured hairline the board draws between the sections of a work
/// package description, with the same clear space above and below.
#let wp-sep(colour) = block(
  width: 100%,
  above: 5pt,
  below: 5pt,
  line(length: 100%, stroke: 0.75pt + colour),
)

/// The work-package description table (3.1.b): no ruled grid at all. The
/// separators are ordinary rows carrying \`wp-sep\`, exactly as the board draws
/// them, so badges never crowd a rule.
#let he-wp-table(header, rows, colour) = block(
  width: he-table-width,
  above: 0pt,
  below: 8pt,
  table(
    columns: (1fr,),
    inset: (x: 0pt, y: 1.5pt),
    align: left + top,
    stroke: none,
    header,
    ..rows.flatten(),
  ),
)


/// Full-width raster figure (Gantt / Pert), scaled to the table width.
#let he-image(path, ratio) = block(
  width: he-table-width,
  above: 6pt,
  below: 0pt,
  image(path, width: 100%),
)

// ── page-one banner ────────────────────────────────────────────────────────
/// Full-bleed black banner flush to the top edge of page one. Placed into the
/// page margin, then the flow is advanced by the measured height so the body
/// starts underneath it. Only the FIRST section of the document emits this.
#let doc-banner(topic, acronym, title) = context {
  let body = block(
    width: 210mm,
    fill: black,
    inset: (x: 15mm, top: 15mm, bottom: 12pt),
    {
      set text(fill: white)
      set par(justify: false, leading: 2pt)
      if topic.len() > 0 {
        block(below: 6pt, text(size: 8pt, t-lines(topic)))
      }
      if acronym.len() > 0 {
        block(below: 2pt, text(size: 18pt, weight: "bold", t-lines(acronym)))
      }
      if title.len() > 0 {
        block(below: 0pt, text(size: 13pt, weight: "bold", t-lines(title)))
      }
    },
  )
  let h = measure(body).height
  place(top + left, dx: -15mm, dy: -15mm, body)
  v(h - 15mm + 12pt, weak: false)
}

/// Honest placeholder for anything this converter does not yet render.
#let not-converted(what) = block(
  width: 100%,
  inset: 6pt,
  radius: 2pt,
  stroke: 0.5pt + rgb("#999999"),
  fill: rgb("#f4f4f5"),
  text(size: 9pt, style: "italic", fill: rgb("#52525b"), what),
)

// Page setup comes LAST: the footer closure below references \`t\` and
// \`chip-acronym\`, which must already be in scope.
#set page(
  paper: "a4",
  margin: (x: 15mm, top: 15mm, bottom: 15mm),
  footer: ${footerSource(meta)},
)
`;
}

/** Banner call for page one; empty string when there is nothing to show. */
export function bannerCall(meta: TypstDocMeta): string {
  const b = meta.banner;
  if (!b) return '';
  const topic = (b.topicLine || '').trim();
  const acronym = (b.acronym || '').trim();
  const title = (b.title || '').trim();
  if (!topic && !acronym && !title) return '';
  return `doc-banner(${lineArray(topic)}, ${lineArray(acronym)}, ${lineArray(title)})`;
}

/** Backwards-compatible default preamble (no banner, generic footer). */
export const TYPST_PREAMBLE = buildTypstPreamble();
