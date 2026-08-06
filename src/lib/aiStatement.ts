export const AI_STATEMENT_PREFIX = 'Disclaimer: ';

/** The prefix rendered as bold + underlined markup. */
export const AI_STATEMENT_PREFIX_HTML = '<u><strong>Disclaimer:</strong></u> ';

export const AI_STATEMENT_BODY =
  'This proposal was written by humans, with support from large language models. The scientific content, ideas, methodologies, and claims presented in this proposal are the original work of the authors, who take full responsibility for its accuracy and integrity.';

/** Default statement: bold + underlined "Disclaimer:", plain body. */
export const DEFAULT_AI_STATEMENT = `${AI_STATEMENT_PREFIX_HTML}${AI_STATEMENT_BODY}`;

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
 * guaranteeing a bold + underlined "Disclaimer:" prefix.
 */
export function resolveAiStatementHtml(raw: string | null | undefined): string {
  const value = (raw ?? '').trim();
  if (!value) return DEFAULT_AI_STATEMENT;

  const plain = aiStatementPlainText(value);
  if (!plain.startsWith('Disclaimer:')) {
    return `${AI_STATEMENT_PREFIX_HTML}${value}`;
  }

  // Legacy plain-text values: upgrade the prefix to bold + underlined markup.
  if (!/<[a-z]/i.test(value)) {
    return `${AI_STATEMENT_PREFIX_HTML}${plain.slice('Disclaimer:'.length).trim()}`;
  }

  return value;
}
