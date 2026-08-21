/**
 * Derived citation numbering — the single authority.
 *
 * A citation has no stored number. The number a reader sees is the position of
 * the reference's FIRST citation in reading order across the whole proposal.
 * Nothing is written to the database: every consumer calls this module, so a
 * block moving, being hidden or being binned renumbers the document with no
 * writes at all.
 *
 * Reading order is: section order -> block order within the section (head
 * blocks, then free blocks, then tail blocks, each by `order_index`) -> field
 * `order_index` within the block -> position within the field's HTML.
 *
 * Excluded entirely, consuming no number:
 *   - hidden blocks (`is_visible = false`)
 *   - blocks in the recycle bin (`deleted_at` set)
 *   - deleted fields
 * A reference cited only in excluded places has no number at all; it is simply
 * absent from the returned map, and survives in the library regardless.
 *
 * This module lives under `supabase/functions/_shared` so the browser and the
 * edge functions share ONE implementation — two hand-maintained copies of the
 * reference formatters diverged silently once already.
 */

/** Rank of the three block anchors in reading order. */
const ANCHOR_RANK: Record<string, number> = { head: 0, free: 1, tail: 2 };

export interface CitationNumberingSection {
  id: string;
  /** Explicit ordering when present. */
  order_index?: number | null;
  /** "B1.2" / "1.2" — used as the tie-break when no order_index exists. */
  section_number?: string | null;
}

export interface CitationNumberingBlock {
  id: string;
  section_id: string | null;
  order_index: number | null;
  /** 'head' | 'free' | 'tail'; anything unknown sorts with 'free'. */
  anchor?: string | null;
  is_visible?: boolean | null;
  deleted_at?: string | null;
}

export interface CitationNumberingField {
  id: string;
  card_id: string;
  order_index: number | null;
  deleted_at?: string | null;
}

/**
 * One occurrence of a citation. Anchored to a field, or — for content that is
 * not held in a field — directly to a block.
 */
export interface CitationInstance {
  ref_key: number;
  field_id?: string | null;
  card_id?: string | null;
  position: number;
}

/** Natural-ish compare so "1.10" follows "1.9" rather than "1.1". */
function compareSectionNumbers(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Extracts the ref_keys cited in a piece of field HTML, in document order,
 * INCLUDING repeats — the reconciler needs one row per occurrence, and the
 * position of each occurrence is its index in this list.
 *
 * The authoritative anchor is `<sup data-citation="…">`. The bare numeric
 * `<sup>N</sup>` fallback exists because citations saved before the node was
 * introduced carry their id only as text.
 */
export function extractCitationRefKeys(html: string | null | undefined): number[] {
  const out: number[] = [];
  if (!html) return out;
  const re = /<sup\b([^>]*)>([\s\S]*?)<\/sup>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || "";
    const dataMatch = attrs.match(/\bdata-citation=(?:"(\d+)"|'(\d+)'|(\d+))/i);
    const text = (m[2] || "").replace(/<[^>]+>/g, "").trim();
    const textMatch = text.match(/^\[?\s*(\d+)\s*\]?$/);
    const raw = dataMatch?.[1] ?? dataMatch?.[2] ?? dataMatch?.[3] ?? textMatch?.[1];
    if (raw == null) continue;
    const n = parseInt(raw, 10);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/**
 * Returns ref_key -> display number, numbered from 1 in order of first
 * citation. A reference cited more than once keeps the number of its first
 * citation. References with no visible citation are absent from the map.
 */
export function computeCitationNumbers(
  instances: ReadonlyArray<CitationInstance>,
  fields: ReadonlyArray<CitationNumberingField>,
  blocks: ReadonlyArray<CitationNumberingBlock>,
  sections: ReadonlyArray<CitationNumberingSection>,
): Map<number, number> {
  const sectionOrder = new Map<string, number>();
  [...sections]
    .sort((a, b) => {
      const ai = a.order_index ?? null;
      const bi = b.order_index ?? null;
      if (ai != null && bi != null && ai !== bi) return ai - bi;
      if (ai != null && bi == null) return -1;
      if (ai == null && bi != null) return 1;
      return compareSectionNumbers(a.section_number ?? a.id, b.section_number ?? b.id);
    })
    .forEach((s, i) => sectionOrder.set(s.id, i));

  // Blocks that are hidden, binned, or in an unknown section are dropped here
  // and so never reach the numbering loop at all.
  const blockRank = new Map<string, number>();
  const eligibleBlocks = blocks.filter(
    (b) =>
      b.section_id != null &&
      sectionOrder.has(b.section_id) &&
      b.deleted_at == null &&
      b.is_visible !== false,
  );
  for (const b of eligibleBlocks) {
    blockRank.set(b.id, 0); // placeholder, replaced below
  }
  const sortedBlocks = [...eligibleBlocks].sort((a, b) => {
    const sa = sectionOrder.get(a.section_id!)!;
    const sb = sectionOrder.get(b.section_id!)!;
    if (sa !== sb) return sa - sb;
    const aa = ANCHOR_RANK[a.anchor ?? "free"] ?? ANCHOR_RANK.free;
    const ab = ANCHOR_RANK[b.anchor ?? "free"] ?? ANCHOR_RANK.free;
    if (aa !== ab) return aa - ab;
    const ao = a.order_index ?? 0;
    const bo = b.order_index ?? 0;
    if (ao !== bo) return ao - bo;
    return a.id.localeCompare(b.id);
  });
  sortedBlocks.forEach((b, i) => blockRank.set(b.id, i));

  const fieldById = new Map(fields.map((f) => [f.id, f]));

  type Located = { block: number; field: number; position: number; refKey: number };
  const located: Located[] = [];

  for (const inst of instances) {
    let blockId: string | null | undefined;
    let fieldOrder = -1; // block-anchored content sorts before the block's fields

    if (inst.field_id) {
      const field = fieldById.get(inst.field_id);
      if (!field || field.deleted_at != null) continue;
      blockId = field.card_id;
      fieldOrder = field.order_index ?? 0;
    } else {
      blockId = inst.card_id;
    }
    if (!blockId) continue;
    const rank = blockRank.get(blockId);
    if (rank == null) continue;

    located.push({
      block: rank,
      field: fieldOrder,
      position: inst.position ?? 0,
      refKey: inst.ref_key,
    });
  }

  located.sort(
    (a, b) => a.block - b.block || a.field - b.field || a.position - b.position || a.refKey - b.refKey,
  );

  const numbers = new Map<number, number>();
  let next = 1;
  for (const item of located) {
    if (!numbers.has(item.refKey)) numbers.set(item.refKey, next++);
  }
  return numbers;
}
