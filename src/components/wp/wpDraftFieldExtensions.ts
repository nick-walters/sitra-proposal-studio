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
];
