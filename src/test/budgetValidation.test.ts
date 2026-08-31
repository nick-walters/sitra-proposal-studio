import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeBudgetRow } from '@/lib/budgetCompute';
import { parseIndicativeMaximum } from '@/components/BudgetValidationEngine';

/**
 * These tests import the real application code. The previous version of this
 * file defined its own copy of the validation logic, so it kept passing while
 * the shipped rule was broken (prompt 149).
 */

describe('computeBudgetRow — 25% flat-rate indirect base', () => {
  const row = {
    personnel_costs: 400_000,
    purchase_travel: 20_000,
    purchase_equipment: 30_000,
    purchase_other_goods: 10_000,
    procurement: 40_000,
    // Categories that must NOT attract indirect costs:
    subcontracting_costs: 250_000,
    financial_support_third_parties: 1_000_000,
    internally_invoiced: 75_000,
  };

  it('applies 25% to personnel + travel + equipment + other + procurement only', () => {
    const out = computeBudgetRow(row);
    const expectedBase = 400_000 + 20_000 + 30_000 + 10_000 + 40_000;
    expect(out.indirect).toBe(Math.round(expectedBase * 0.25 * 100) / 100);
    expect(out.indirect).toBe(125_000);
  });

  it('excludes subcontracting, FSTP and internally invoiced from the base', () => {
    const withExclusions = computeBudgetRow(row).indirect;
    const withoutExclusions = computeBudgetRow({
      ...row,
      subcontracting_costs: 0,
      financial_support_third_parties: 0,
      internally_invoiced: 0,
    }).indirect;
    expect(withExclusions).toBe(withoutExclusions);
  });

  it('still counts every category in direct and total eligible costs', () => {
    const out = computeBudgetRow(row);
    expect(out.directCosts).toBe(400_000 + 250_000 + 20_000 + 30_000 + 10_000 + 1_000_000 + 75_000 + 40_000);
    expect(out.totalEligible).toBe(out.directCosts + out.indirect);
  });

  it('honours an explicit indirect costs override', () => {
    expect(computeBudgetRow({ ...row, indirect_costs_override: 1 }).indirect).toBe(1);
  });

  it('derives personnel from pm_rate × person months when a rate is set', () => {
    const out = computeBudgetRow({ personnel_costs: 999, pm_rate: 8_000, totalPersonMonths: 12.5 });
    expect(out.personnel).toBe(100_000);
    expect(out.indirect).toBe(25_000);
  });

  it('applies the 70% IA rate to large enterprises only', () => {
    const base = { personnel_costs: 100_000 };
    expect(computeBudgetRow({ ...base, proposalType: 'IA', organisationCategory: 'LE' }).fundingRate).toBe(70);
    expect(computeBudgetRow({ ...base, proposalType: 'IA', organisationCategory: 'SME' }).fundingRate).toBe(100);
    expect(computeBudgetRow({ ...base, proposalType: 'RIA', organisationCategory: 'LE' }).fundingRate).toBe(100);
  });

  it('caps a manually requested contribution at the maximum', () => {
    const out = computeBudgetRow({ personnel_costs: 100_000, requested_eu_contribution: 999_999 });
    expect(out.requestedEuContribution).toBe(out.maxEuContribution);
  });
});

describe('generate-proposal-backups edge function agrees with computeBudgetRow', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'supabase/functions/generate-proposal-backups/index.ts'),
    'utf8',
  );

  const indirectBaseLine = source.match(/const indirectBase = ([^;]+);/);

  it('declares an indirect base', () => {
    expect(indirectBaseLine).not.toBeNull();
  });

  it('sums exactly the same five categories', () => {
    const terms = indirectBaseLine![1].split('+').map(t => t.trim()).sort();
    expect(terms).toEqual(['equipment', 'otherGoods', 'personnelCosts', 'procurement', 'travel'].sort());
    expect(terms).not.toContain('subcontracting');
    expect(terms).not.toContain('fstp');
    expect(terms).not.toContain('internally');
  });

  it('uses the same 25% flat rate and cent rounding', () => {
    expect(source).toContain('Math.round(indirectBase * 0.25 * 100) / 100');
  });

  it('uses the same Excel formula base in the export (D + F + G + H)', () => {
    expect(source).toContain('=ROUND((D${r}+F${r}+G${r}+H${r})*0.25,2)');
  });
});

describe('parseIndicativeMaximum', () => {
  it('returns null when nothing is stored', () => {
    expect(parseIndicativeMaximum(null)).toBeNull();
    expect(parseIndicativeMaximum('')).toBeNull();
    expect(parseIndicativeMaximum('to be confirmed')).toBeNull();
  });

  it('reads a plain amount', () => {
    expect(parseIndicativeMaximum('15000000')).toBe(15_000_000);
  });

  it('handles separators and currency symbols', () => {
    expect(parseIndicativeMaximum('€3 500 000')).toBe(3_500_000);
    expect(parseIndicativeMaximum('EUR 4,000,000')).toBe(4_000_000);
  });

  it('takes the upper bound of a range', () => {
    expect(parseIndicativeMaximum('3,000,000–4,000,000')).toBe(4_000_000);
  });

  it('keeps trailing decimals', () => {
    expect(parseIndicativeMaximum('1000.50')).toBe(1_000.5);
  });
});
