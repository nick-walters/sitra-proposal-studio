import { describe, it, expect } from 'vitest';
import {
  EU_MEMBER_STATES,
  ASSOCIATED_COUNTRIES,
  THIRD_COUNTRIES,
  ALL_COUNTRIES,
  ALL_COUNTRIES_SORTED,
  isEligibleForGEP,
  getCategoryLabel,
} from '@/lib/countries';

describe('countries data integrity', () => {
  it('has 27 EU member states', () => {
    expect(EU_MEMBER_STATES).toHaveLength(27);
  });

  it('all EU countries have category "eu"', () => {
    for (const c of EU_MEMBER_STATES) {
      expect(c.category).toBe('eu');
    }
  });

  it('all associated countries have category "associated"', () => {
    for (const c of ASSOCIATED_COUNTRIES) {
      expect(c.category).toBe('associated');
    }
  });

  it('all third countries have category "third"', () => {
    for (const c of THIRD_COUNTRIES) {
      expect(c.category).toBe('third');
    }
  });

  it('ALL_COUNTRIES combines all three lists', () => {
    expect(ALL_COUNTRIES).toHaveLength(
      EU_MEMBER_STATES.length + ASSOCIATED_COUNTRIES.length + THIRD_COUNTRIES.length
    );
  });

  it('has no duplicate country codes', () => {
    const codes = ALL_COUNTRIES.map(c => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('ALL_COUNTRIES_SORTED is alphabetically sorted by name', () => {
    for (let i = 1; i < ALL_COUNTRIES_SORTED.length; i++) {
      expect(
        ALL_COUNTRIES_SORTED[i - 1].name.localeCompare(ALL_COUNTRIES_SORTED[i].name)
      ).toBeLessThanOrEqual(0);
    }
  });

  it('every country has a non-empty dialCode starting with +', () => {
    for (const c of ALL_COUNTRIES) {
      expect(c.dialCode).toMatch(/^\+\d+$/);
    }
  });
});

describe('isEligibleForGEP', () => {
  it('returns true for EU member states', () => {
    expect(isEligibleForGEP('Germany')).toBe(true);
    expect(isEligibleForGEP('France')).toBe(true);
  });

  it('returns true for associated countries', () => {
    expect(isEligibleForGEP('Norway')).toBe(true);
    expect(isEligibleForGEP('United Kingdom')).toBe(true);
  });

  it('returns false for third countries', () => {
    expect(isEligibleForGEP('United States')).toBe(false);
    expect(isEligibleForGEP('China')).toBe(false);
  });

  it('returns false for unknown country names', () => {
    expect(isEligibleForGEP('Atlantis')).toBe(false);
  });
});

describe('getCategoryLabel', () => {
  it('returns correct labels', () => {
    expect(getCategoryLabel('eu')).toBe('EU Member States');
    expect(getCategoryLabel('associated')).toBe('Associated Countries');
    expect(getCategoryLabel('third')).toBe('Third Countries');
  });
});
