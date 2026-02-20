import { describe, it, expect } from 'vitest';

// Extract cross-reference validation logic for testing
interface Deliverable {
  number: string;
  name: string;
  wp_number: number | null;
  task_id: string | null;
  lead_participant_id: string | null;
}

interface WPDraft {
  id: string;
  number: number;
  short_name: string | null;
  title: string | null;
}

interface Milestone {
  number: number;
  name: string;
  due_month: number | null;
  task_id: string | null;
  wps: string;
}

interface Risk {
  number: number;
  description: string;
  wps: string;
}

interface Task {
  id: string;
  number: number;
  title: string;
  wp_draft_id: string;
}

interface Issue {
  id: string;
  type: 'error' | 'warning';
  category: string;
  message: string;
}

function validateCrossReferences(
  deliverables: Deliverable[],
  wpDrafts: WPDraft[],
  milestones: Milestone[],
  risks: Risk[],
  tasks: Task[],
  participantIds: Set<string>,
): Issue[] {
  const found: Issue[] = [];
  const wpNumbers = new Set(wpDrafts.map(w => w.number));
  const taskIds = new Set(tasks.map(t => t.id));

  deliverables.forEach(d => {
    if (d.wp_number && !wpNumbers.has(d.wp_number))
      found.push({ id: `del-wp-${d.number}`, type: 'error', category: 'Deliverables', message: `D${d.number} "${d.name}" references non-existent WP${d.wp_number}` });
    if (d.task_id && !taskIds.has(d.task_id))
      found.push({ id: `del-task-${d.number}`, type: 'error', category: 'Deliverables', message: `D${d.number} "${d.name}" references a deleted task` });
    if (d.lead_participant_id && !participantIds.has(d.lead_participant_id))
      found.push({ id: `del-part-${d.number}`, type: 'error', category: 'Deliverables', message: `D${d.number} "${d.name}" has a lead participant that no longer exists` });
    if (!d.name?.trim())
      found.push({ id: `del-empty-${d.number}`, type: 'warning', category: 'Deliverables', message: `D${d.number} has no title` });
    if (!d.wp_number)
      found.push({ id: `del-orphan-${d.number}`, type: 'warning', category: 'Deliverables', message: `D${d.number} "${d.name}" is not assigned to any work package` });
  });

  milestones.forEach(m => {
    if (m.task_id && !taskIds.has(m.task_id))
      found.push({ id: `ms-task-${m.number}`, type: 'error', category: 'Milestones', message: `MS${m.number} "${m.name}" references a deleted task` });
    if (!m.due_month)
      found.push({ id: `ms-due-${m.number}`, type: 'warning', category: 'Milestones', message: `MS${m.number} "${m.name}" has no due month` });
    if (!m.name?.trim())
      found.push({ id: `ms-empty-${m.number}`, type: 'warning', category: 'Milestones', message: `MS${m.number} has no title` });
  });

  risks.forEach(r => {
    if (r.wps) {
      r.wps.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)).forEach(wpNum => {
        if (!wpNumbers.has(wpNum))
          found.push({ id: `risk-wp-${r.number}-${wpNum}`, type: 'error', category: 'Risks', message: `Risk ${r.number} references non-existent WP${wpNum}` });
      });
    }
  });

  return found;
}

describe('Cross-Reference Checker', () => {
  const wp1: WPDraft = { id: 'wp1', number: 1, short_name: 'WP1', title: 'Work Package 1' };
  const wp2: WPDraft = { id: 'wp2', number: 2, short_name: 'WP2', title: 'Work Package 2' };
  const task1: Task = { id: 't1', number: 1, title: 'Task 1', wp_draft_id: 'wp1' };
  const partIds = new Set(['part1', 'part2']);

  it('returns empty for valid references', () => {
    const deliverables: Deliverable[] = [
      { number: '1.1', name: 'D1', wp_number: 1, task_id: 't1', lead_participant_id: 'part1' },
    ];
    const issues = validateCrossReferences(deliverables, [wp1, wp2], [], [], [task1], partIds);
    expect(issues).toHaveLength(0);
  });

  it('flags deliverable referencing non-existent WP', () => {
    const deliverables: Deliverable[] = [
      { number: '1.1', name: 'D1', wp_number: 99, task_id: null, lead_participant_id: null },
    ];
    const issues = validateCrossReferences(deliverables, [wp1], [], [], [], partIds);
    const wpIssue = issues.find(i => i.id === 'del-wp-1.1');
    expect(wpIssue).toBeDefined();
    expect(wpIssue!.type).toBe('error');
  });

  it('flags deliverable referencing deleted task', () => {
    const deliverables: Deliverable[] = [
      { number: '1.1', name: 'D1', wp_number: 1, task_id: 'deleted-task', lead_participant_id: null },
    ];
    const issues = validateCrossReferences(deliverables, [wp1], [], [], [task1], partIds);
    expect(issues.some(i => i.id === 'del-task-1.1')).toBe(true);
  });

  it('flags deliverable with missing lead participant', () => {
    const deliverables: Deliverable[] = [
      { number: '1.1', name: 'D1', wp_number: 1, task_id: null, lead_participant_id: 'gone' },
    ];
    const issues = validateCrossReferences(deliverables, [wp1], [], [], [], partIds);
    expect(issues.some(i => i.id === 'del-part-1.1')).toBe(true);
  });

  it('warns on deliverable with no title', () => {
    const deliverables: Deliverable[] = [
      { number: '1.1', name: '', wp_number: 1, task_id: null, lead_participant_id: null },
    ];
    const issues = validateCrossReferences(deliverables, [wp1], [], [], [], partIds);
    expect(issues.some(i => i.id === 'del-empty-1.1' && i.type === 'warning')).toBe(true);
  });

  it('warns on orphan deliverable (no WP)', () => {
    const deliverables: Deliverable[] = [
      { number: '1.1', name: 'D1', wp_number: null, task_id: null, lead_participant_id: null },
    ];
    const issues = validateCrossReferences(deliverables, [wp1], [], [], [], partIds);
    expect(issues.some(i => i.id === 'del-orphan-1.1')).toBe(true);
  });

  it('flags milestone with deleted task', () => {
    const milestones: Milestone[] = [
      { number: 1, name: 'MS1', due_month: 12, task_id: 'deleted', wps: '1' },
    ];
    const issues = validateCrossReferences([], [wp1], milestones, [], [task1], partIds);
    expect(issues.some(i => i.id === 'ms-task-1')).toBe(true);
  });

  it('warns on milestone with no due month', () => {
    const milestones: Milestone[] = [
      { number: 1, name: 'MS1', due_month: null, task_id: null, wps: '1' },
    ];
    const issues = validateCrossReferences([], [wp1], milestones, [], [], partIds);
    expect(issues.some(i => i.id === 'ms-due-1')).toBe(true);
  });

  it('warns on milestone with no title', () => {
    const milestones: Milestone[] = [
      { number: 1, name: '', due_month: 6, task_id: null, wps: '1' },
    ];
    const issues = validateCrossReferences([], [wp1], milestones, [], [], partIds);
    expect(issues.some(i => i.id === 'ms-empty-1')).toBe(true);
  });

  it('flags risk referencing non-existent WP', () => {
    const risks: Risk[] = [
      { number: 1, description: 'Risk 1', wps: '1, 99' },
    ];
    const issues = validateCrossReferences([], [wp1], [], risks, [], partIds);
    expect(issues.some(i => i.id === 'risk-wp-1-99')).toBe(true);
    expect(issues.some(i => i.id === 'risk-wp-1-1')).toBe(false);
  });

  it('handles empty risk wps string', () => {
    const risks: Risk[] = [
      { number: 1, description: 'Risk 1', wps: '' },
    ];
    const issues = validateCrossReferences([], [wp1], [], risks, [], partIds);
    expect(issues).toHaveLength(0);
  });

  it('handles all empty inputs', () => {
    const issues = validateCrossReferences([], [], [], [], [], new Set());
    expect(issues).toHaveLength(0);
  });
});
