/**
 * Turns a proposal's stored content into the inputs `computeCitationNumbers`
 * expects, so every surface can derive display numbers from the same evidence.
 *
 * WHY SCAN HTML RATHER THAN READ `citation_instances`
 * The `<sup data-citation="…">` node inside the content is the authoritative
 * anchor; `citation_instances` is a debounced, derived index of it. Numbering
 * reads the authority directly, so it is never a reconcile behind, and — more
 * importantly — it also covers the LEGACY `section_content` documents, which
 * are not indexed at all and are where SUSIE-Q's citations actually live.
 *
 * LEGACY SECTIONS
 * A legacy `section_content` row is the whole body of its section, written
 * before the cards board existed. It is modelled here as a synthetic block at
 * the head of that section so it sorts ahead of any card blocks in the same
 * section without the numbering module needing to know legacy content exists.
 * Its section key ("b1-1") maps onto `section_number` ("B1.1") by lowercasing
 * and turning dots into dashes.
 *
 * The numbering rules themselves live in `citationNumbering.ts` and are not
 * duplicated here.
 */

import {
  computeCitationNumbers,
  extractCitationRefKeys,
  type CitationInstance,
  type CitationNumberingBlock,
  type CitationNumberingField,
  type CitationNumberingSection,
} from "./citationNumbering.ts";

export interface CitationSourceCard {
  id: string;
  section_id: string | null;
  order_index: number | null;
  anchor?: string | null;
  is_visible?: boolean | null;
  deleted_at?: string | null;
}

export interface CitationSourceField {
  id: string;
  card_id: string;
  order_index: number | null;
  content_html?: string | null;
  deleted_at?: string | null;
}

/** A pre-cards `section_content` row: `section_id` is a text key, not a uuid. */
export interface CitationSourceLegacySection {
  section_id: string;
  content: string | null;
}

export interface CitationSources {
  sections: ReadonlyArray<CitationNumberingSection & { section_number?: string | null }>;
  cards: ReadonlyArray<CitationSourceCard>;
  fields: ReadonlyArray<CitationSourceField>;
  legacySections?: ReadonlyArray<CitationSourceLegacySection>;
}

/** Legacy section key for a template section, e.g. "B1.1" -> "b1-1". */
export function legacySectionKey(sectionNumber: string | null | undefined): string {
  return (sectionNumber ?? "").trim().toLowerCase().replace(/\./g, "-");
}

/** Synthetic block id for a legacy section body. */
function legacyBlockId(sectionId: string): string {
  return `legacy-section:${sectionId}`;
}

/**
 * Computes the proposal-wide map from `ref_key` (the internal id in
 * `data-citation`) to the display number a reader sees.
 */
export function buildCitationNumberMap(sources: CitationSources): Map<number, number> {
  const blocks: CitationNumberingBlock[] = [];
  const fields: CitationNumberingField[] = [];
  const instances: CitationInstance[] = [];

  for (const card of sources.cards) {
    blocks.push({
      id: card.id,
      section_id: card.section_id,
      order_index: card.order_index,
      anchor: card.anchor,
      is_visible: card.is_visible,
      deleted_at: card.deleted_at,
    });
  }

  for (const field of sources.fields) {
    fields.push({
      id: field.id,
      card_id: field.card_id,
      order_index: field.order_index,
      deleted_at: field.deleted_at,
    });
    if (field.deleted_at != null) continue;
    extractCitationRefKeys(field.content_html).forEach((refKey, position) => {
      instances.push({ ref_key: refKey, field_id: field.id, position });
    });
  }

  if (sources.legacySections?.length) {
    const sectionByKey = new Map<string, string>();
    for (const section of sources.sections) {
      const key = legacySectionKey(section.section_number);
      if (key) sectionByKey.set(key, section.id);
    }
    for (const legacy of sources.legacySections) {
      const sectionId = sectionByKey.get(legacySectionKey(legacy.section_id));
      if (!sectionId) continue;
      const refKeys = extractCitationRefKeys(legacy.content);
      if (refKeys.length === 0) continue;
      const blockId = legacyBlockId(sectionId);
      blocks.push({
        id: blockId,
        section_id: sectionId,
        // `head` plus a negative order_index keeps the legacy body ahead of
        // every card block in the same section, which is where its text sits.
        anchor: "head",
        order_index: -1,
        is_visible: true,
        deleted_at: null,
      });
      refKeys.forEach((refKey, position) => {
        instances.push({ ref_key: refKey, card_id: blockId, position });
      });
    }
  }

  return computeCitationNumbers(instances, fields, blocks, sources.sections);
}
