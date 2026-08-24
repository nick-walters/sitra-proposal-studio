import { Extension, getSchema, type Extensions } from '@tiptap/core';
import type { Editor } from '@tiptap/react';

/**
 * What a rich-text field allows the shared toolbar to offer.
 *
 * Everything is derived from the field's own extension set — never from a
 * list of field names — so converting another field to TipTap automatically
 * gives the toolbar the right answer. Where the schema alone gives the wrong
 * answer, a field declares the difference with the `FieldCapabilities`
 * marker below, using one of the named presets at the bottom of this file.
 *
 * The BASELINE (undo, redo, bold, italic, underline, font colour) is offered
 * by every rich-text field and is therefore not represented as a flag —
 * except `colour`, which some legacy read-only paths still switch off.
 */
export interface FieldCapabilityFlags {
  /** Cross-reference INSERTION (chips already stored always render). */
  crossReferences: boolean;
  bulletList: boolean;
  orderedList: boolean;
  tables: boolean;
  /** Subheading dropdown. */
  headings: boolean;
  /** Font colour picker. */
  colour: boolean;
  alignment: boolean;
  /** Line height / paragraph spacing popover. */
  paragraphSpacing: boolean;
  figures: boolean;
  citations: boolean;
  /**
   * Bold / italic / underline. Off for fields whose OUTPUT styling is fixed
   * (Part B block titles are always bold+underlined, module headers always
   * bold+italic), so offering the marks would only let an author set
   * something the export overrides.
   */
  inlineEmphasis: boolean;
}

export const FULL_FIELD_CAPABILITIES: FieldCapabilityFlags = {
  crossReferences: true,
  bulletList: true,
  orderedList: true,
  tables: true,
  headings: true,
  colour: true,
  alignment: true,
  paragraphSpacing: true,
  figures: true,
  citations: true,
  inlineEmphasis: true,
};

/**
 * Marker extension a field's schema can carry to declare capabilities that
 * cannot be read off the ProseMirror schema.
 *
 * Reference nodes and TextStyle are present in title fields purely so stored
 * chips and colours keep RENDERING; their presence must not be read as "this
 * field may insert references or recolour text". Those flags are declared
 * here instead. Anything not declared falls back to schema inspection.
 */
export const FieldCapabilities = Extension.create<Partial<FieldCapabilityFlags>>({
  name: 'fieldCapabilities',
  addOptions() {
    return {};
  },
});

function schemaCapabilities(extensions: Extensions): FieldCapabilityFlags {
  let schema: ReturnType<typeof getSchema> | null = null;
  try {
    schema = getSchema(extensions);
  } catch {
    return { ...FULL_FIELD_CAPABILITIES };
  }
  const hasNode = (name: string) => !!schema?.nodes[name];
  const hasMark = (name: string) => !!schema?.marks[name];
  const bulletList = hasNode('bulletList');
  const orderedList = hasNode('orderedList');
  const lists = bulletList || orderedList;
  const tables = hasNode('table');
  const headings = hasNode('heading');
  const colour = hasMark('textStyle');
  const hasRefNodes =
    hasNode('wpReference') ||
    hasNode('inlineReference') ||
    hasNode('participantReference') ||
    hasNode('caseReference');
  return {
    crossReferences: hasRefNodes,
    bulletList,
    orderedList,
    tables,
    headings,
    colour,
    // Block-level controls only make sense where block structure is editable.
    alignment: lists || tables || headings,
    paragraphSpacing: lists || tables || headings,
    figures: tables || headings,
    citations: hasMark('citation') || hasNode('citation'),
    inlineEmphasis: hasMark('bold') || hasMark('italic') || hasMark('underline'),
  };
}

function declaredCapabilities(extensions: Extensions): Partial<FieldCapabilityFlags> {
  const marker = extensions.find((e) => e.name === 'fieldCapabilities');
  return ((marker?.options as Partial<FieldCapabilityFlags> | undefined) ?? {});
}

/** Capabilities of a static extension set (used at field-definition time). */
export function capabilitiesOfExtensions(extensions: Extensions): FieldCapabilityFlags {
  return { ...schemaCapabilities(extensions), ...declaredCapabilities(extensions) };
}

// ── Named presets — the configuration, expressed once per FIELD TYPE ────────
// A field type declares one of these on its extension set; no page ever
// decides which controls appear.

/** Everything off but the baseline. Colour stays on: it IS baseline. */
const NOTHING_BEYOND_BASELINE: FieldCapabilityFlags = {
  crossReferences: false,
  bulletList: false,
  orderedList: false,
  tables: false,
  headings: false,
  colour: true,
  alignment: false,
  paragraphSpacing: false,
  figures: false,
  citations: false,
  inlineEmphasis: true,
};

/**
 * Title fields: Part B block title (H3), Part B module header (H4), WP task
 * title, WP deliverable title, pilot case title, milestone name, risk
 * description.
 */
export const TITLE_FIELD_CAPABILITIES: FieldCapabilityFlags = { ...NOTHING_BEYOND_BASELINE };

/**
 * Part B block titles (H3) and module headers (H4). The export fixes their
 * styling — bold + underline for H3, bold + italic for H4 — so the field
 * offers only undo, redo and font colour; the colour is the one attribute
 * the output does carry through.
 */
export const HEADING_TITLE_FIELD_CAPABILITIES: FieldCapabilityFlags = {
  ...NOTHING_BEYOND_BASELINE,
  inlineEmphasis: false,
};


/**
 * A1 AI usage statement: undo, redo, bold, italic, underline and
 * cross-reference ONLY — no lists, alignment, spacing, table, colour,
 * subheading, figure or citations.
 */
export const A1_AI_STATEMENT_CAPABILITIES: FieldCapabilityFlags = {
  ...NOTHING_BEYOND_BASELINE,
  colour: false,
  crossReferences: true,
};

/**
 * A2 participant descriptions — also A4 text fields, means of verification
 * and mitigation measures: baseline + bullets, alignment, cross-reference.
 */
export const A2_DESCRIPTION_CAPABILITIES: FieldCapabilityFlags = {
  ...NOTHING_BEYOND_BASELINE,
  bulletList: true,
  alignment: true,
  crossReferences: true,
};

/**
 * A3 cost justification text: baseline + bullets, cross-reference.
 * Citations are deliberately OFF here — A3 justifications are not a
 * bibliography-bearing surface.
 */
export const A3_JUSTIFICATION_CAPABILITIES: FieldCapabilityFlags = {
  ...NOTHING_BEYOND_BASELINE,
  bulletList: true,
  crossReferences: true,
  citations: false,
};

/**
 * WP objectives: baseline + bullets, numbered, alignment, line height,
 * cross-reference. No subheading, table, figure or citations.
 */
export const WP_OBJECTIVES_CAPABILITIES: FieldCapabilityFlags = {
  ...NOTHING_BEYOND_BASELINE,
  bulletList: true,
  orderedList: true,
  alignment: true,
  paragraphSpacing: true,
  crossReferences: true,
};

// ── Per-editor registry ──────────────────────────────────────────────────────
// A field's mounted TipTap instance is created by the shared editor hook, so
// its own schema is the full one. The field registers the capabilities of the
// schema it was DEFINED with, and the toolbar reads them back by instance.

const registry = new WeakMap<Editor, FieldCapabilityFlags>();

export function registerFieldCapabilities(editor: Editor, capabilities: FieldCapabilityFlags): void {
  registry.set(editor, capabilities);
}

export function unregisterFieldCapabilities(editor: Editor): void {
  registry.delete(editor);
}

/**
 * Capabilities of the currently focused editor. With no focused editor the
 * toolbar keeps its full control set (nothing is hidden speculatively).
 */
export function getEditorCapabilities(editor: Editor | null | undefined): FieldCapabilityFlags {
  if (!editor || editor.isDestroyed) return { ...FULL_FIELD_CAPABILITIES };
  return registry.get(editor) ?? { ...FULL_FIELD_CAPABILITIES };
}
