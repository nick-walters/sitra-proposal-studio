import { Editor } from '@tiptap/core';
import { supabase } from '@/integrations/supabase/client';

interface WPData {
  id: string;
  number: number;
  color: string;
  short_name: string | null;
}

interface TaskData {
  id: string;
  number: number;
  wp_number: number;
  wp_color: string;
}

interface DeliverableData {
  id: string;
  number: string;
  wp_number: number | null;
  wp_color: string;
}

interface MilestoneData {
  id: string;
  number: number;
}

interface CaseData {
  id: string;
  number: number;
  case_type: string;
  short_name: string | null;
  color: string;
}

interface ParticipantData {
  id: string;
  participant_number: number | null;
  organisation_short_name: string | null;
}

interface FigureData {
  id: string;
  figure_number: string;
  figure_type: string;
  title: string;
}

function getCasePrefix(caseType: string): string {
  switch (caseType) {
    case 'case_study': return 'CS';
    case 'use_case': return 'UC';
    case 'living_lab': return 'LL';
    case 'pilot': return 'P';
    case 'demonstration': return 'D';
    default: return '';
  }
}

/**
 * Fetches current numbering data for all cross-referenceable items in a proposal
 */
async function fetchReferenceData(proposalId: string) {
  const [wpRes, taskRes, delRes, msRes, caseRes, participantRes, figureRes, tableCaptionRes] = await Promise.all([
    supabase
      .from('wp_drafts')
      .select('id, number, color, short_name')
      .eq('proposal_id', proposalId)
      .order('number'),
    supabase
      .from('wp_draft_tasks')
      .select('id, number, wp_draft_id')
      .order('number'),
    supabase
      .from('b31_deliverables')
      .select('id, number, wp_number')
      .eq('proposal_id', proposalId),
    supabase
      .from('b31_milestones')
      .select('id, number')
      .eq('proposal_id', proposalId),
    supabase
      .from('case_drafts')
      .select('id, number, case_type, short_name, color')
      .eq('proposal_id', proposalId)
      .order('number'),
    supabase
      .from('participants')
      .select('id, participant_number, organisation_short_name')
      .eq('proposal_id', proposalId)
      .order('participant_number'),
    supabase
      .from('figures')
      .select('id, figure_number, figure_type, title')
      .eq('proposal_id', proposalId),
    supabase
      .from('table_captions')
      .select('table_key, caption')
      .eq('proposal_id', proposalId),
  ]);

  const wps: WPData[] = wpRes.data || [];
  const wpMap = new Map(wps.map(wp => [wp.id, wp]));

  // Build task map with WP number resolved
  const tasks: TaskData[] = (taskRes.data || [])
    .filter(t => wpMap.has(t.wp_draft_id))
    .map(t => {
      const wp = wpMap.get(t.wp_draft_id)!;
      return { id: t.id, number: t.number, wp_number: wp.number, wp_color: wp.color || '#000000' };
    });

  // Build WP number-to-color map for deliverables
  const wpNumberColorMap = new Map(wps.map(wp => [wp.number, wp.color || '#000000']));

  const deliverables: DeliverableData[] = (delRes.data || []).map(d => ({
    ...d,
    wp_color: d.wp_number ? wpNumberColorMap.get(d.wp_number) || '#000000' : '#000000',
  }));
  const milestones: MilestoneData[] = msRes.data || [];
  const cases: CaseData[] = caseRes.data || [];
  const participants: ParticipantData[] = participantRes.data || [];
  const figures: FigureData[] = figureRes.data || [];

  // Build table caption map: tableKey → caption text
  const tableCaptionMap = new Map<string, string>();
  for (const tc of tableCaptionRes.data || []) {
    tableCaptionMap.set(tc.table_key, tc.caption || '');
  }

  return {
    wpById: wpMap,
    taskById: new Map(tasks.map(t => [t.id, t])),
    deliverableById: new Map(deliverables.map(d => [d.id, d])),
    milestoneById: new Map(milestones.map(m => [m.id, m])),
    caseById: new Map(cases.map(c => [c.id, c])),
    participantById: new Map(participants.map(p => [p.id, p])),
    figureById: new Map(figures.map(f => [f.id, f])),
    tableCaptionMap,
  };
}

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

  // Cheap preflight: if the document has no cross-reference marks AND no
  // wpReference atom nodes (post-Stage-1 pilot), skip the proposal-wide SQL
  // fetch and the full-document scan entirely. This keeps section open/click
  // cheap on documents with no references.
  const REF_MARK_NAMES = new Set([
    'inlineReference',
    'caseReference',
    'participantReference',
    'figureTableReference',
  ]);
  let hasAnyRef = false;
  editor.state.doc.descendants((node) => {
    if (hasAnyRef) return false;
    if (node.type.name === 'wpReference') {
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
      case 'wpReference':
        return a.wpId ? { markName: 'wpReference', idKey: 'wpId', idValue: a.wpId } : null;
      case 'inlineReference':
        if (a.refType === 'task' && a.taskId) return { markName: 'inlineReference', idKey: 'taskId', idValue: a.taskId };
        if (a.refType === 'deliverable' && a.deliverableId) return { markName: 'inlineReference', idKey: 'deliverableId', idValue: a.deliverableId };
        if (a.refType === 'milestone' && a.milestoneId) return { markName: 'inlineReference', idKey: 'milestoneId', idValue: a.milestoneId };
        return null;
      case 'caseReference':
        return a.caseId ? { markName: 'caseReference', idKey: 'caseId', idValue: a.caseId } : null;
      case 'participantReference':
        return a.participantId ? { markName: 'participantReference', idKey: 'participantId', idValue: a.participantId } : null;
      case 'figureTableReference':
        return a.figureId ? { markName: 'figureTableReference', idKey: 'figureId', idValue: a.figureId } : null;
      default:
        return null;
    }
  };

  const computeTarget = (mark: any): { newAttrs: Record<string, any>; newLabel: string } | null => {
    const a = mark.attrs;
    switch (mark.type.name) {
      case 'wpReference': {
        const wp = data.wpById.get(a.wpId);
        if (!wp) return null;
        return {
          newAttrs: { ...a, wpNumber: wp.number, wpColor: wp.color, wpShortName: wp.short_name || a.wpShortName },
          newLabel: wp.short_name ? `WP${wp.number}: ${wp.short_name}` : `WP${wp.number}`,
        };
      }
      case 'inlineReference': {
        if (a.refType === 'task') {
          const t = data.taskById.get(a.taskId);
          if (!t) return null;
          return {
            newAttrs: { ...a, wpNumber: t.wp_number, taskNumber: t.number, wpColor: t.wp_color },
            newLabel: `T${t.wp_number}.${t.number}`,
          };
        }
        if (a.refType === 'deliverable') {
          const d = data.deliverableById.get(a.deliverableId);
          if (!d) return null;
          return {
            newAttrs: { ...a, deliverableNumber: d.number, wpColor: d.wp_color },
            newLabel: d.number,
          };
        }
        if (a.refType === 'milestone') {
          const m = data.milestoneById.get(a.milestoneId);
          if (!m) return null;
          return {
            newAttrs: { ...a, milestoneNumber: m.number },
            newLabel: `${m.number}`,
          };
        }
        return null;
      }
      case 'caseReference': {
        const c = data.caseById.get(a.caseId);
        if (!c) return null;
        const prefix = getCasePrefix(c.case_type);
        return {
          newAttrs: { ...a, caseNumber: c.number, caseColor: c.color, caseShortName: c.short_name || a.caseShortName, caseType: c.case_type },
          newLabel: prefix ? `${prefix}${c.number}` : (c.short_name || `${c.number}`),
        };
      }
      case 'participantReference': {
        const p = data.participantById.get(a.participantId);
        if (!p) return null;
        return {
          newAttrs: { ...a, participantNumber: p.participant_number, shortName: p.organisation_short_name },
          newLabel: p.organisation_short_name || 'Partner',
        };
      }
      case 'figureTableReference': {
        const f = data.figureById.get(a.figureId);
        if (!f) return null;
        return { newAttrs: { ...a }, newLabel: `Figure ${f.figure_number}` };
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
    if (!wp) return;
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

  if (changed) {
    tr.setMeta('addToHistory', false);
    editor.view.dispatch(tr);
  }

  return changed;

}
