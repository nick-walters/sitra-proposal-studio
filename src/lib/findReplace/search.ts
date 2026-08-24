/**
 * Match finding and replacement over a page's stored fields.
 *
 * Everything here is pure: given the fields a surface enumerated, it produces
 * matches and new field values. Writing is the caller's job, through each
 * field's own conflict-checked save path.
 */

import {
  applyHtmlEdits,
  escapeForHtml,
  extractHtmlText,
  extractPlainText,
  mapRangeToHtmlEdits,
  type ExtractedText,
} from './htmlText';
import type { FieldMatch, SearchOptions, SearchableField } from './types';

export interface FieldResult {
  field: SearchableField;
  extracted: ExtractedText;
  matches: FieldMatch[];
}

export interface SearchResult {
  results: FieldResult[];
  /** Flat, in field order then reading order — what the navigator steps over. */
  flat: { field: SearchableField; match: FieldMatch }[];
  totalMatches: number;
  fieldsWithMatches: number;
  hiddenMatches: number;
  hiddenFields: number;
  regexError: string | null;
}

export function extractField(field: SearchableField): ExtractedText {
  return field.format === 'html'
    ? extractHtmlText(field.value ?? '')
    : extractPlainText(field.value ?? '');
}

export function buildPattern(query: string, options: SearchOptions): RegExp {
  const flags = options.caseSensitive ? 'g' : 'gi';
  if (options.useRegex) return new RegExp(query, flags);
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(options.wholeWord ? `\\b${escaped}\\b` : escaped, flags);
}

function snippetAround(text: string, start: number, end: number): string {
  const before = text.slice(Math.max(0, start - 32), start).replace(/\s+/g, ' ');
  const hit = text.slice(start, end);
  const after = text.slice(end, Math.min(text.length, end + 32)).replace(/\s+/g, ' ');
  return `${start > 32 ? '…' : ''}${before}«${hit}»${after}${end + 32 < text.length ? '…' : ''}`;
}

export function searchFields(
  fields: SearchableField[],
  query: string,
  options: SearchOptions,
): SearchResult {
  const empty: SearchResult = {
    results: [],
    flat: [],
    totalMatches: 0,
    fieldsWithMatches: 0,
    hiddenMatches: 0,
    hiddenFields: 0,
    regexError: null,
  };
  if (!query) return empty;

  let pattern: RegExp;
  try {
    pattern = buildPattern(query, options);
  } catch (e) {
    return { ...empty, regexError: (e as Error).message };
  }

  const results: FieldResult[] = [];
  const flat: SearchResult['flat'] = [];
  let hiddenMatches = 0;
  let hiddenFields = 0;

  for (const field of fields) {
    if (!field.value) continue;
    const extracted = extractField(field);
    if (!extracted.text) continue;

    const matches: FieldMatch[] = [];
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(extracted.text)) !== null) {
      if (m[0] === '') {
        pattern.lastIndex += 1;
        continue;
      }
      matches.push({
        fieldId: field.id,
        indexInField: matches.length,
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
        snippet: snippetAround(extracted.text, m.index, m.index + m[0].length),
      });
    }
    if (matches.length === 0) continue;

    results.push({ field, extracted, matches });
    for (const match of matches) flat.push({ field, match });
    if (field.hidden) {
      hiddenMatches += matches.length;
      hiddenFields += 1;
    }
  }

  return {
    results,
    flat,
    totalMatches: flat.length,
    fieldsWithMatches: results.length,
    hiddenMatches,
    hiddenFields,
    regexError: null,
  };
}

/** Expands `$1`-style backreferences when the search was a regular expression. */
function resolveReplacement(
  matchText: string,
  query: string,
  replacement: string,
  options: SearchOptions,
): string {
  if (!options.useRegex) return replacement;
  try {
    return matchText.replace(new RegExp(query, options.caseSensitive ? '' : 'i'), replacement);
  } catch {
    return replacement;
  }
}

/**
 * New value for one field with the given matches replaced. Only text-run
 * ranges are rewritten, so chips, citations, figures and table structure come
 * through untouched.
 */
export function replaceInField(
  result: FieldResult,
  matches: FieldMatch[],
  query: string,
  replacement: string,
  options: SearchOptions,
): string {
  const edits = matches.flatMap((match) => {
    const value = resolveReplacement(match.text, query, replacement, options);
    const insert = result.field.format === 'html' ? escapeForHtml(value) : value;
    return mapRangeToHtmlEdits(result.extracted, match.start, match.end, insert);
  });
  return applyHtmlEdits(result.field.value ?? '', edits);
}
