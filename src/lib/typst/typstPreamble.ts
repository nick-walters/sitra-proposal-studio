/**
 * The fixed Typst preamble every converted document starts with.
 *
 * Page setup is the Horizon Europe Part B geometry: A4, 15mm margins,
 * Times-metric serif at 11pt, single line spacing (CSS `line-height: 1.0`
 * equivalent), justified body text, 3pt paragraph spacing. The serif is
 * Nimbus Roman (the URW Times metric clone) because a WASM compiler has no
 * access to system fonts — see `typstCompiler.ts`.
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

/** Tables are capped at the Part B maximum printable width. */
export const TABLE_MAX_WIDTH_CM = 18;

/**
 * Single line spacing.
 *
 * Typst's baseline-to-baseline distance is `top-edge - bottom-edge + leading`.
 * Setting the edges to 0.75em / -0.25em and the leading to zero gives a pitch
 * of exactly 1em (11pt at 11pt type) — the same metric as the browser-print
 * path's `line-height: 1.0`. The previous `leading: 0.65em` left the font's
 * own ascender/descender in play and produced a ~1.55 pitch, which is why the
 * body looked loose.
 */
export const TYPST_TOP_EDGE = '0.75em';
export const TYPST_BOTTOM_EDGE = '-0.25em';
export const TYPST_LEADING = '0pt';
/** 3pt before and after; adjacent paragraph margins collapse, as in CSS. */
export const TYPST_PAR_SPACING = '3pt';

export interface TypstDocMeta {
  /** Proposal acronym, plain text for now (the chip version comes later). */
  acronym?: string;
  /** Footer middle segment, e.g. "Part B". */
  partLabel?: string;
  /** Page-one banner: topic line, acronym and full title. */
  banner?: { topicLine?: string; acronym?: string; title?: string } | null;
}

/** Splits on newlines so a stored manual break survives into the banner. */
function lineArray(value: string): string {
  const lines = value.split(/\r?\n/).filter((l, i, a) => l.trim() !== '' || (i > 0 && i < a.length - 1));
  return `(${lines.map((l) => typstString(l)).join(', ')}${lines.length === 1 ? ',' : ''})`;
}

function footerSource(meta: TypstDocMeta): string {
  const acronym = (meta.acronym || '').trim();
  const part = (meta.partLabel || 'Part B').trim();
  const prefix = [acronym, part].filter(Boolean).join(' | ');
  // Plain string concatenation, NOT the `t()` helper: the footer closure is
  // built by `#set page(...)` before the helpers are defined, so anything it
  // references must already be in scope.
  // One line: in a Typst code block a newline ends the expression, so the
  // concatenation has to stay on a single line.
  return `context {
  set align(center)
  set text(font: "${TYPST_SERIF}", size: 9pt, fill: rgb("#666666"))
  ${typstString(prefix ? `${prefix} | Page ` : 'Page ')} + str(counter(page).at(here()).first()) + " of " + str(counter(page).final().first())
}`;
}

/** The whole preamble, parameterised by the document's footer/banner text. */
export function buildTypstPreamble(meta: TypstDocMeta = {}): string {
  return `#set page(
  paper: "a4",
  margin: (x: 15mm, top: 15mm, bottom: 15mm),
  footer: ${footerSource(meta)},
)
#set text(
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

#let chip-label(s, colour) = text(
  font: "${TYPST_SERIF}",
  size: chip-size,
  weight: "bold",
  style: "normal",
  fill: colour,
  s,
)

/// Rounded pill. Filled (WP, participant) or outlined (task, case).
#let chip-pill(label, colour, filled: false) = box(
  baseline: 0.15em,
  inset: (x: chip-pad, y: 1.2pt),
  outset: (y: 0pt),
  radius: 999pt,
  fill: if filled { colour } else { white },
  stroke: 1pt + colour,
  chip-label(label, if filled { white } else { colour }),
)

/// Shared polygon chip: \`kind\` is "pentagon" (deliverable) or "chevron"
/// (milestone). Width is measured from the label so the shape always fits.
/// The label is placed as ordinary text ON TOP of the polygon — never as an
/// outline — so it is selectable and copies out of the PDF as "D5.2".
#let chip-poly(label, colour, kind: "pentagon", filled: false) = context {
  let body = chip-label(label, if filled { white } else { colour })
  let m = measure(body)
  let h = m.height + 3pt
  let nose = 5pt
  let w = m.width + 2 * chip-pad + nose
  let pts = if kind == "chevron" {
    (
      (nose, 0pt), (w - nose, 0pt), (w, h / 2),
      (w - nose, h), (nose, h), (0pt, h / 2),
    )
  } else {
    ((0pt, 0pt), (w - nose, 0pt), (w, h / 2), (w - nose, h), (0pt, h))
  }
  box(baseline: 0.15em, width: w, height: h, {
    place(polygon(
      fill: if filled { colour } else { white },
      stroke: 1pt + colour,
      ..pts,
    ))
    place(center + horizon, dx: -nose / 2, body)
  })
}

#let chip-deliverable(label, colour) = chip-poly(label, colour, kind: "pentagon")
#let chip-milestone(label) = chip-poly(label, black, kind: "chevron", filled: true)

/// Acronym: coloured segments, heavy weight, no shape.
#let chip-acronym(segments) = box(baseline: 0pt, segments.map(seg =>
  text(font: ("Nimbus Sans", "${TYPST_SERIF}"), weight: "black", fill: rgb(seg.at(1)), seg.at(0))
).join())

// ── tables and figures ─────────────────────────────────────────────────────
#let he-table-width = ${TABLE_MAX_WIDTH_CM}cm

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
    inset: (x: 3pt, y: 1.5pt),
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
/// starts underneath it.
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
