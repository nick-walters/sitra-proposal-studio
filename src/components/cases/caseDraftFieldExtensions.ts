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
import {
  EDITOR_TABLE_CLASS,
  EDITOR_TABLE_HEADER_CELL_CLASS,
  EDITOR_TABLE_BODY_CELL_CLASS,
} from '@/lib/tableStyleSpec';
import { CaptionLabel } from '@/extensions/CaptionLabel';
import { ParagraphClassStatic } from '@/extensions/ParagraphClassStatic';
import { CitationMark, CitationNode } from '@/components/CitationMark';

/**
 * Schema used to render case-draft narrative subsections as STATIC HTML
 * while they are unfocused (see <LazyRichField staticExtensions={...} />).
 *
 * Superset of the A2 participant set: case drafts also support lists,
 * sub/superscript, colour, alignment, paragraph spacing, tables and
 * citations — mirroring the live editor's schema so a round-trip through
 * the static renderer is lossless.
 */
export const CASE_DRAFT_FIELD_EXTENSIONS: Extensions = [
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
  // Same presentation classes the live editor emits, so a table keeps its
  // Horizon Europe styling in the static (unfocused) render.
  Table.configure({ resizable: false, HTMLAttributes: { class: EDITOR_TABLE_CLASS } }),
  TableRow,
  TableHeader.configure({ HTMLAttributes: { class: EDITOR_TABLE_HEADER_CELL_CLASS } }),
  TableCell.configure({ HTMLAttributes: { class: EDITOR_TABLE_BODY_CELL_CLASS } }),
  WPReferenceNode,
  CaseReferenceNode,
  ParticipantReferenceNode,
  InlineReferenceNode,
  AcronymReference,
  FigureTableReferenceMark,
  // Authored table/figure captions must survive the static round trip.
  CaptionLabel,
  ParagraphClassStatic,
  CitationNode,
  CitationMark,
];
