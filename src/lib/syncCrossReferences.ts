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
    default: return 'C';
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
          if (currentText !== currentLabel || mark.attrs.wpNumber !== wp.number || mark.attrs.wpColor !== wp.color) {
            const newMark = mark.type.create({
              ...mark.attrs,
              wpNumber: wp.number,
              wpColor: wp.color,
              wpShortName: wp.short_name || mark.attrs.wpShortName,
            });
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

      // Handle case references
      if (mark.type.name === 'caseReference' && mark.attrs.caseId) {
        const caseItem = data.caseById.get(mark.attrs.caseId);
        if (caseItem) {
          const prefix = getCasePrefix(caseItem.case_type);
          const newLabel = `${prefix}${caseItem.number}`;
          const currentText = node.text || '';
          if (currentText !== newLabel || mark.attrs.caseNumber !== caseItem.number || mark.attrs.caseColor !== caseItem.color || mark.attrs.caseType !== caseItem.case_type) {
            const newMark = mark.type.create({
              ...mark.attrs,
              caseNumber: caseItem.number,
              caseColor: caseItem.color,
              caseShortName: caseItem.short_name || mark.attrs.caseShortName,
              caseType: caseItem.case_type,
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

      // Handle participant references
      if (mark.type.name === 'participantReference' && mark.attrs.participantId) {
        const participant = data.participantById.get(mark.attrs.participantId);
        if (participant) {
          const newLabel = participant.organisation_short_name || 'Partner';
          const currentText = node.text || '';
          if (currentText !== newLabel || mark.attrs.participantNumber !== participant.participant_number || mark.attrs.shortName !== participant.organisation_short_name) {
            const newMark = mark.type.create({
              ...mark.attrs,
              participantNumber: participant.participant_number,
              shortName: participant.organisation_short_name,
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

      // Handle figure/table references
      if (mark.type.name === 'figureTableReference') {
        const currentText = node.text || '';

        // Sync figures by figureId
        if (mark.attrs.figureId) {
          const figure = data.figureById.get(mark.attrs.figureId);
          if (figure) {
            const newLabel = `Figure ${figure.figure_number}`;
            if (currentText !== newLabel) {
              const newMark = mark.type.create({ ...mark.attrs });
              tr.removeMark(pos, pos + node.nodeSize, mark.type);
              tr.addMark(pos, pos + node.nodeSize, newMark);
              tr.replaceWith(pos, pos + node.nodeSize, state.schema.text(newLabel, [newMark, ...marks.filter(m => m !== mark)]));
              changed = true;
            }
          }
        }

        // Sync tables by tableKey — the table_key itself is stable,
        // but if the caption changes we don't need to update the ref text
        // (ref text is "Table 3.1.a", not the caption).
        // Table labels are derived from their key, so no dynamic update needed
        // unless we add table renumbering in the future.
      }
    }
  });

  if (changed) {
    editor.view.dispatch(tr);
  }

  return changed;
}
