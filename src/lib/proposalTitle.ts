/**
 * The A1 project title is the single source of truth for the B1.1 banner, and
 * it may contain manual newlines that decide where the banner breaks its lines.
 *
 * Everywhere OTHER than the banner — lists, cards, dialogs, tab titles, export
 * file/document titles — those newlines must be flattened to single spaces, or
 * the title renders broken across a row it was never meant to occupy.
 */

/** Collapse every run of whitespace (newlines included) into a single space. */
export function flattenProposalTitle(title?: string | null): string {
  return (title ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * The banner form: the title split into the lines the author typed in A1.
 * Blank lines are dropped so a stray Return cannot open a gap in the banner.
 */
export function proposalTitleLines(title?: string | null): string[] {
  return (title ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
