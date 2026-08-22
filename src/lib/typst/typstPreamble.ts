/**
 * The fixed Typst preamble every converted document starts with.
 *
 * Page setup is the Horizon Europe Part B geometry: A4, 15mm margins,
 * Times-metric serif at 11pt, single line spacing, justified body text.
 * The serif is Nimbus Roman (the URW Times metric clone) because a WASM
 * compiler has no access to system fonts — see `typstCompiler.ts`.
 *
 * The helper functions below are the chip vocabulary. Every cross-reference
 * chip is reduced to `(label, colour, weight)` by `typstChips.ts` and drawn
 * here as a real vector shape, with no trace of the stored HTML span nesting.
 */

/** Family name reported by the bundled Nimbus Roman OTFs. */
export const TYPST_SERIF = 'Nimbus Roman';

/** Tables are capped at the Part B maximum printable width. */
export const TABLE_MAX_WIDTH_CM = 18;

export const TYPST_PREAMBLE = `#set page(paper: "a4", margin: 15mm)
#set text(font: "${TYPST_SERIF}", size: 11pt, lang: "en")
#set par(justify: true, leading: 0.65em, spacing: 0.65em)
#set table(stroke: 0.5pt + rgb("#666666"), inset: 4pt)

// Literal text: strings render verbatim, so no Typst markup can be injected
// by document content.
#let t(s) = s

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
