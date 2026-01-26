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
// Uses a weighted scoring approach to create a mix of statuses
function checkWPCompletion(wp: WPDraft): WPCompletionStatus {
  // Methodology: substantial content (50+ words for "complete", 20+ for partial)
  const methodologyWords = countWords(wp.methodology);
  const methodology = methodologyWords >= 50;
  
  // Objectives: meaningful content (30+ words for "complete", 10+ for partial)
  const objectivesWords = countWords(wp.objectives);
  const objectives = objectivesWords >= 30;
  
  // Tasks: at least one task with title AND timing set
  const validTasks = (wp.tasks || []).filter(t => t.title && t.title.trim().length > 0);
  const tasksWithTiming = validTasks.filter(t => t.start_month !== null && t.end_month !== null);
  const tasks = validTasks.length > 0 && tasksWithTiming.length > 0;
  
  // Deliverables: at least one deliverable with title AND due month
  const validDeliverables = (wp.deliverables || []).filter(d => d.title && d.title.trim().length > 0);
  const deliverablesWithDue = validDeliverables.filter(d => d.due_month !== null && d.due_month !== undefined);
  const deliverables = validDeliverables.length > 0 && deliverablesWithDue.length > 0;
  
  // Risks: at least one risk with title AND mitigation
  const validRisks = (wp.risks || []).filter(r => r.title && r.title.trim().length > 0);
  const risksWithMitigation = validRisks.filter(r => r.mitigation && r.mitigation.trim().length > 0);
  const risks = validRisks.length > 0 && risksWithMitigation.length > 0;
  
  // Interactions: meaningful content in at least 2 of 3 fields
  const interactionFields = [
    countWords(wp.inputs_question) >= 10,
    countWords(wp.outputs_question) >= 10,
    countWords(wp.bottlenecks_question) >= 10,
  ].filter(Boolean).length;
  const interactions = interactionFields >= 2;
  
  // Overall: weighted scoring - need 4+ of 6 sections complete to be "On Track"
  const completedSections = [methodology, objectives, tasks, deliverables, risks, interactions]
    .filter(Boolean).length;
  const overall = completedSections >= 4;

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
