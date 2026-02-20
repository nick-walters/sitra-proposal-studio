import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WP_COLORS,
  getContrastingTextColor,
  hexToHSL,
  lightenColor,
  getDefaultWPColor,
} from '@/lib/wpColors';

describe('getContrastingTextColor', () => {
  it('returns white for dark colors', () => {
    expect(getContrastingTextColor('#000000')).toBe('#FFFFFF');
    expect(getContrastingTextColor('#2563EB')).toBe('#FFFFFF');
  });

  it('returns black for light colors', () => {
    expect(getContrastingTextColor('#FFFFFF')).toBe('#000000');
    expect(getContrastingTextColor('#F0F0F0')).toBe('#000000');
  });

  it('handles colors without hash', () => {
    expect(getContrastingTextColor('000000')).toBe('#FFFFFF');
  });
});

describe('hexToHSL', () => {
  it('converts pure red', () => {
    const hsl = hexToHSL('#FF0000');
    expect(hsl.h).toBe(0);
    expect(hsl.s).toBe(100);
    expect(hsl.l).toBe(50);
  });

  it('converts pure white', () => {
    const hsl = hexToHSL('#FFFFFF');
    expect(hsl.l).toBe(100);
    expect(hsl.s).toBe(0);
  });

  it('converts pure black', () => {
    const hsl = hexToHSL('#000000');
    expect(hsl.l).toBe(0);
    expect(hsl.s).toBe(0);
  });

  it('converts without hash', () => {
    const hsl = hexToHSL('00FF00');
    expect(hsl.h).toBe(120);
    expect(hsl.s).toBe(100);
    expect(hsl.l).toBe(50);
  });
});

describe('lightenColor', () => {
  it('produces a lighter color', () => {
    const result = lightenColor('#2563EB', 20);
    expect(result).toMatch(/^hsl\(/);
    // The lightness should be higher than original
  });

  it('does not exceed 100% lightness', () => {
    const result = lightenColor('#FFFFFF', 50);
    expect(result).toMatch(/hsl\(\d+, \d+%, 100%\)/);
  });
});

describe('getDefaultWPColor', () => {
  it('returns the correct color for WP1', () => {
    expect(getDefaultWPColor(1)).toBe(DEFAULT_WP_COLORS[0]);
  });

  it('wraps around for WP numbers exceeding palette', () => {
    const paletteLen = DEFAULT_WP_COLORS.length;
    expect(getDefaultWPColor(paletteLen + 1)).toBe(DEFAULT_WP_COLORS[0]);
  });

  it('returns different colors for different WPs', () => {
    expect(getDefaultWPColor(1)).not.toBe(getDefaultWPColor(2));
  });
});
