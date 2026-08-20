import { Extension, getSchema, type Extensions } from '@tiptap/core';
import type { Editor } from '@tiptap/react';

/**
 * What a rich-text field allows the shared toolbar to offer.
 *
 * Everything is derived from the field's own extension set — never from a
 * list of field names — so converting another field to TipTap automatically
 * gives the toolbar the right answer.
 */
export interface FieldCapabilityFlags {
  /** Cross-reference INSERTION (chips already stored always render). */
  crossReferences: boolean;
  lists: boolean;
  tables: boolean;
  headings: boolean;
  /** Font colour picker. */
  colour: boolean;
  alignment: boolean;
  paragraphSpacing: boolean;
  figures: boolean;
  citations: boolean;
}

export const FULL_FIELD_CAPABILITIES: FieldCapabilityFlags = {
  crossReferences: true,
  lists: true,
  tables: true,
  headings: true,
  colour: true,
  alignment: true,
  paragraphSpacing: true,
  figures: true,
  citations: true,
};

/**
 * Marker extension a field's schema can carry to declare capabilities that
 * cannot be read off the ProseMirror schema.
 *
 * Reference nodes and TextStyle are present in title fields purely so stored
 * chips and colours keep RENDERING; their presence must not be read as "this
 * field may insert references or recolour text". Those two flags are declared
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
  const lists = hasNode('bulletList') || hasNode('orderedList');
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
    lists,
    tables,
    headings,
    colour,
    // Block-level controls only make sense where block structure is editable.
    alignment: lists || tables || headings,
    paragraphSpacing: lists || tables || headings,
    figures: tables || headings,
    citations: hasMark('citation') || hasNode('citation'),
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
