import { describe, it, expect } from 'vitest';

// Extract and test the pure functions from ProposalScoringAssessment
function countWords(html: string): number {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? text.split(/\s+/).length : 0;
}

function hasKeywords(html: string, keywords: string[]): boolean {
  const text = html.replace(/<[^>]+>/g, ' ').toLowerCase();
  return keywords.some(k => text.includes(k.toLowerCase()));
}

interface Signal {
  label: string;
  present: boolean;
  weight: number;
}

function computeScore(signals: Signal[], maxScore: number) {
  const totalWeight = signals.reduce((s, sig) => s + sig.weight, 0);
  const achievedWeight = signals.filter(s => s.present).reduce((s, sig) => s + sig.weight, 0);
  const percentage = totalWeight > 0 ? Math.round((achievedWeight / totalWeight) * 100) : 0;
  const estimatedScore = Math.round((percentage / 100) * maxScore * 10) / 10;
  return { percentage, estimatedScore };
}

describe('countWords', () => {
  it('returns 0 for empty string', () => {
    expect(countWords('')).toBe(0);
  });

  it('returns 0 for whitespace-only string', () => {
    expect(countWords('   ')).toBe(0);
  });

  it('counts plain text words', () => {
    expect(countWords('hello world foo')).toBe(3);
  });

  it('strips HTML tags', () => {
    expect(countWords('<p>hello <strong>world</strong></p>')).toBe(2);
  });

  it('handles &nbsp; entities', () => {
    expect(countWords('hello&nbsp;world')).toBe(2);
  });

  it('handles deeply nested HTML', () => {
    expect(countWords('<div><p><span><em>one</em> two</span></p></div>')).toBe(2);
  });

  it('handles multiple consecutive tags', () => {
    expect(countWords('<p></p><p>word</p><p></p>')).toBe(1);
  });

  it('handles self-closing tags', () => {
    expect(countWords('before<br/>after')).toBe(2);
  });
});

describe('hasKeywords', () => {
  it('returns false for empty content', () => {
    expect(hasKeywords('', ['test'])).toBe(false);
  });

  it('returns false when no keywords match', () => {
    expect(hasKeywords('the quick brown fox', ['cat', 'dog'])).toBe(false);
  });

  it('returns true when a keyword is found', () => {
    expect(hasKeywords('the novel approach is great', ['novel'])).toBe(true);
  });

  it('is case insensitive', () => {
    expect(hasKeywords('Novel Approach', ['novel'])).toBe(true);
    expect(hasKeywords('novel approach', ['Novel'])).toBe(true);
  });

  it('matches partial keywords (prefix matching)', () => {
    expect(hasKeywords('innovative solutions', ['innovat'])).toBe(true);
  });

  it('strips HTML before matching', () => {
    expect(hasKeywords('<p>state-of-the-art</p>', ['state-of-the-art'])).toBe(true);
  });

  it('returns true if any keyword matches', () => {
    expect(hasKeywords('methodology is key', ['objective', 'methodology'])).toBe(true);
  });

  it('returns false for empty keywords array', () => {
    expect(hasKeywords('some text', [])).toBe(false);
  });
});

describe('computeScore', () => {
  it('returns 0 for no signals', () => {
    const { percentage, estimatedScore } = computeScore([], 5);
    expect(percentage).toBe(0);
    expect(estimatedScore).toBe(0);
  });

  it('returns full score when all signals present', () => {
    const signals: Signal[] = [
      { label: 'A', present: true, weight: 1 },
      { label: 'B', present: true, weight: 1 },
    ];
    const { percentage, estimatedScore } = computeScore(signals, 5);
    expect(percentage).toBe(100);
    expect(estimatedScore).toBe(5);
  });

  it('returns partial score', () => {
    const signals: Signal[] = [
      { label: 'A', present: true, weight: 1 },
      { label: 'B', present: false, weight: 1 },
    ];
    const { percentage, estimatedScore } = computeScore(signals, 5);
    expect(percentage).toBe(50);
    expect(estimatedScore).toBe(2.5);
  });

  it('respects weights', () => {
    const signals: Signal[] = [
      { label: 'A', present: true, weight: 2 },
      { label: 'B', present: false, weight: 1 },
    ];
    const { percentage, estimatedScore } = computeScore(signals, 5);
    expect(percentage).toBe(67); // 2/3
    expect(estimatedScore).toBe(3.4); // Math.round(67/100 * 5 * 10) / 10 = 3.4
  });

  it('handles all false signals', () => {
    const signals: Signal[] = [
      { label: 'A', present: false, weight: 1 },
      { label: 'B', present: false, weight: 1 },
    ];
    const { percentage, estimatedScore } = computeScore(signals, 5);
    expect(percentage).toBe(0);
    expect(estimatedScore).toBe(0);
  });
});
