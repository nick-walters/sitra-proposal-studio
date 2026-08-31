import { describe, it, expect } from 'vitest';
import { countWords, estimatePages, WORDS_PER_PAGE, FRONT_MATTER_PAGES } from '@/lib/wordCount';

/**
 * Replaces proposalScoring.test.ts, which tested a copy of a scoring routine
 * that no longer exists. countWords/estimatePages are the real shared
 * implementation behind page estimates, WP progress and the evaluation payload.
 */

describe('countWords', () => {
  it('returns 0 for empty, null and whitespace input', () => {
    expect(countWords('')).toBe(0);
    expect(countWords(null)).toBe(0);
    expect(countWords(undefined)).toBe(0);
    expect(countWords('   ')).toBe(0);
  });

  it('counts plain words', () => {
    expect(countWords('hello world foo')).toBe(3);
  });

  it('strips tags without joining adjacent words', () => {
    expect(countWords('<p>hello</p><p>world</p>')).toBe(2);
    expect(countWords('<strong>bold</strong> text')).toBe(2);
  });

  it('treats &nbsp; as a separator', () => {
    expect(countWords('a&nbsp;b')).toBe(2);
  });

  it('collapses repeated whitespace and newlines', () => {
    expect(countWords('one\n\n  two\t three')).toBe(3);
  });

  it('ignores markup-only content', () => {
    expect(countWords('<p></p><br/>')).toBe(0);
  });
});

describe('estimatePages', () => {
  it('adds front matter to the content pages', () => {
    expect(estimatePages(0)).toBe(FRONT_MATTER_PAGES);
    expect(estimatePages(1)).toBe(1 + FRONT_MATTER_PAGES);
    expect(estimatePages(WORDS_PER_PAGE)).toBe(1 + FRONT_MATTER_PAGES);
    expect(estimatePages(WORDS_PER_PAGE + 1)).toBe(2 + FRONT_MATTER_PAGES);
  });

  it('matches the live Susie-Q figure of 42 pages for 20,155 words', () => {
    expect(estimatePages(20_155)).toBe(42);
  });
});
