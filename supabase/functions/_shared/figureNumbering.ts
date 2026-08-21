/**
 * Derived figure numbering — the single authority.
 *
 * A figure has no stored number. Its number is computed from the BLOCK that
 * places it: the block's section gives "1.2", the block's position among the
 * figure-bearing blocks of that section gives the letter. Reordering blocks
 * therefore renumbers figures with no database writes at all.
 *
 * A figure placed in no block is unplaced: it has no position and so no
 * number. It is simply absent from the map, and every chip resolver treats a
 * missing entry as "keep the stored label".
 *
 * This module lives under `supabase/functions/_shared` so the browser and the
 * backup edge function share one implementation (same pattern as
 * `referenceLabels.ts`).
 */

export interface FigureNumberingCard {
  id: string;
  section_id: string | null;
  order_index: number | null;
}

export interface FigureNumberingSection {
  id: string;
  /** "B1.2" or "1.2" — the leading part letter is stripped. */
  section_number: string | null;
  order_index?: number | null;
}

export interface FigureNumberingPlacement {
  card_id: string;
  figure_id: string | null;
}

function cleanSectionNumber(raw: string | null | undefined): string {
  return (raw ?? "").replace(/^[A-Za-z]+/, "").trim();
}

/** a, b, … z, then aa, ab … so a long section never runs out of letters. */
export function figureLetter(index: number): string {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(97 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/**
 * Returns figureId -> "1.2.a" for every PLACED figure. Unplaced figures, and
 * figures placed on a block whose section is unknown, are omitted.
 */
export function computeFigureNumbers(
  placements: ReadonlyArray<FigureNumberingPlacement>,
  cards: ReadonlyArray<FigureNumberingCard>,
  sections: ReadonlyArray<FigureNumberingSection>,
): Map<string, string> {
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const cardById = new Map(cards.map((c) => [c.id, c]));

  // Group the placed blocks by section, then order them by the block order.
  const bySection = new Map<string, { order: number; figureId: string }[]>();
  for (const p of placements) {
    if (!p.figure_id) continue;
    const card = cardById.get(p.card_id);
    if (!card?.section_id) continue;
    if (!sectionById.has(card.section_id)) continue;
    const bucket = bySection.get(card.section_id) ?? [];
    bucket.push({ order: card.order_index ?? 0, figureId: p.figure_id });
    bySection.set(card.section_id, bucket);
  }

  const numbers = new Map<string, string>();
  for (const [sectionId, bucket] of bySection) {
    const sectionNumber = cleanSectionNumber(sectionById.get(sectionId)?.section_number);
    bucket.sort((a, b) => a.order - b.order || a.figureId.localeCompare(b.figureId));
    bucket.forEach((entry, index) => {
      numbers.set(entry.figureId, `${sectionNumber}.${figureLetter(index)}`);
    });
  }
  return numbers;
}
