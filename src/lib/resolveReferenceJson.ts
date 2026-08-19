/**
 * Render-time cross-reference resolution for the STATIC (unfocused) path.
 *
 * The TipTap `generateJSON -> generateHTML` pipeline renders reference
 * badges purely from stored node attributes. Legacy chips carry an id but a
 * stale (or absent) number and no colour attribute, so numbers and work
 * package colours drifted.
 *
 * This module resolves the badge attributes against a live `RefSnapshot`
 * keyed on the id BEFORE the JSON is rendered. Rules:
 *   - An id that resolves always wins over stored text/colour.
 *   - An id that does not resolve leaves the stored values untouched, so the
 *     badge still renders its last known label rather than blank.
 *   - Nothing here writes to the database: resolution is render-time only.
 *
 * The same function is applied to the HTML handed to the mounted editor, so
 * focusing a field cannot change what is displayed.
 */

import type { RefSnapshot } from './referenceData';
import {
  formatFigureLabel,
  formatTableLabel,
} from './referenceLabels';

type JSONNode = {
  type?: string;
  attrs?: Record<string, any>;
  content?: JSONNode[];
  marks?: { type: string; attrs?: Record<string, any> }[];
  text?: string;
  [k: string]: any;
};

function resolveInlineReference(attrs: Record<string, any>, data: RefSnapshot) {
  const next = { ...attrs };
  switch (attrs.refType) {
    case 'deliverable': {
      const d = attrs.deliverableId ? data.deliverableById.get(attrs.deliverableId) : undefined;
      if (d) {
        next.deliverableNumber = d.number;
        if (d.wp_color) next.wpColor = d.wp_color;
      }
      return next;
    }
    case 'task': {
      const t = attrs.taskId ? data.taskById.get(attrs.taskId) : undefined;
      if (t) {
        next.wpNumber = t.wp_number;
        next.taskNumber = t.number;
        if (t.wp_color) next.wpColor = t.wp_color;
      }
      return next;
    }
    case 'milestone': {
      const m = attrs.milestoneId ? data.milestoneById.get(attrs.milestoneId) : undefined;
      if (m) next.milestoneNumber = m.number;
      return next;
    }
    default:
      return next;
  }
}

function resolveAttrs(type: string, attrs: Record<string, any>, data: RefSnapshot) {
  switch (type) {
    case 'inlineReference':
      return resolveInlineReference(attrs, data);
    case 'wpReference': {
      const wp = attrs.wpId ? data.wpById.get(attrs.wpId) : undefined;
      if (!wp) return attrs;
      return {
        ...attrs,
        wpNumber: wp.number,
        wpColor: wp.color || attrs.wpColor,
        wpShortName: wp.short_name ?? attrs.wpShortName ?? null,
      };
    }
    case 'caseReference': {
      const c = attrs.caseId ? data.caseById.get(attrs.caseId) : undefined;
      if (!c) return attrs;
      return {
        ...attrs,
        caseNumber: c.number,
        caseColor: c.color || attrs.caseColor,
        caseShortName: c.short_name || attrs.caseShortName,
        caseType: c.case_type,
        includeNumber: c.include_number,
        includeAbbreviation: c.include_abbreviation,
      };
    }
    case 'participantReference': {
      const p = attrs.participantId ? data.participantById.get(attrs.participantId) : undefined;
      if (!p) return attrs;
      return {
        ...attrs,
        participantNumber: p.participant_number ?? attrs.participantNumber,
        shortName: p.organisation_short_name || attrs.shortName,
      };
    }
    case 'acronymReference': {
      if (!data.acronymSegments.length) return attrs;
      return { ...attrs, segments: data.acronymSegments };
    }
    default:
      return attrs;
  }
}

/**
 * Figure / table references are a MARK on a text node, so resolution
 * rewrites the text itself. Unresolvable ids keep the stored text.
 */
function resolveMarkedText(node: JSONNode, data: RefSnapshot): JSONNode {
  const mark = node.marks?.find((m) => m.type === 'figureTableReference');
  if (!mark) return node;
  const a = mark.attrs || {};
  if (a.figureId) {
    const f = data.figureById.get(a.figureId);
    if (f) return { ...node, text: formatFigureLabel(f) };
    return node;
  }
  if (a.tableKey && data.tableCaptionMap.has(a.tableKey)) {
    return {
      ...node,
      text: formatTableLabel({ table_key: a.tableKey, caption: data.tableCaptionMap.get(a.tableKey) }),
    };
  }
  return node;
}

/** Recursively resolve every reference node/mark in a TipTap JSON document. */
export function resolveReferenceJson<T extends JSONNode>(doc: T, data: RefSnapshot | undefined): T {
  if (!data) return doc;

  const walk = (node: JSONNode): JSONNode => {
    let next: JSONNode = node;

    if (node.type === 'text' && node.marks?.length) {
      next = resolveMarkedText(node, data);
    } else if (node.type && node.attrs) {
      const attrs = resolveAttrs(node.type, node.attrs, data);
      if (attrs !== node.attrs) next = { ...next, attrs };
    }

    if (next.content?.length) {
      next = { ...next, content: next.content.map(walk) };
    }
    return next;
  };

  return walk(doc) as T;
}

export default resolveReferenceJson;
