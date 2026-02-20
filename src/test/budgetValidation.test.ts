import { describe, it, expect } from 'vitest';

// Extract the budget validation logic for testing
interface BudgetRow {
  participant_id: string;
  personnel_costs: number;
  purchase_equipment: number;
  purchase_travel: number;
  purchase_other_goods: number;
  subcontracting_costs: number;
  internally_invoiced: number;
  is_locked: boolean;
}

interface Participant {
  id: string;
  organisation_short_name: string | null;
  organisation_name: string | null;
  participant_number: number;
}

interface ValidationRule {
  id: string;
  name: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  passed: boolean;
}

function runBudgetValidation(rows: BudgetRow[], parts: Participant[]): ValidationRule[] {
  const results: ValidationRule[] = [];

  const totalDirect = rows.reduce((s, r) => s + r.personnel_costs + r.purchase_equipment + r.purchase_travel + r.purchase_other_goods + r.subcontracting_costs + r.internally_invoiced, 0);
  const subcontractingTotal = rows.reduce((s, r) => s + r.subcontracting_costs, 0);
  const personnelTotal = rows.reduce((s, r) => s + r.personnel_costs, 0);

  const byParticipant: Record<string, number> = {};
  rows.forEach(r => {
    const total = r.personnel_costs + r.purchase_equipment + r.purchase_travel + r.purchase_other_goods + r.subcontracting_costs + r.internally_invoiced;
    byParticipant[r.participant_id] = (byParticipant[r.participant_id] || 0) + total;
  });

  if (rows.length === 0) {
    results.push({ id: 'empty-budget', name: 'Budget populated', severity: 'error', message: 'No budget data has been entered', passed: false });
  }

  if (totalDirect > 0 && subcontractingTotal > 0) {
    const ratio = subcontractingTotal / totalDirect;
    const tooHigh = ratio > 0.3;
    results.push({
      id: 'subcontracting-ratio', name: 'Subcontracting ratio',
      severity: tooHigh ? 'warning' : 'info',
      message: tooHigh ? `Subcontracting is ${(ratio * 100).toFixed(1)}% of direct costs (>30% requires justification)` : `Subcontracting is ${(ratio * 100).toFixed(1)}% of direct costs`,
      passed: !tooHigh,
    });
  }

  const zeroParts = parts.filter(p => (byParticipant[p.id] || 0) === 0);
  if (zeroParts.length > 0) {
    results.push({
      id: 'zero-budget', name: 'Zero-budget participants', severity: 'warning',
      message: `${zeroParts.length} participant(s) have no budget: ${zeroParts.map(p => p.organisation_short_name || p.organisation_name).join(', ')}`,
      passed: false,
    });
  }

  if (totalDirect > 0 && parts.length > 1) {
    const over = Object.entries(byParticipant).find(([, amount]) => amount / totalDirect > 0.5);
    if (over) {
      const p = parts.find(p => p.id === over[0]);
      results.push({
        id: 'concentration', name: 'Budget concentration', severity: 'warning',
        message: `${p?.organisation_short_name || 'A partner'} holds ${((over[1] / totalDirect) * 100).toFixed(0)}% of total budget`,
        passed: false,
      });
    }
  }

  if (totalDirect > 0 && personnelTotal === 0) {
    results.push({ id: 'no-personnel', name: 'Personnel costs', severity: 'warning', message: 'No personnel costs have been entered', passed: false });
  }

  const unlockedCount = rows.filter(r => !r.is_locked).length;
  if (unlockedCount > 0 && rows.length > 0) {
    results.push({
      id: 'unlocked-rows', name: 'Budget finalisation', severity: 'info',
      message: `${unlockedCount} of ${rows.length} budget row(s) are still unlocked`,
      passed: unlockedCount === 0,
    });
  }

  if (results.length === 0) {
    results.push({ id: 'all-ok', name: 'Budget populated', severity: 'info', message: 'Budget data looks good', passed: true });
  }

  return results;
}

const mkRow = (overrides: Partial<BudgetRow> = {}): BudgetRow => ({
  participant_id: 'p1',
  personnel_costs: 0,
  purchase_equipment: 0,
  purchase_travel: 0,
  purchase_other_goods: 0,
  subcontracting_costs: 0,
  internally_invoiced: 0,
  is_locked: false,
  ...overrides,
});

const mkPart = (id: string, num: number, shortName: string): Participant => ({
  id,
  organisation_short_name: shortName,
  organisation_name: shortName,
  participant_number: num,
});

describe('Budget Validation Engine', () => {
  it('flags empty budget', () => {
    const results = runBudgetValidation([], [mkPart('p1', 1, 'Org1')]);
    expect(results).toHaveLength(2); // empty-budget + zero-budget
    expect(results[0].id).toBe('empty-budget');
    expect(results[0].severity).toBe('error');
    expect(results[0].passed).toBe(false);
  });

  it('passes with valid budget data', () => {
    const rows = [
      mkRow({ participant_id: 'p1', personnel_costs: 50000, is_locked: true }),
      mkRow({ participant_id: 'p2', personnel_costs: 50000, is_locked: true }),
    ];
    const parts = [mkPart('p1', 1, 'A'), mkPart('p2', 2, 'B')];
    const results = runBudgetValidation(rows, parts);
    // Should only have info-level results, all passed
    const failures = results.filter(r => !r.passed);
    expect(failures).toHaveLength(0);
  });

  it('warns on high subcontracting ratio (>30%)', () => {
    const rows = [
      mkRow({ participant_id: 'p1', personnel_costs: 50000, subcontracting_costs: 40000 }),
    ];
    const parts = [mkPart('p1', 1, 'Org1')];
    const results = runBudgetValidation(rows, parts);
    const subRule = results.find(r => r.id === 'subcontracting-ratio');
    expect(subRule).toBeDefined();
    expect(subRule!.severity).toBe('warning');
    expect(subRule!.passed).toBe(false);
  });

  it('passes subcontracting ratio at exactly 30%', () => {
    const rows = [
      mkRow({ participant_id: 'p1', personnel_costs: 70000, subcontracting_costs: 30000 }),
    ];
    const parts = [mkPart('p1', 1, 'Org1')];
    const results = runBudgetValidation(rows, parts);
    const subRule = results.find(r => r.id === 'subcontracting-ratio');
    expect(subRule).toBeDefined();
    expect(subRule!.passed).toBe(true);
  });

  it('flags zero-budget participants', () => {
    const rows = [mkRow({ participant_id: 'p1', personnel_costs: 100000 })];
    const parts = [mkPart('p1', 1, 'A'), mkPart('p2', 2, 'B')];
    const results = runBudgetValidation(rows, parts);
    const zeroRule = results.find(r => r.id === 'zero-budget');
    expect(zeroRule).toBeDefined();
    expect(zeroRule!.message).toContain('B');
  });

  it('flags budget concentration >50%', () => {
    const rows = [
      mkRow({ participant_id: 'p1', personnel_costs: 80000 }),
      mkRow({ participant_id: 'p2', personnel_costs: 20000 }),
    ];
    const parts = [mkPart('p1', 1, 'BigOrg'), mkPart('p2', 2, 'SmallOrg')];
    const results = runBudgetValidation(rows, parts);
    const concRule = results.find(r => r.id === 'concentration');
    expect(concRule).toBeDefined();
    expect(concRule!.message).toContain('BigOrg');
    expect(concRule!.message).toContain('80');
  });

  it('does not flag concentration when single participant', () => {
    const rows = [mkRow({ participant_id: 'p1', personnel_costs: 100000 })];
    const parts = [mkPart('p1', 1, 'Solo')];
    const results = runBudgetValidation(rows, parts);
    const concRule = results.find(r => r.id === 'concentration');
    expect(concRule).toBeUndefined();
  });

  it('flags missing personnel costs', () => {
    const rows = [mkRow({ participant_id: 'p1', purchase_equipment: 50000 })];
    const parts = [mkPart('p1', 1, 'Org1')];
    const results = runBudgetValidation(rows, parts);
    const persRule = results.find(r => r.id === 'no-personnel');
    expect(persRule).toBeDefined();
  });

  it('tracks unlocked rows', () => {
    const rows = [
      mkRow({ participant_id: 'p1', personnel_costs: 50000, is_locked: false }),
      mkRow({ participant_id: 'p1', personnel_costs: 30000, is_locked: true }),
    ];
    const parts = [mkPart('p1', 1, 'Org1')];
    const results = runBudgetValidation(rows, parts);
    const lockRule = results.find(r => r.id === 'unlocked-rows');
    expect(lockRule).toBeDefined();
    expect(lockRule!.message).toContain('1 of 2');
    expect(lockRule!.passed).toBe(false);
  });

  it('does not flag concentration at exactly 50%', () => {
    const rows = [
      mkRow({ participant_id: 'p1', personnel_costs: 50000 }),
      mkRow({ participant_id: 'p2', personnel_costs: 50000 }),
    ];
    const parts = [mkPart('p1', 1, 'A'), mkPart('p2', 2, 'B')];
    const results = runBudgetValidation(rows, parts);
    const concRule = results.find(r => r.id === 'concentration');
    expect(concRule).toBeUndefined();
  });
});
