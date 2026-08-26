import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import type { Extensions } from '@tiptap/core';

import { OrderedListStyled } from '@/extensions/OrderedListStyled';
import { ParagraphSpacing } from '@/extensions/ParagraphSpacing';
import { WPReferenceNode } from '@/extensions/WPReferenceNode';
import { CaseReferenceNode } from '@/extensions/CaseReferenceNode';
import { ParticipantReferenceNode } from '@/extensions/ParticipantReferenceNode';
import { InlineReferenceNode } from '@/extensions/InlineReferenceNode';
import { AcronymReference } from '@/extensions/AcronymReference';
import { FigureTableReferenceMark } from '@/extensions/FigureTableReferenceMark';
import { CaptionLabel } from '@/extensions/CaptionLabel';
import { ParagraphClassStatic } from '@/extensions/ParagraphClassStatic';
import {
  FieldCapabilities,
  TITLE_FIELD_CAPABILITIES,
  HEADING_TITLE_FIELD_CAPABILITIES,
  WP_OBJECTIVES_CAPABILITIES,
  A2_DESCRIPTION_CAPABILITIES,
  A3_JUSTIFICATION_CAPABILITIES,
} from '@/lib/fieldCapabilities';
import { CitationMark, CitationNode } from '@/components/CitationMark';

/**
 * Reference nodes shared by every WP-draft static schema. They resolve their
 * label from ATTRIBUTES (ids / numbers), which is what makes numbering live:
 * a chip whose baked text is stale still renders the current number.
 */
const REFERENCE_NODES: Extensions = [
  WPReferenceNode,
  CaseReferenceNode,
  ParticipantReferenceNode,
  InlineReferenceNode,
  AcronymReference,
  FigureTableReferenceMark,
  // Authored table/figure captions must survive the static round trip.
  CaptionLabel,
  ParagraphClassStatic,
];

/**
 * Narrative WP-draft fields: objectives, the optional description before
 * tasks, task descriptions and the planning questions.
 *
 * Mirrors the live editor's schema (headings, lists, alignment, colour,
 * sub/superscript, paragraph spacing, tables, citations and every
 * cross-reference type) so a round-trip through the static renderer is
 * lossless.
 */
export const WP_DRAFT_FIELD_EXTENSIONS: Extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3, 4] },
    orderedList: false,
    underline: false,
    codeBlock: false,
    code: false,
    dropcursor: false,
    gapcursor: false,
    undoRedo: { depth: 100, newGroupDelay: 1200 },
  }),
  OrderedListStyled,
  Underline,
  Superscript,
  Subscript,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  TextStyle,
  Color,
  ParagraphSpacing,
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  ...REFERENCE_NODES,
  CitationNode,
  CitationMark,
];

/**
 * Short "title" fields that are rich text but deliberately limited to BOLD
 * and ITALIC: deliverable titles, milestone names and risk descriptions.
 *
 * No lists, no tables, no headings and no cross-reference insertion path.
 * The reference nodes are still present so any badge stored by the legacy
 * contentEditable fields keeps rendering (and keeps resolving live) instead
 * of being silently dropped by the static renderer.
 */
export const WP_TITLE_FIELD_EXTENSIONS: Extensions = [
  StarterKit.configure({
    heading: false,
    bulletList: false,
    orderedList: false,
    listItem: false,
    listKeymap: false,
    blockquote: false,
    codeBlock: false,
    code: false,
    horizontalRule: false,
    link: false,
    underline: false,
    strike: false,
    dropcursor: false,
    gapcursor: false,
    undoRedo: { depth: 100, newGroupDelay: 1200 },
  }),
  Underline,
  TextStyle,
  Color,
  ...REFERENCE_NODES,
  // Reference nodes and TextStyle above exist only so stored chips and
  // colours keep rendering. Declare explicitly that this field may not
  // INSERT references, so the shared toolbar hides that control while the
  // caret is here. Font colour IS baseline and stays available.
  FieldCapabilities.configure(TITLE_FIELD_CAPABILITIES),
];

/**
 * WP objectives: baseline + bullets, numbered, alignment, line height and
 * cross-reference. No subheading, table, figure or citations.
 */
export const WP_OBJECTIVES_FIELD_EXTENSIONS: Extensions = [
  StarterKit.configure({
    heading: false,
    orderedList: false,
    underline: false,
    codeBlock: false,
    code: false,
    dropcursor: false,
    gapcursor: false,
    undoRedo: { depth: 100, newGroupDelay: 1200 },
  }),
  OrderedListStyled,
  Underline,
  Superscript,
  Subscript,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  TextStyle,
  Color,
  ParagraphSpacing,
  ...REFERENCE_NODES,
  FieldCapabilities.configure(WP_OBJECTIVES_CAPABILITIES),
];

/**
 * Means of verification (milestones) and mitigation measures (risks):
 * baseline + bullets, alignment and cross-reference.
 */
export const WP_SHORT_NARRATIVE_FIELD_EXTENSIONS: Extensions = [
  StarterKit.configure({
    heading: false,
    orderedList: false,
    underline: false,
    codeBlock: false,
    code: false,
    dropcursor: false,
    gapcursor: false,
    undoRedo: { depth: 100, newGroupDelay: 1200 },
  }),
  OrderedListStyled,
  Underline,
  TextAlign.configure({ types: ['paragraph'] }),
  TextStyle,
  Color,
  ...REFERENCE_NODES,
  FieldCapabilities.configure(A2_DESCRIPTION_CAPABILITIES),
];

/**
 * A3 cost justification text: baseline + bullets and cross-reference.
 * No numbered lists, alignment, line height, table, figure or citations.
 */
export const A3_JUSTIFICATION_FIELD_EXTENSIONS: Extensions = [
  StarterKit.configure({
    heading: false,
    orderedList: false,
    underline: false,
    codeBlock: false,
    code: false,
    dropcursor: false,
    gapcursor: false,
    undoRedo: { depth: 100, newGroupDelay: 1200 },
  }),
  Underline,
  TextStyle,
  Color,
  ...REFERENCE_NODES,
  FieldCapabilities.configure(A3_JUSTIFICATION_CAPABILITIES),
];

/**
 * Part B block titles (H3) and module headers (H4).
 *
 * Identical schema to WP_TITLE_FIELD_EXTENSIONS, but declares
 * `inlineEmphasis: false`: the export fixes their styling (bold + underline
 * for block titles, bold + italic for module headers), so bold, italic and
 * underline are not offered. Only undo, redo and font colour remain — colour
 * being the one attribute the output carries through.
 */
export const HEADING_TITLE_FIELD_EXTENSIONS: Extensions = [
  ...WP_TITLE_FIELD_EXTENSIONS.filter((e) => e.name !== 'fieldCapabilities'),
  FieldCapabilities.configure(HEADING_TITLE_FIELD_CAPABILITIES),
];
