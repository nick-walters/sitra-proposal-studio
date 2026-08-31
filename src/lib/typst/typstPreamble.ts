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
// Archivo Black is the bundled, metrically close fallback for Arial Black.
// Unlike the former mislabeled asset, Typst can identify and embed this face.
export const TYPST_DISPLAY = 'Archivo Black';


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

/** Reference footnotes: 8pt type at exactly 0.9 line spacing. */
export const FOOTNOTE_SIZE_PT = 8;
export const FOOTNOTE_LEADING_RATIO = 0.9;
/** Typst leading is ADDED to the 1em line box, so 0.9 needs -0.8pt at 8pt. */
export const FOOTNOTE_LEADING_DELTA_PT = Number(
  ((FOOTNOTE_LEADING_RATIO - 1) * FOOTNOTE_SIZE_PT).toFixed(3),
);



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
  /** Draws the pale "CONFIDENTIAL DRAFT" wash across every page. */
  watermark?: boolean;

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
 * A SINGLE-SECTION document has the same label on every page, so the default
 * below is all it needs. The FULL Part B document is one compile of six
 * sections, so each section drops a `<part-marker>` metadata tag at its start
 * and the footer resolves the label from the last marker at or before the
 * current page (`part-label-for`). A `state` update would not do: header and
 * footer contexts resolve at the START of the page, before the update on that
 * page has been seen, so the first page of every section would carry the
 * previous section's label.
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
  if (part) terms.push('t(part-label-for(here()))', 't(" | ")');

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
 * The running header: the topic identifier, centred, on every page. Page one
 * is skipped ONLY when the full-bleed banner is there (B1.1) — a header above
 * it would print inside the black area. Every other section shows it on page
 * one too.
 */
function headerSource(meta: TypstDocMeta): string {
  const text = (meta.runningHeader || '').trim();
  if (!text) return 'none';
  return `context {
  if ${meta.banner ? 'counter(page).at(here()).first() > 1' : 'true'} {
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
  // No hyphenation anywhere. Typst's default is hyphenate: auto, which turns
  // itself ON whenever a paragraph is justified — so justified body text and
  // narrow table columns were splitting words. A root-level false covers
  // every nested context (tables, captions, footnotes, front matter), since
  // nested "set text" calls only override the fields they name.
  hyphenate: false,
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
#let chip-height = 11pt
#let chip-label-shift = 1.6pt

/// Chip text is shifted down inside a fixed 11pt box. Measured on the compiled
/// PDF at 1200 ppi (Nimbus Roman, 11pt body): a 10pt bold label leaves 2.52pt
/// of pill above and 2.52pt below its ink — optically centred — and its
/// baseline sits 0.36pt under the body baseline. The box height still equals
/// the 11pt line pitch, so leading is unchanged (measured pitch 10.98pt with
/// and without a chip on the line).
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
/// fixed box height equals the body line pitch, so it cannot inflate leading.
/// The width is MEASURED rather than left to the layout: inside a narrow table
/// column an auto-width box lets its label wrap, which broke participant
/// badges in the deliverables table. A fixed width keeps every chip on one line.
#let chip-pill(label, colour, filled: false) = context {
  let body = chip-label(label, if filled { white } else { colour })
  box(
    baseline: 2.4pt,
    width: measure(body).width + 2 * chip-pad,
    height: chip-height,
    inset: (x: chip-pad, y: 0pt),
    radius: 999pt,
    fill: if filled { colour } else { white },
    stroke: 1pt + colour,
    align(horizon, move(dy: chip-label-shift, body)),
  )
}

/// Five-point star drawn as geometry rather than text. Nimbus Roman does not
/// contain U+2605, so a literal star is silently dropped by the PDF compiler.
/// Keeping this as a vector also matches the Lucide filled-star icon used by
/// the editor and avoids loading another font solely for one glyph.
#let chip-star(colour, size: 7pt) = box(
  baseline: 1.5pt,
  width: size,
  height: size,
  polygon(
    fill: colour,
    stroke: none,
    (50%, 0%), (61.2%, 34.5%), (97.6%, 34.5%), (68.2%, 55.9%),
    (79.4%, 90.5%), (50%, 69.1%), (20.6%, 90.5%), (31.8%, 55.9%),
    (2.4%, 34.5%), (38.8%, 34.5%),
  ),
)

/// Filled WP pill with the primary-WP star inside the leading edge. The star
/// is a vector while the WP label remains real, selectable text.
#let chip-pill-primary(label, colour) = context {
  let body = chip-label(label, white)
  let m = measure(body)
  let star-size = 7pt
  let star-gap = 1.5pt
  let w = m.width + 2 * chip-pad + star-size + star-gap
  box(
    baseline: 2.4pt,
    width: w,
    height: chip-height,
    radius: 999pt,
    fill: colour,
    stroke: 1pt + colour,
    {
      place(horizon + left, dx: chip-pad, dy: 1.9pt, chip-star(white, size: star-size))
      place(horizon + left, dx: chip-pad + star-size + star-gap, dy: chip-label-shift, body)
    },
  )
}

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
  let h = chip-height
  let w = m.width + 2 * chip-pad + nose + lead
  let pts = if kind == "chevron" {
    (
      (nose, 0pt), (w - nose, 0pt), (w, h / 2),
      (w - nose, h), (nose, h), (0pt, h / 2),
    )
  } else {
    ((0pt, 0pt), (w - nose, 0pt), (w, h / 2), (w - nose, h), (0pt, h))
  }
  box(baseline: 2.4pt, width: w, height: chip-height, {
    place(top + left, polygon(
      fill: if filled { colour } else { white },
      stroke: 1pt + colour,
      ..pts,
    ))
    place(horizon + left, dx: chip-pad + lead, dy: chip-label-shift, body)
  })
}

#let chip-deliverable(label, colour) = chip-poly(label, colour, kind: "pentagon")
#let chip-milestone(label) = chip-poly(label, black, kind: "chevron", filled: true)

/// A run of chips that is allowed to WRAP onto several lines (the participant
/// list's role badges are the case in point).
///
/// Every chip is an 11pt-tall box sitting on an 11pt line pitch, and the
/// document fixes the line box to the text edges (0.75em / -0.25em, zero
/// leading), so a chip is exactly as tall as the line it sits on and the line
/// box never grows to contain it. On a single line that is precisely what we
/// want — chips do not inflate the leading. As soon as the run wraps, though,
/// the second line's chips start where the first line's chips end, and the
/// 1pt strokes print on top of one another.
///
/// Inside a chip run we therefore widen the pitch by 3pt, which is the gap
/// the editor leaves between wrapped rows of badges, and stop justification
/// from stretching the spaces between them. The cell grows by itself: table
/// row height follows the paragraph's own height.
#let chip-run(body) = {
  set par(justify: false, leading: 3pt)
  body
}

/// Acronym: coloured segments, heavy weight, no shape. Serif only — the
/// document has no sans face loaded, so naming one only triggers a fallback
/// with different metrics.
///
/// It is NOT wrapped in a box. The pill and polygon chips need one (they
/// carry a shape and a fixed height), but a box around bare text is laid out
/// against the document's top-edge: cap-height / bottom-edge: descender
/// settings, so its own bottom edge — not the glyph baseline — lands on the
/// line, lifting the label about 1.56pt. Measured at 1200 ppi: boxed, the ink
/// sat 2.52pt above the body cap-height and stopped 1.44pt short of the
/// baseline; unboxed it sits within 0.12pt of the body ink top and bottom, so
/// the acronym shares the body baseline exactly, in body text, table cells,
/// footnotes and the running footer alike.
#let chip-acronym(segments) = segments.map(seg =>
  text(font: "${TYPST_SERIF}", weight: "bold", fill: rgb(seg.at(1)), seg.at(0))
).join()



// ── tables and figures ─────────────────────────────────────────────────────
#let he-table-width = ${TABLE_MAX_WIDTH_CM}cm

/// The long case-name pill: it spans the full text column, white filled with
/// a black outline and black bold label, exactly as the case draft editor and
/// the B1.2 cases table draw it.
#let case-name-pill(label) = block(
  width: he-table-width,
  inset: (x: 6pt, y: 1.5pt),
  radius: 999pt,
  fill: white,
  stroke: 1.5pt + black,
  text(weight: "bold", fill: black, label),
)

/// The work-package name pill: the same full-width shape as the case pill,
/// filled with the work package's own colour and labelled in white.
#let wp-name-pill(label, colour) = block(
  width: he-table-width,
  inset: (x: 6pt, y: 1.5pt),
  radius: 999pt,
  fill: colour,
  stroke: 1.5pt + colour,
  text(weight: "bold", fill: white, label),
)


#let he-inset = (x: 5pt, y: 2.5pt)

/// Caption above a table: bold-italic label, italic description.
/// \`sticky: true\` binds it to the block that FOLLOWS it, so a caption can
/// never be orphaned at the foot of a page: it moves to the next page with
/// its table. The table itself stays breakable, so a long table still splits
/// across pages — the caption simply travels with its first page.
#let he-caption(label, caption) = block(
  width: he-table-width,
  above: 6pt,
  below: 1pt,
  sticky: true,
  text(size: 11pt, fill: black, strong(emph(t(label))) + t(" ") + emph(caption)),
)

/// Caption below a figure, same typography. Nothing is sticky here: the
/// binding is on the FIGURE above it (see \`he-image\`), which is what has to
/// drag the caption along.
#let he-figure-caption(label, caption) = block(
  width: he-table-width,
  above: 3pt,
  below: 6pt,
  text(size: 11pt, fill: black, strong(emph(t(label))) + t(" ") + emph(caption)),
)

/// The Horizon Europe table: no vertical rules, a 1.5pt black rule under the
/// header, hairline row separators, no rule under the final row.
/// The first-flush option drops the left padding of the FIRST column so its
/// text lines up with the body margin (the linked-activities table, which
/// otherwise reads as indented against the surrounding paragraphs).
/// \`tight\` switches to the shared authored-table cell padding (3pt / 0.75pt),
/// which is what the board's own tables use — 3.1.a is emitted tight so the
/// editor and the preview allocate the same width to each column.
#let he-table(cols, header, rows, aligns: none, first-flush: false, tight: false) = {
  // Table content is LEFT ALIGNED: the document sets justify globally,
  // which stretches short cell lines. Tables opt out locally.
  set text(hyphenate: false)
  set par(justify: false)
  block(
  width: he-table-width,
  above: 0pt,
  below: 6pt,
  table(
    columns: cols,
    // Minimal padding everywhere (0.75pt / 3pt), with the leftmost column's
    // left inset and the rightmost column's right inset dropped so content
    // sits flush with the text column. \`first-flush\`/\`tight\` are retained
    // for call-site compatibility but no longer change the geometry.
    inset: (x, y) => (
      left: if x == 0 { 0pt } else { 3pt },
      right: if x == cols.len() - 1 { 0pt } else { 3pt },
      top: 0.75pt,
      bottom: 0.75pt,
    ),

    align: if aligns == none { left + horizon } else { (x, y) => aligns.at(x) + horizon },
    stroke: (x, y) => (
      left: none,
      right: none,
      top: none,
      bottom: if y == 0 { 1.5pt + black }
        else if y == rows.len() { none }
        else { 0.5pt + rgb("#e5e7eb") },
    ),
    // A real \`table.header\`: Typst repeats it at the top of every
    // continuation page and never leaves it alone at the foot of a page.
    table.header(..header.map(cell => text(weight: "bold", cell))),
    ..rows.flatten(),
  ),
)
}

/// Same look as \`he-table\`, but takes an ALREADY FLATTENED cell list so a
/// cell can span rows (\`table.cell(rowspan: n, …)\`). \`nrows\` is the grid row
/// count, header included, so the last row keeps no rule under it.
#let he-cell-table(cols, cells, nrows, aligns: none) = {
  // Table content is LEFT ALIGNED: the document sets justify globally,
  // which stretches short cell lines. Tables opt out locally.
  set text(hyphenate: false)
  set par(justify: false)
  block(
  width: he-table-width,
  above: 0pt,
  below: 6pt,
  table(
    columns: cols,
    inset: (x, y) => (
      left: if x == 0 { 0pt } else { 3pt },
      right: if x == cols.len() - 1 { 0pt } else { 3pt },
      top: 0.75pt,
      bottom: 0.75pt,
    ),
    align: if aligns == none { left + horizon } else { (x, y) => aligns.at(x) + horizon },
    stroke: (x, y) => (
      left: none,
      right: none,
      top: none,
      bottom: if y == 0 { 1.5pt + black }
        else if y == nrows - 1 { none }
        else { 0.5pt + rgb("#e5e7eb") },
    ),
    // The first grid row is the header row: repeated on continuation pages
    // and never orphaned at the foot of a page.
    table.header(..cells.slice(0, cols.len())),
    ..cells.slice(cols.len()),
  ),
)
}

/// Authored TipTap tables use the same Horizon Europe rules without changing
/// the specialised B3.1 table geometry: 3pt horizontal / 0.75pt vertical
/// padding, no vertical rules, a 1.5px-equivalent header rule, 1px-equivalent
/// body separators and no rule below the final row.
#let he-authored-table(cols, cells, nrows) = {
  // Table content is LEFT ALIGNED: the document sets justify globally,
  // which stretches short cell lines. Tables opt out locally.
  set text(hyphenate: false)
  set par(justify: false)
  block(
  width: he-table-width,
  above: 3pt,
  below: 3pt,
  table(
    columns: cols,
    inset: (x, y) => (
      left: if x == 0 { 0pt } else { 3pt },
      right: if x == cols.len() - 1 { 0pt } else { 3pt },
      top: 0.75pt,
      bottom: 0.75pt,
    ),
    align: left + horizon,
    stroke: (x, y) => (
      left: none,
      right: none,
      top: none,
      bottom: if y == 0 { 1.125pt + black }
        else if y == nrows - 1 { none }
        else { 0.75pt + rgb("#e5e7eb") },
    ),
    ..cells,
  ),
)
}

/// A rule-free grid whose cells carry their own fills — the staff-effort
/// matrix, which on screen is a block of coloured cells separated by a 5pt
/// gutter, not a ruled table. Cell padding lives INSIDE the coloured block so
/// the fill hugs the figure exactly as the board draws it.
#let he-grid(cols, cells) = {
  // Table content is LEFT ALIGNED: the document sets justify globally,
  // which stretches short cell lines. Tables opt out locally.
  set text(hyphenate: false)
  set par(justify: false)
  // Unbreakable: the effort matrix is a compact band of coloured cells with
  // rounded top and bottom edges — splitting it across pages would cut the
  // band open. Typst pushes the whole grid to the next page instead, and the
  // sticky caption above it travels with it.
  block(
  width: he-table-width,
  above: 0pt,
  below: 6pt,
  breakable: false,
  table(
    columns: cols,
    inset: 0pt,
    column-gutter: 5pt,
    stroke: none,
    align: left + horizon,
    ..cells,
  ),
)
}

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
/// Sticky and unbreakable: the image is one unit and keeps the caption that
/// follows it on the same page.
#let he-image(path, ratio) = block(
  width: he-table-width,
  above: 6pt,
  below: 0pt,
  breakable: false,
  sticky: true,
  image(path, width: 100%),
)

/// Authored figure (an upload, an AI image or a rasterised canvas), scaled to
/// a percentage of the text column and centred in it.
/// Unbreakable and sticky, so the image is never split and never separated
/// from the caption that follows it. \`tight\` collapses the space above when
/// the block is grouped with the paragraph above it.
#let he-figure-image(path, pct, tight: false) = block(
  width: he-table-width,
  above: if tight { 0pt } else { 6pt },
  below: 0pt,
  breakable: false,
  sticky: true,
  align(center, image(path, width: pct * 1%)),
)

/// A figure pinned to the top of the page it lands on (page-break mode
/// "float_top"). The caption travels inside the same float.
#let he-figure-float(body) = place(top, float: true, clearance: 8pt, body)


// ── headings ───────────────────────────────────────────────────────────────
/// Part heading ("1. Excellence") and section heading ("1.2. Methodology").
/// Arial Black at 13pt / 12pt with 9-6 and 6-6 point spacing, matching the
/// browser-print export. The face is already black, so no synthetic bold is
/// requested on top of it.
#let he-h1(body) = block(above: 9pt, below: 6pt, text(
  font: "${TYPST_DISPLAY}", size: 13pt, weight: "regular", body,
))
#let he-h2(body) = block(above: 6pt, below: 6pt, text(
  font: "${TYPST_DISPLAY}", size: 12pt, weight: "regular", body,
))
#let he-h1-plain(s) = he-h1(t(s))
#let he-h2-plain(s) = he-h2(t(s))

// ── page-one banner ────────────────────────────────────────────────────────
/// Full-bleed black banner flush to the top edge of page one — no page margin
/// above or beside it, its own 15mm / 12pt padding inside. Composed exactly as
/// \`ProposalBanner.tsx\` and the browser-print export compose it: the Sitra
/// logo with "and partners" beneath it in the top-right corner, then the topic
/// line (8pt serif), the acronym (18pt) and the title (13pt) in Arial Black.
/// Only the FIRST section of the document emits this.
#let doc-banner(topic, acronym, title, logo) = context {
  let mark = if logo != "" {
    // "and partners" is set to the SAME WIDTH as the logo above it: the label
    // is measured at a base size and scaled by the ratio of the two widths.
    let img = image(logo, height: 0.8cm, fit: "contain")
    let lw = measure(img).width
    let base = text(font: "${TYPST_DISPLAY}", size: 10pt, weight: "regular", t("and partners"))
    let tw = measure(base).width
    let size = if tw > 0pt { 10pt * (lw / tw) } else { 10pt }
    block(width: lw, {
      set align(center)
      img
      v(2pt, weak: false)
      text(font: "${TYPST_DISPLAY}", size: size, weight: "regular", fill: white, t("and partners"))
    })
  } else { none }
  let lines = {
    set text(fill: white)
    set par(justify: false, leading: 2pt)
    if topic.len() > 0 {
      block(below: 6pt, text(font: "${TYPST_SERIF}", size: 8pt, t-lines(topic)))
    }
    if acronym.len() > 0 {
      block(below: 2pt, text(font: "${TYPST_DISPLAY}", size: 18pt, weight: "regular", t-lines(acronym)))
    }
    if title.len() > 0 {
      block(below: 0pt, text(font: "${TYPST_DISPLAY}", size: 13pt, weight: "regular", t-lines(title)))
    }
  }
  let body = block(
    width: 210mm,
    fill: black,
    inset: (x: 15mm, top: 15mm, bottom: 12pt),
    if mark == none { lines } else {
      grid(columns: (1fr, auto), column-gutter: 0.5cm, align: (left + bottom, right + top), lines, mark)
    },
  )
  let h = measure(body).height
  place(top + left, dx: -15mm, dy: -15mm, body)
  v(h - 15mm + 12pt, weak: false)
}


/// Citations render as per-page footnotes. The number is the proposal-wide
/// display number, forced onto Typst's own marker via \`numbering\`, so the
/// marker, the entry and the on-screen superscript all agree. A later citation
/// of the same reference reuses the number with no second entry.
#let he-cite-note(num, body) = footnote(numbering: _ => num, body)

/// Same, but guaranteed to fit on ONE line: the entry is measured against the
/// footnote's usable width and, while it overflows, whole words are removed
/// from the END OF THE TITLE (an ellipsis is appended). Everything after the
/// title — journal, year, DOI — is never touched.
#let he-cite-fit-width = 210mm - 30mm
#let he-cite-note-fit(num, body, pre, title, post) = footnote(numbering: _ => num, context {
  let avail = he-cite-fit-width - measure(text(size: 8pt, num)).width - 8pt
  if measure(text(size: 8pt, box(body))).width <= avail {
    body
  } else {
    let words = title.split(" ")
    let n = words.len()
    let out = none
    while n > 0 and out == none {
      let cut = words.slice(0, n).join(" ")
      let cand = pre + cut + (if n < words.len() { "…" } else { "" }) + post
      if measure(text(size: 8pt, cand)).width <= avail { out = cand }
      n -= 1
    }
    text(size: 8pt, if out == none { pre + "…" + post } else { out })
  }
})
#let he-cite-again(num) = super(text(size: 7pt, num))

// Footnotes run at exactly ${FOOTNOTE_LEADING_RATIO} line spacing: at
// ${FOOTNOTE_SIZE_PT}pt with top-edge ${TYPST_TOP_EDGE} / bottom-edge ${TYPST_BOTTOM_EDGE} a line box is
// 1em tall, so the pitch is set by adding ${FOOTNOTE_LEADING_DELTA_PT}pt of leading INSIDE an
// entry and the same negative gap BETWEEN entries (each entry is its own
// block, so \`leading\` never applies across them — measured entry-to-entry
// pitch was 12.0pt, i.e. 1.50, before this).
// No separator: Typst's default rule above the footnote block is removed.
#set footnote.entry(indent: 0pt, gap: ${FOOTNOTE_LEADING_DELTA_PT}pt, clearance: 6pt, separator: none)
#show footnote.entry: it => {
  set text(size: ${FOOTNOTE_SIZE_PT}pt, top-edge: ${TYPST_TOP_EDGE}, bottom-edge: ${TYPST_BOTTOM_EDGE})
  set par(justify: false, leading: ${FOOTNOTE_LEADING_DELTA_PT}pt, spacing: 0pt)
  it
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

/// Footer section label. Sections of the full Part B document each emit
/// \`#metadata("Part B1.2. …") <part-marker>\` at their start; the label for a
/// page is the last marker on that page or before it. With no markers (a
/// single-section compile) the default below is used on every page.
#let part-label-default = ${typstString(meta.partLabel || 'Part B')}
#let part-label-for(loc) = {
  let markers = query(<part-marker>)
  if markers.len() == 0 { return part-label-default }
  let page-no = loc.page()
  let label = markers.first().value
  for m in markers {
    if m.location().page() <= page-no { label = m.value }
  }
  label
}

/// Diagonal "CONFIDENTIAL DRAFT" wash. A visual deterrent only: it is pale
/// enough that the text under it stays easy to read.
#let draft-watermark = rotate(-30deg, text(
  font: "${TYPST_DISPLAY}",
  size: 58pt,
  fill: rgb("#c81e3220"),
  t("CONFIDENTIAL DRAFT"),
))

// Page setup comes LAST: the header/footer closures below reference \`t\` and
// \`chip-acronym\`, which must already be in scope.
#set page(
  paper: "a4",
  margin: (x: 15mm, top: 15mm, bottom: 15mm),
  header: ${headerSource(meta)},
  footer: ${footerSource(meta)},${meta.watermark ? '\n  background: align(center + horizon, draft-watermark),' : ''}
)

`;
}

/**
 * Banner call for page one; empty string when there is nothing to show.
 * `logoPath` is the compiler shadow path of the Sitra mark (see
 * `frontMatter.ts`); pass an empty string to draw the banner without it.
 */
export function bannerCall(meta: TypstDocMeta, logoPath = ''): string {
  const b = meta.banner;
  if (!b) return '';
  const topic = (b.topicLine || '').trim();
  const acronym = (b.acronym || '').trim();
  const title = (b.title || '').trim();
  if (!topic && !acronym && !title) return '';
  return `doc-banner(${lineArray(topic)}, ${lineArray(acronym)}, ${lineArray(title)}, ${typstString(logoPath)})`;
}


/** Backwards-compatible default preamble (no banner, generic footer). */
export const TYPST_PREAMBLE = buildTypstPreamble();
