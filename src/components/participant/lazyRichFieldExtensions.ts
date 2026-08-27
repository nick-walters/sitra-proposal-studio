import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import type { Extensions } from '@tiptap/core';

import { WPReferenceNode } from '@/extensions/WPReferenceNode';
import { CaseReferenceNode } from '@/extensions/CaseReferenceNode';
import { ParticipantReferenceNode } from '@/extensions/ParticipantReferenceNode';
import { InlineReferenceNode } from '@/extensions/InlineReferenceNode';
import { AcronymReference } from '@/extensions/AcronymReference';
import { FigureTableReferenceMark } from '@/extensions/FigureTableReferenceMark';
import { FieldCapabilities, A2_DESCRIPTION_CAPABILITIES } from '@/lib/fieldCapabilities';
import { TRACK_CHANGE_MARKS } from '@/extensions/TrackChanges';

/**
 * Schema used to render A2 participant-description fields as STATIC HTML
 * while they are unfocused.
 *
 * Deliberately minimal: these fields only ever supported bold, italic,
 * underline and cross-reference badges. No lists, tables, colour, links,
 * images or headings.
 *
 * The reference nodes are the same instances the live editor uses, so the
 * static markup is produced from node ATTRIBUTES (ids/numbers) rather than
 * from stored badge markup — numbers therefore resolve live.
 */
export const LAZY_RICH_FIELD_EXTENSIONS: Extensions = [
  StarterKit.configure({
    heading: false,
    orderedList: false,
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
  TextAlign.configure({ types: ['paragraph'] }),
  // Legacy stored content carries inline <span style="color:..."> wrappers.
  TextStyle,
  Color,
  WPReferenceNode,
  CaseReferenceNode,
  ParticipantReferenceNode,
  InlineReferenceNode,
  AcronymReference,
  FigureTableReferenceMark,
  // Tracked insertions/deletions are marks: absent from this schema they are
  // dropped by the static round trip the moment the field blurs.
  ...TRACK_CHANGE_MARKS,
  // Baseline + bullets, alignment, cross-reference.
  FieldCapabilities.configure(A2_DESCRIPTION_CAPABILITIES),
];
