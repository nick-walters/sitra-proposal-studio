import { useMemo } from 'react';
import type { WPDraft } from './useWPDrafts';

export interface WPCompletionStatus {
  methodology: boolean;
  objectives: boolean;
  tasks: boolean;
  deliverables: boolean;
  risks: boolean;
  interactions: boolean;
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
  riskCount: number;
  totalEffort: number;
  hasLead: boolean;
  tasksWithTiming: number;
}

export interface ProposalProgressTotals {
  totalTasks: number;
  totalDeliverables: number;
  totalRisks: number;
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
  // Strip HTML tags
  const plainText = text.replace(/<[^>]*>/g, '').trim();
  if (!plainText) return 0;
  return plainText.split(/\s+/).filter(word => word.length > 0).length;
}

// Check if a WP section is complete based on defined criteria
// Relaxed criteria: focus on core content being present
function checkWPCompletion(wp: WPDraft): WPCompletionStatus {
  // Methodology: at least some content (20+ words is a few sentences)
  const methodology = countWords(wp.methodology) >= 20;
  // Objectives: any content present
  const objectives = countWords(wp.objectives) >= 10;
  // Tasks: at least one task with a title
  const tasks = (wp.tasks || []).some(t => t.title && t.title.trim().length > 0);
  // Deliverables: at least one deliverable with a title
  const deliverables = (wp.deliverables || []).some(d => d.title && d.title.trim().length > 0);
  // Risks: at least one risk with a title
  const risks = (wp.risks || []).some(r => r.title && r.title.trim().length > 0);
  // Interactions: optional - any content in any field counts
  const interactions = countWords(wp.inputs_question) >= 5 || 
                       countWords(wp.outputs_question) >= 5 || 
                       countWords(wp.bottlenecks_question) >= 5;
  
  // Overall: core elements only (methodology, objectives, tasks, deliverables)
  // Risks and interactions are bonuses, not required for "On Track"
  const overall = methodology && objectives && tasks && deliverables;

  return {
    methodology,
    objectives,
    tasks,
    deliverables,
    risks,
    interactions,
    overall,
  };
}

// Calculate total effort for a WP from all tasks
function calculateTotalEffort(wp: WPDraft): number {
  if (!wp.tasks) return 0;
  return wp.tasks.reduce((total, task) => {
    if (!task.effort) return total;
    return total + task.effort.reduce((taskTotal, e) => taskTotal + (e.person_months || 0), 0);
  }, 0);
}

// Count tasks with timing set
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
      riskCount: (wp.risks || []).filter(r => r.title && r.title.trim().length > 0).length,
      totalEffort: calculateTotalEffort(wp),
      hasLead: wp.lead_participant_id !== null,
      tasksWithTiming: countTasksWithTiming(wp),
    }));
  }, [wpDrafts]);

  const totals = useMemo((): ProposalProgressTotals => {
    const totalTasks = progressData.reduce((sum, wp) => sum + wp.taskCount, 0);
    const totalDeliverables = progressData.reduce((sum, wp) => sum + wp.deliverableCount, 0);
    const totalRisks = progressData.reduce((sum, wp) => sum + wp.riskCount, 0);
    const totalPersonMonths = progressData.reduce((sum, wp) => sum + wp.totalEffort, 0);
    const wpsWithLead = progressData.filter(wp => wp.hasLead).length;
    const tasksWithTiming = progressData.reduce((sum, wp) => sum + wp.tasksWithTiming, 0);
    const completedWPs = progressData.filter(wp => wp.completion.overall).length;
    const totalWPs = progressData.length;
    const overallProgress = totalWPs > 0 ? Math.round((completedWPs / totalWPs) * 100) : 0;

    return {
      totalTasks,
      totalDeliverables,
      totalRisks,
      totalPersonMonths,
      wpsWithLead,
      totalWPs,
      tasksWithTiming,
      completedWPs,
      overallProgress,
    };
  }, [progressData]);

  return {
    progressData,
    totals,
  };
}
