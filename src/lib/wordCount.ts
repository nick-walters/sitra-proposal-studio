/**
 * The single word-count implementation.
 *
 * Four copies existed (WP progress, page estimate, workload dashboard, version
 * history), each with a different strip-and-split order, so the same text
 * reported different totals depending on which surface you were looking at.
 * Entities are decoded to spaces BEFORE tags are stripped, so `a&nbsp;b` is
 * two words rather than one.
 */
export function countWords(html: string | null | undefined): number {
  if (!html) return 0;
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return 0;
  return text.split(' ').filter(Boolean).length;
}

/**
 * Words per page, recalibrated from real compiled output (SUSIE-Q: ~20,155
 * words over 32 compiled pages) rather than the earlier generic 500, which
 * over-reported length by roughly a quarter. Only used before a compile.
 */
export const WORDS_PER_PAGE = 640;

/** Title page, participant table and other page-one furniture. */
export const FRONT_MATTER_PAGES = 1;

/** The platform-wide page estimate: content pages plus front matter. */
export function estimatePages(words: number): number {
  return Math.ceil(words / WORDS_PER_PAGE) + FRONT_MATTER_PAGES;
}
