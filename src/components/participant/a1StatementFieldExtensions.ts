import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
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
import { FieldCapabilities, A1_AI_STATEMENT_CAPABILITIES } from '@/lib/fieldCapabilities';

/**
 * A1 AI usage statement: baseline + bullets, numbered, alignment, line
 * height, table and cross-reference. No subheading, figure or citations.
 */
export const A1_STATEMENT_FIELD_EXTENSIONS: Extensions = [
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
  ParagraphSpacing,
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  WPReferenceNode,
  CaseReferenceNode,
  ParticipantReferenceNode,
  InlineReferenceNode,
  AcronymReference,
  FigureTableReferenceMark,
  FieldCapabilities.configure(A1_AI_STATEMENT_CAPABILITIES),
];
