import { describe, it, expect } from 'vitest';
import { getRecommendedFormat, getFormatExtension } from '@/lib/imageCompression';

describe('getRecommendedFormat', () => {
  it('returns png for AI-generated figures', () => {
    expect(getRecommendedFormat('ai')).toBe('png');
  });

  it('returns jpeg for image type', () => {
    expect(getRecommendedFormat('image')).toBe('jpeg');
  });

  it('returns jpeg for unknown types', () => {
    expect(getRecommendedFormat('photo')).toBe('jpeg');
    expect(getRecommendedFormat('')).toBe('jpeg');
  });
});

describe('getFormatExtension', () => {
  it('returns png for png format', () => {
    expect(getFormatExtension('png')).toBe('png');
  });

  it('returns jpg for jpeg format', () => {
    expect(getFormatExtension('jpeg')).toBe('jpg');
  });
});
