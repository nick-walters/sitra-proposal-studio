import { Editor } from '@tiptap/core';
import { fetchReferenceData } from './referenceData';
import {
  formatFigureLabel,
  formatTableLabel,
} from './referenceLabels';



/**
 * Synchronizes all cross-reference marks in the editor with current numbering.
 * Scans through the document for all reference marks and updates their text
 * content and attributes if the referenced item's number has changed.
 * 
 * Returns true if any changes were made.
 */
export async function syncCrossReferences(
  editor: Editor,
  proposalId: string
): Promise<boolean> {
  if (!editor || !proposalId) return false;
  // TEMP-LOG
  console.log('[SYNC-RUN] syncCrossReferences invoked', { proposalId });


  // Cheap preflight: if the document has no cross-reference marks AND no
  // wpReference atom nodes (post-Stage-1 pilot), skip the proposal-wide SQL
  // fetch and the full-document scan entirely. This keeps section open/click
  // cheap on documents with no references.
  // Cheap preflight: skip the proposal-wide SQL fetch and the full-doc scan
  // if the document contains no reference marks AND no reference atom nodes
  // (wpReference / caseReference / participantReference — post Stage 1/2).
  const REF_MARK_NAMES = new Set([
    'figureTableReference',
  ]);
  const REF_NODE_NAMES = new Set([
    'wpReference',
    'caseReference',
    'participantReference',
    'inlineReference',
  ]);
  let hasAnyRef = false;
  editor.state.doc.descendants((node) => {
    if (hasAnyRef) return false;
    if (REF_NODE_NAMES.has(node.type.name)) {
      hasAnyRef = true;
      return false;
    }
    if (!node.isText) return;
    for (const m of node.marks) {
      if (REF_MARK_NAMES.has(m.type.name)) {
        hasAnyRef = true;
        return false;
      }
    }
  });
  if (!hasAnyRef) return false;


  const data = await fetchReferenceData(proposalId);
  const { state } = editor;
  const { doc, tr } = state;
  let changed = false;

  // Deleted-ref placeholder replacements. Each entry replaces the document
  // range [pos, end) with a single `inlineReference` atom carrying
  // refType='deleted' and a `deletedKind` so the editor renders a yellow
  // "[cross-reference to a deleted X]" placeholder the user can manually
  // remove. Applied AFTER all per-type attr/text refreshes, highest-pos
  // first, so earlier positions stay valid through size changes.
  type DeletionReplacement = { pos: number; end: number; kind: string };
  const deletions: DeletionReplacement[] = [];

  // ─────────────────────────────────────────────────────────────────────────
  // Position-safe sync.
  //
  // The previous implementation called tr.removeMark/addMark/replaceWith
  // immediately inside the doc.descendants walk using positions from the
  // OLD doc. As soon as one badge changed length, every later position was
  // stale — slicing a character off the next badge and leaving a one-char
  // marked tail (e.g. "WP3: Prototyping" → "WP3: Prototypin" + "g").
  //
  // The new pipeline:
  //   (1) Walk the doc collecting candidate text nodes + ref-mark metadata.
  //   (2) Detect runs of ADJACENT same-mark/same-id text nodes (existing
  //       splits from previous buggy runs) and queue a merge replacement.
  //   (3) For every other ref-mark-bearing text node, queue an attr/label
  //       update if its computed target differs.
  //   (4) Sort all queued changes by pos DESCENDING and apply with a live
  //       doc re-check (nodeAt + same mark/id) so positions never drift.
  // ─────────────────────────────────────────────────────────────────────────

  type RefId = { markName: string; idKey: string; idValue: string };

  const getRefId = (mark: any): RefId | null => {
    const a = mark.attrs;
    switch (mark.type.name) {
      // wpReference / caseReference / participantReference / inlineReference
      // are now inline atom NODES (Stages 1–3) — handled by their own
      // descendants passes below.
      case 'figureTableReference':
        if (a.figureId) return { markName: 'figureTableReference', idKey: 'figureId', idValue: a.figureId };
        if (a.tableKey) return { markName: 'figureTableReference', idKey: 'tableKey', idValue: a.tableKey };
        return null;
      default:
        return null;
    }
  };

  const computeTarget = (mark: any): { newAttrs: Record<string, any>; newLabel: string } | null => {
    const a = mark.attrs;
    switch (mark.type.name) {
      case 'figureTableReference': {
        if (a.figureId) {
          const f = data.figureById.get(a.figureId);
          if (!f) return null;
          return { newAttrs: { ...a }, newLabel: formatFigureLabel(f) };
        }
        if (a.tableKey) {
          // Table refs: rewrite label from persisted table_captions row.
          // Missing entries (compulsory tables without a captions row) are
          // left untouched — do NOT delete-mark them.
          if (!data.tableCaptionMap.has(a.tableKey)) return null;
          const caption = data.tableCaptionMap.get(a.tableKey) ?? '';
          return {
            newAttrs: { ...a },
            newLabel: formatTableLabel({ table_key: a.tableKey, caption }),
          };
        }
        return null;
      }
    }
    return null;
  };


  const attrsEqual = (a: Record<string, any>, b: Record<string, any>): boolean => {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) if (a[k] !== b[k]) return false;
    return true;
  };

  type Change = {
    pos: number;
    end: number;
    markName: string;
    idKey: string;
    idValue: string;
    newAttrs: Record<string, any>;
    newLabel: string | null; // null = leave text alone, only refresh attrs
    otherMarks: readonly any[];
  };

  // (1) Collect ref-mark-bearing text nodes.
  type Entry = { node: any; pos: number; parent: any; refMark: any; refId: RefId };
  const entries: Entry[] = [];
  doc.descendants((node, pos, parent) => {
    if (!node.isText) return;
    for (const m of node.marks) {
      const id = getRefId(m);
      if (id) {
        entries.push({ node, pos, parent, refMark: m, refId: id });
        break; // one ref mark per badge text node
      }
    }
  });

  // Detect figureTableReference marks whose figure has been deleted. Queue
  // a deletion replacement for the marked text range so it becomes a
  // yellow "[cross-reference to a deleted figure/table]" placeholder.
  for (const e of entries) {
    if (e.refMark.type.name !== 'figureTableReference') continue;
    const figId = e.refMark.attrs.figureId;
    if (figId && !data.figureById.get(figId)) {
      deletions.push({ pos: e.pos, end: e.pos + e.node.nodeSize, kind: 'figure' });
    }
  }

  // (2) Detect adjacent same-mark/same-id runs (split badges) and queue merges.
  const changes: Change[] = [];
  const handled = new Set<number>(); // positions covered by a merge

  let i = 0;
  while (i < entries.length) {
    const start = entries[i];
    let runEnd = start.pos + start.node.nodeSize;
    let j = i + 1;
    while (j < entries.length) {
      const next = entries[j];
      if (next.parent !== start.parent) break;
      if (next.pos !== runEnd) break;
      if (next.refId.markName !== start.refId.markName) break;
      if (next.refId.idValue !== start.refId.idValue) break;
      runEnd = next.pos + next.node.nodeSize;
      j++;
    }
    if (j - i > 1) {
      const target = computeTarget(start.refMark);
      if (target) {
        changes.push({
          pos: start.pos,
          end: runEnd,
          markName: start.refId.markName,
          idKey: start.refId.idKey,
          idValue: start.refId.idValue,
          newAttrs: target.newAttrs,
          newLabel: target.newLabel,
          otherMarks: start.node.marks.filter((m: any) => m !== start.refMark),
        });
        for (let k = i; k < j; k++) handled.add(entries[k].pos);
      }
    }
    i = j;
  }

  // (3) Single-node attr/label updates.
  for (const e of entries) {
    if (handled.has(e.pos)) continue;
    const target = computeTarget(e.refMark);
    if (!target) continue;
    const currentText = e.node.text || '';
    const textDiffers = currentText !== target.newLabel;
    const attrsDiffer = !attrsEqual(e.refMark.attrs, target.newAttrs);
    if (!textDiffers && !attrsDiffer) continue;
    changes.push({
      pos: e.pos,
      end: e.pos + e.node.nodeSize,
      markName: e.refId.markName,
      idKey: e.refId.idKey,
      idValue: e.refId.idValue,
      newAttrs: target.newAttrs,
      newLabel: textDiffers ? target.newLabel : null,
      otherMarks: e.node.marks.filter((m: any) => m !== e.refMark),
    });
  }

  // (4) Apply highest-pos-first with a live re-check.
  changes.sort((a, b) => b.pos - a.pos);
  for (const c of changes) {
    const targetNode = doc.nodeAt(c.pos);
    if (!targetNode || !targetNode.isText) continue;
    const stillHas = targetNode.marks.some(
      (m: any) => m.type.name === c.markName && m.attrs[c.idKey] === c.idValue,
    );
    if (!stillHas) continue;
    const markType = state.schema.marks[c.markName];
    if (!markType) continue;
    const newMark = markType.create(c.newAttrs);
    tr.removeMark(c.pos, c.end, markType);
    tr.addMark(c.pos, c.end, newMark);
    if (c.newLabel !== null) {
      tr.replaceWith(c.pos, c.end, state.schema.text(c.newLabel, [newMark, ...c.otherMarks]));
    }
    changed = true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // wpReference is an inline atom NODE (Stage 1 pilot migration).
  // Walk descendants for `wpReference` nodes, refresh their attrs against
  // current WP data, and apply via tr.setNodeMarkup. The label is recomputed
  // from attrs at render time, so no text replacement is needed and the
  // atom is structurally indivisible (no split-run / merge logic).
  // ─────────────────────────────────────────────────────────────────────────
  type WPNodeChange = { pos: number; newAttrs: Record<string, any> };
  const wpNodeChanges: WPNodeChange[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== 'wpReference') return;
    const a = node.attrs;
    if (!a.wpId) return;
    const wp = data.wpById.get(a.wpId);
    if (!wp) { deletions.push({ pos, end: pos + node.nodeSize, kind: 'wp' }); return; }
    const newAttrs = {
      ...a,
      wpNumber: wp.number,
      wpColor: wp.color,
      wpShortName: wp.short_name || a.wpShortName,
    };
    const attrsDiffer =
      a.wpNumber !== newAttrs.wpNumber ||
      a.wpColor !== newAttrs.wpColor ||
      a.wpShortName !== newAttrs.wpShortName;
    if (!attrsDiffer) return;
    wpNodeChanges.push({ pos, newAttrs });
  });

  // Apply highest-pos-first with a live re-check (defensive — atom nodes
  // are size 1 so position shifts won't actually occur, but the pattern
  // matches the mark pipeline for safety).
  wpNodeChanges.sort((a, b) => b.pos - a.pos);
  for (const c of wpNodeChanges) {
    const targetNode = tr.doc.nodeAt(c.pos);
    if (!targetNode || targetNode.type.name !== 'wpReference') continue;
    if (targetNode.attrs.wpId !== c.newAttrs.wpId) continue;
    tr.setNodeMarkup(c.pos, undefined, c.newAttrs);
    changed = true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // caseReference is an inline atom NODE (Stage 2 migration).
  // ─────────────────────────────────────────────────────────────────────────
  type CaseNodeChange = { pos: number; newAttrs: Record<string, any> };
  const caseNodeChanges: CaseNodeChange[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== 'caseReference') return;
    const a = node.attrs;
    if (!a.caseId) return;
    const c = data.caseById.get(a.caseId);
    if (!c) { deletions.push({ pos, end: pos + node.nodeSize, kind: 'case' }); return; }
    const newAttrs = {
      ...a,
      caseNumber: c.number,
      caseColor: c.color,
      caseShortName: c.short_name || a.caseShortName,
      caseType: c.case_type,
      includeNumber: c.include_number,
      includeAbbreviation: c.include_abbreviation,
    };
    const attrsDiffer =
      a.caseNumber !== newAttrs.caseNumber ||
      a.caseColor !== newAttrs.caseColor ||
      a.caseShortName !== newAttrs.caseShortName ||
      a.caseType !== newAttrs.caseType ||
      a.includeNumber !== newAttrs.includeNumber ||
      a.includeAbbreviation !== newAttrs.includeAbbreviation;
    if (!attrsDiffer) return;
    caseNodeChanges.push({ pos, newAttrs });
  });


  caseNodeChanges.sort((a, b) => b.pos - a.pos);
  for (const c of caseNodeChanges) {
    const targetNode = tr.doc.nodeAt(c.pos);
    if (!targetNode || targetNode.type.name !== 'caseReference') continue;
    if (targetNode.attrs.caseId !== c.newAttrs.caseId) continue;
    tr.setNodeMarkup(c.pos, undefined, c.newAttrs);
    changed = true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // participantReference is an inline atom NODE (Stage 2 migration).
  // ─────────────────────────────────────────────────────────────────────────
  type ParticipantNodeChange = { pos: number; newAttrs: Record<string, any> };
  const participantNodeChanges: ParticipantNodeChange[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== 'participantReference') return;
    const a = node.attrs;
    if (!a.participantId) return;
    const p = data.participantById.get(a.participantId);
    if (!p) { deletions.push({ pos, end: pos + node.nodeSize, kind: 'participant' }); return; }
    const newAttrs = {
      ...a,
      participantNumber: p.participant_number,
      shortName: p.organisation_short_name,
    };
    const attrsDiffer =
      a.participantNumber !== newAttrs.participantNumber ||
      a.shortName !== newAttrs.shortName;
    if (!attrsDiffer) return;
    participantNodeChanges.push({ pos, newAttrs });
  });

  participantNodeChanges.sort((a, b) => b.pos - a.pos);
  for (const c of participantNodeChanges) {
    const targetNode = tr.doc.nodeAt(c.pos);
    if (!targetNode || targetNode.type.name !== 'participantReference') continue;
    if (targetNode.attrs.participantId !== c.newAttrs.participantId) continue;
    tr.setNodeMarkup(c.pos, undefined, c.newAttrs);
    changed = true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // inlineReference is an inline atom NODE (Stage 3 migration). One node
  // type with three variants behind the `refType` attribute:
  //   - 'task'        -> refresh wpNumber/taskNumber/wpColor from taskById
  //   - 'deliverable' -> refresh deliverableNumber/wpColor from deliverableById
  //   - 'milestone'   -> refresh milestoneNumber from milestoneById
  // The displayed label is recomputed from attrs at render time, so no text
  // replacement is needed.
  // ─────────────────────────────────────────────────────────────────────────
  type InlineNodeChange = { pos: number; newAttrs: Record<string, any>; refType: string; idKey: string; idValue: string };
  const inlineNodeChanges: InlineNodeChange[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== 'inlineReference') return;
    const a = node.attrs;
    const refType = a.refType;

    if (refType === 'task') {
      if (!a.taskId) return;
      const t = data.taskById.get(a.taskId);
      if (!t) { deletions.push({ pos, end: pos + node.nodeSize, kind: 'task' }); return; }
      const newAttrs = { ...a, wpNumber: t.wp_number, taskNumber: t.number, wpColor: t.wp_color };
      const attrsDiffer =
        a.wpNumber !== newAttrs.wpNumber ||
        a.taskNumber !== newAttrs.taskNumber ||
        a.wpColor !== newAttrs.wpColor;
      if (!attrsDiffer) return;
      inlineNodeChanges.push({ pos, newAttrs, refType, idKey: 'taskId', idValue: a.taskId });
      return;
    }

    if (refType === 'deliverable') {
      if (!a.deliverableId) return;
      const d = data.deliverableById.get(a.deliverableId);
      if (!d) { deletions.push({ pos, end: pos + node.nodeSize, kind: 'deliverable' }); return; }
      const newAttrs = { ...a, deliverableNumber: d.number, wpColor: d.wp_color };
      const attrsDiffer =
        a.deliverableNumber !== newAttrs.deliverableNumber ||
        a.wpColor !== newAttrs.wpColor;
      if (!attrsDiffer) return;
      inlineNodeChanges.push({ pos, newAttrs, refType, idKey: 'deliverableId', idValue: a.deliverableId });
      return;
    }

    if (refType === 'milestone') {
      if (!a.milestoneId) return;
      const m = data.milestoneById.get(a.milestoneId);
      if (!m) { deletions.push({ pos, end: pos + node.nodeSize, kind: 'milestone' }); return; }
      const newAttrs = { ...a, milestoneNumber: m.number };
      const attrsDiffer = a.milestoneNumber !== newAttrs.milestoneNumber;
      if (!attrsDiffer) return;
      inlineNodeChanges.push({ pos, newAttrs, refType, idKey: 'milestoneId', idValue: a.milestoneId });
      return;
    }
  });


  inlineNodeChanges.sort((a, b) => b.pos - a.pos);
  for (const c of inlineNodeChanges) {
    const targetNode = tr.doc.nodeAt(c.pos);
    if (!targetNode || targetNode.type.name !== 'inlineReference') {
      console.log('[SYNC-INLINE] APPLY skipped — node not found', { refType: c.refType, pos: c.pos });
      continue;
    }
    if (targetNode.attrs.refType !== c.refType) {
      console.log('[SYNC-INLINE] APPLY skipped — refType drift', { expected: c.refType, got: targetNode.attrs.refType });
      continue;
    }
    if (targetNode.attrs[c.idKey] !== c.idValue) {
      console.log('[SYNC-INLINE] APPLY skipped — id drift', { refType: c.refType });
      continue;
    }
    tr.setNodeMarkup(c.pos, undefined, c.newAttrs);
    console.log('[SYNC-INLINE] APPLIED setNodeMarkup', { refType: c.refType, idValue: c.idValue, newAttrs: c.newAttrs });
    changed = true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Deleted-ref placeholders — apply LAST, highest-pos first so earlier
  // positions stay valid through any size changes (figureTable mark ranges
  // can be multi-char; atom nodes are size 1). Each replacement collapses
  // the original ref range into a single `inlineReference` atom with
  // refType='deleted' which renders as yellow plain text.
  // ─────────────────────────────────────────────────────────────────────────
  const inlineRefNodeType = state.schema.nodes['inlineReference'];
  if (inlineRefNodeType && deletions.length > 0) {
    deletions.sort((a, b) => b.pos - a.pos);
    for (const d of deletions) {
      // Map through any prior tr steps (mark refreshes / atom setMarkup)
      // so original-doc positions land at the right place in tr.doc.
      const mappedPos = tr.mapping.map(d.pos);
      const mappedEnd = tr.mapping.map(d.end);
      if (mappedEnd <= mappedPos) continue;
      const node = inlineRefNodeType.create({ refType: 'deleted', deletedKind: d.kind });
      tr.replaceWith(mappedPos, mappedEnd, node);
      changed = true;
    }
  }

  if (changed) {
    tr.setMeta('addToHistory', false);
    editor.view.dispatch(tr);
  }

  return changed;

}
