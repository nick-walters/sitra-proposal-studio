import { useMemo } from 'react';
import type { WPDraft } from './useWPDrafts';

export interface WPCompletionStatus {
  objectives: boolean;
  description: boolean;
  tasks: boolean;
  deliverables: boolean;
  lead: boolean;
  overall: boolean;
}

export interface WPProgressData {
  wpId: string;
  wpNumber: number;
  shortName: string | null;
  title: string | null;
  color: string;
  completion: WPCompletionStatus;
  taskCount: number;
  deliverableCount: number;
  totalEffort: number;
  hasLead: boolean;
  tasksWithTiming: number;
}

export interface ProposalProgressTotals {
  totalTasks: number;
  totalDeliverables: number;
  totalPersonMonths: number;
  wpsWithLead: number;
  totalWPs: number;
  tasksWithTiming: number;
  completedWPs: number;
  overallProgress: number;
}

// Word count helper - strips HTML tags
function countWords(text: string | null | undefined): number {
  if (!text) return 0;
  const plainText = text.replace(/<[^>]*>/g, '').trim();
  if (!plainText) return 0;
  return plainText.split(/\s+/).filter(word => word.length > 0).length;
}

// Only counts CURRENTLY-EDITABLE WP-draft fields: objectives, description_before_tasks,
// tasks, deliverables, lead participant. Methodology and inputs/outputs/bottlenecks
// questions are retired and no longer surfaced in the editor; risks/milestones are
// managed proposal-wide on the Milestones & risks page, not per-WP here.
function checkWPCompletion(wp: WPDraft): WPCompletionStatus {
  const objectives = countWords(wp.objectives) >= 30;
  const description = countWords(wp.description_before_tasks) >= 30;

  const validTasks = (wp.tasks || []).filter(t => t.title && t.title.trim().length > 0);
  const tasksWithTiming = validTasks.filter(t => t.start_month !== null && t.end_month !== null);
  const tasks = validTasks.length > 0 && tasksWithTiming.length > 0;

  const validDeliverables = (wp.deliverables || []).filter(d => d.title && d.title.trim().length > 0);
  const deliverablesWithDue = validDeliverables.filter(d => d.due_month !== null && d.due_month !== undefined);
  const deliverables = validDeliverables.length > 0 && deliverablesWithDue.length > 0;

  const lead = wp.lead_participant_id !== null;

  const completedSections = [objectives, description, tasks, deliverables, lead].filter(Boolean).length;
  const overall = completedSections >= 4;

  return { objectives, description, tasks, deliverables, lead, overall };
}

function calculateTotalEffort(wp: WPDraft): number {
  if (!wp.tasks) return 0;
  return wp.tasks.reduce((total, task) => {
    if (!task.effort) return total;
    return total + task.effort.reduce((taskTotal, e) => taskTotal + (e.person_months || 0), 0);
  }, 0);
}

function countTasksWithTiming(wp: WPDraft): number {
  if (!wp.tasks) return 0;
  return wp.tasks.filter(t => t.start_month !== null && t.end_month !== null).length;
}

export function useWPProgress(wpDrafts: WPDraft[]) {
  const progressData = useMemo((): WPProgressData[] => {
    return wpDrafts.map(wp => ({
      wpId: wp.id,
      wpNumber: wp.number,
      shortName: wp.short_name,
      title: wp.title,
      color: wp.color,
      completion: checkWPCompletion(wp),
      taskCount: (wp.tasks || []).filter(t => t.title && t.title.trim().length > 0).length,
      deliverableCount: (wp.deliverables || []).filter(d => d.title && d.title.trim().length > 0).length,
      totalEffort: calculateTotalEffort(wp),
      hasLead: wp.lead_participant_id !== null,
      tasksWithTiming: countTasksWithTiming(wp),
    }));
  }, [wpDrafts]);

  const totals = useMemo((): ProposalProgressTotals => {
    const totalTasks = progressData.reduce((sum, wp) => sum + wp.taskCount, 0);
    const totalDeliverables = progressData.reduce((sum, wp) => sum + wp.deliverableCount, 0);
    const totalPersonMonths = progressData.reduce((sum, wp) => sum + wp.totalEffort, 0);
    const wpsWithLead = progressData.filter(wp => wp.hasLead).length;
    const tasksWithTiming = progressData.reduce((sum, wp) => sum + wp.tasksWithTiming, 0);
    const completedWPs = progressData.filter(wp => wp.completion.overall).length;
    const totalWPs = progressData.length;
    const overallProgress = totalWPs > 0 ? Math.round((completedWPs / totalWPs) * 100) : 0;

    return {
      totalTasks,
      totalDeliverables,
      totalPersonMonths,
      wpsWithLead,
      totalWPs,
      tasksWithTiming,
      completedWPs,
      overallProgress,
    };
  }, [progressData]);

  return { progressData, totals };
}

