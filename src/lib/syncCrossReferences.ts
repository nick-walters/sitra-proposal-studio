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

/**
 * Fetches current numbering data for all cross-referenceable items in a proposal
 */
async function fetchReferenceData(proposalId: string) {
  const [wpRes, taskRes, delRes, msRes] = await Promise.all([
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
  ]);

  const wps: WPData[] = wpRes.data || [];
  const wpMap = new Map(wps.map(wp => [wp.id, wp]));

  // Build task map with WP number resolved
  const wpDraftIds = new Set(wps.map(w => w.id));
  const tasks: TaskData[] = (taskRes.data || [])
    .filter(t => {
      const wp = wpMap.get(t.wp_draft_id);
      return wp !== undefined;
    })
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
  const milestones: MilestoneData[] = (msRes.data || []);

  return {
    wpById: wpMap,
    taskById: new Map(tasks.map(t => [t.id, t])),
    deliverableById: new Map(deliverables.map(d => [d.id, d])),
    milestoneById: new Map(milestones.map(m => [m.id, m])),
  };
}

/**
 * Synchronizes all cross-reference marks in the editor with current numbering.
 * Scans through the document for wpReference, inlineReference, and caseReference marks,
 * and updates their text content and attributes if the referenced item's number has changed.
 * 
 * Returns true if any changes were made.
 */
export async function syncCrossReferences(
  editor: Editor,
  proposalId: string
): Promise<boolean> {
  if (!editor || !proposalId) return false;

  const data = await fetchReferenceData(proposalId);
  const { state } = editor;
  const { doc, tr } = state;
  let changed = false;

  // Walk through all text nodes and check their marks
  doc.descendants((node, pos) => {
    if (!node.isText) return;

    const marks = node.marks;
    for (const mark of marks) {
      // Handle WP references
      if (mark.type.name === 'wpReference' && mark.attrs.wpId) {
        const wp = data.wpById.get(mark.attrs.wpId);
        if (wp) {
          const currentLabel = `WP${wp.number}`;
          const currentText = node.text || '';
          if (currentText !== currentLabel || mark.attrs.wpNumber !== wp.number) {
            // Update the mark attributes
            const newMark = mark.type.create({
              ...mark.attrs,
              wpNumber: wp.number,
              wpColor: wp.color,
              wpShortName: wp.short_name || mark.attrs.wpShortName,
            });
            // Replace text and mark
            tr.removeMark(pos, pos + node.nodeSize, mark.type);
            tr.addMark(pos, pos + node.nodeSize, newMark);
            if (currentText !== currentLabel) {
              tr.replaceWith(pos, pos + node.nodeSize, state.schema.text(currentLabel, [newMark, ...marks.filter(m => m !== mark)]));
            }
            changed = true;
          }
        }
      }

      // Handle inline references (task, deliverable, milestone)
      if (mark.type.name === 'inlineReference') {
        const refType = mark.attrs.refType;
        const currentText = node.text || '';

        if (refType === 'task' && mark.attrs.taskId) {
          const task = data.taskById.get(mark.attrs.taskId);
          if (task) {
            const newLabel = `T${task.wp_number}.${task.number}`;
            if (currentText !== newLabel || mark.attrs.wpNumber !== task.wp_number || mark.attrs.taskNumber !== task.number || mark.attrs.wpColor !== task.wp_color) {
              const newMark = mark.type.create({
                ...mark.attrs,
                wpNumber: task.wp_number,
                taskNumber: task.number,
                wpColor: task.wp_color,
              });
              tr.removeMark(pos, pos + node.nodeSize, mark.type);
              tr.addMark(pos, pos + node.nodeSize, newMark);
              if (currentText !== newLabel) {
                tr.replaceWith(pos, pos + node.nodeSize, state.schema.text(newLabel, [newMark, ...marks.filter(m => m !== mark)]));
              }
              changed = true;
            }
          }
        }

        if (refType === 'deliverable' && mark.attrs.deliverableId) {
          const del = data.deliverableById.get(mark.attrs.deliverableId);
          if (del) {
            const newLabel = del.number;
            if (currentText !== newLabel || mark.attrs.deliverableNumber !== del.number || mark.attrs.wpColor !== del.wp_color) {
              const newMark = mark.type.create({
                ...mark.attrs,
                deliverableNumber: del.number,
                wpColor: del.wp_color,
              });
              tr.removeMark(pos, pos + node.nodeSize, mark.type);
              tr.addMark(pos, pos + node.nodeSize, newMark);
              if (currentText !== newLabel) {
                tr.replaceWith(pos, pos + node.nodeSize, state.schema.text(newLabel, [newMark, ...marks.filter(m => m !== mark)]));
              }
              changed = true;
            }
          }
        }

        if (refType === 'milestone' && mark.attrs.milestoneId) {
          const ms = data.milestoneById.get(mark.attrs.milestoneId);
          if (ms) {
            const newLabel = `${ms.number}`;
            if (currentText !== newLabel || mark.attrs.milestoneNumber !== ms.number) {
              const newMark = mark.type.create({
                ...mark.attrs,
                milestoneNumber: ms.number,
              });
              tr.removeMark(pos, pos + node.nodeSize, mark.type);
              tr.addMark(pos, pos + node.nodeSize, newMark);
              if (currentText !== newLabel) {
                tr.replaceWith(pos, pos + node.nodeSize, state.schema.text(newLabel, [newMark, ...marks.filter(m => m !== mark)]));
              }
              changed = true;
            }
          }
        }
      }
    }
  });

  if (changed) {
    editor.view.dispatch(tr);
  }

  return changed;
}
