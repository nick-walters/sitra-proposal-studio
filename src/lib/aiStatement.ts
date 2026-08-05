export const AI_STATEMENT_PREFIX = 'Disclaimer: ';

export const DEFAULT_AI_STATEMENT =
  `${AI_STATEMENT_PREFIX}This proposal was written by humans, with support from large language models. The scientific content, ideas, methodologies, and claims presented in this proposal are the original work of the authors, who take full responsibility for its accuracy and integrity.`;

/** Plain-text view of a (possibly HTML) statement value. */
export function aiStatementPlainText(raw: string | null | undefined): string {
  return (raw ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
}

/**
 * Resolve the stored statement (plain text or HTML) into display HTML,
 * falling back to the default text and guaranteeing the "Disclaimer: " prefix.
 */
export function resolveAiStatementHtml(raw: string | null | undefined): string {
  const value = (raw ?? '').trim() || DEFAULT_AI_STATEMENT;
  const plain = aiStatementPlainText(value);
  if (plain.startsWith(AI_STATEMENT_PREFIX.trim())) return value;
  return `${AI_STATEMENT_PREFIX}${value}`;
}
