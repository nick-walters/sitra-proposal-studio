import { describe, it, expect } from 'vitest';
import { formatNumber, formatCurrency, parseFormattedNumber } from '@/lib/formatNumber';

describe('formatNumber', () => {
  it('formats integers with thousand separators', () => {
    expect(formatNumber(5000)).toBe('5,000');
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('formats zero', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it('formats negative numbers', () => {
    expect(formatNumber(-1500)).toBe('-1,500');
  });

  it('respects decimal places', () => {
    expect(formatNumber(1234.567, 2)).toMatch(/1,234\.57/);
  });

  it('adds trailing zeros for decimals', () => {
    expect(formatNumber(100, 2)).toMatch(/100\.00/);
  });
});

describe('formatCurrency', () => {
  it('formats as Euro with symbol', () => {
    const result = formatCurrency(5000);
    expect(result).toContain('5,000');
    expect(result).toContain('€');
  });

  it('formats zero', () => {
    const result = formatCurrency(0);
    expect(result).toContain('€');
    expect(result).toContain('0');
  });

  it('formats negative amounts', () => {
    const result = formatCurrency(-1500);
    expect(result).toContain('1,500');
  });
});

describe('parseFormattedNumber', () => {
  it('parses comma-separated numbers', () => {
    expect(parseFormattedNumber('5,000')).toBe(5000);
    expect(parseFormattedNumber('1,234,567')).toBe(1234567);
  });

  it('parses plain numbers', () => {
    expect(parseFormattedNumber('42')).toBe(42);
  });

  it('parses decimal numbers', () => {
    expect(parseFormattedNumber('1,234.56')).toBe(1234.56);
  });

  it('returns 0 for empty string', () => {
    expect(parseFormattedNumber('')).toBe(0);
  });

  it('returns 0 for non-numeric strings', () => {
    expect(parseFormattedNumber('abc')).toBe(0);
  });

  it('strips currency symbols', () => {
    expect(parseFormattedNumber('€5,000')).toBe(5000);
  });

  it('parses negative numbers', () => {
    expect(parseFormattedNumber('-1,500')).toBe(-1500);
  });
});
