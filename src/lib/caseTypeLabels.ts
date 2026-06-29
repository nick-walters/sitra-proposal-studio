/**
 * caseTypeLabels — single source of truth for case-type codes,
 * singular/plural labels, and badge prefixes.
 *
 * Stage 1 of the multi-case-type refactor:
 *   - Consolidates the 8+ duplicated maps that previously lived in
 *     CaseManagementCard, CaseDraftEditor, useProposalSections,
 *     ProposalEditor, B11ParticipantsTable, printRenderer,
 *     InsertCaseReferenceDialog, syncCrossReferences, CasesTableNodeView,
 *     CaseReferenceNode, WPDraftEditor.
 *   - Adds the new "Lighthouse" (LH) type.
 *   - Provides label/prefix helpers and a small pluralise() helper.
 *
 * No behaviour change beyond LH becoming available.
 */

export type CaseTypeCode =
  | 'case_study'
  | 'use_case'
  | 'living_lab'
  | 'lighthouse'
  | 'pilot'
  | 'demonstration'
  | 'challenge'
  | 'other';

export interface CaseTypeDef {
  code: CaseTypeCode;
  singular: string;
  plural: string;
  prefix: string;
}

/**
 * Ordered list — drives every type-selector UI on the platform.
 * 'other' is intentionally last; its label/prefix are filled in
 * per-case from `custom_type_name`.
 */
export const CASE_TYPE_DEFS: ReadonlyArray<CaseTypeDef> = [
  { code: 'case_study',    singular: 'Case Study',    plural: 'Case Studies',    prefix: 'CS' },
  { code: 'use_case',      singular: 'Use Case',      plural: 'Use Cases',       prefix: 'UC' },
  { code: 'living_lab',    singular: 'Living Lab',    plural: 'Living Labs',     prefix: 'LL' },
  { code: 'lighthouse',    singular: 'Lighthouse',    plural: 'Lighthouses',     prefix: 'LH' },
  { code: 'pilot',         singular: 'Pilot',         plural: 'Pilots',          prefix: 'P'  },
  { code: 'demonstration', singular: 'Demonstration', plural: 'Demonstrations',  prefix: 'D'  },
  { code: 'challenge',     singular: 'Challenge',     plural: 'Challenges',      prefix: 'CH' },
  { code: 'other',         singular: 'Other',         plural: 'Other',           prefix: ''   },
];

const DEF_BY_CODE: Record<string, CaseTypeDef> = Object.fromEntries(
  CASE_TYPE_DEFS.map((d) => [d.code, d]),
);

/**
 * Very small English pluraliser — covers the cases we need for
 * user-typed custom type names in 'other'. Intentionally simple.
 *
 * Rules (in order):
 *   - explicit overrides (e.g. "Case Study" → "Case Studies")
 *   - ends in s/x/z/ch/sh → add "es"
 *   - ends in consonant + "y" → replace "y" with "ies"
 *   - otherwise → add "s"
 */
export function pluralise(word: string): string {
  const w = (word ?? '').trim();
  if (!w) return '';

  // Hard-coded overrides for multi-word labels we already use.
  const overrides: Record<string, string> = {
    'case study': 'Case Studies',
  };
  const key = w.toLowerCase();
  if (overrides[key]) return overrides[key];

  if (/(s|x|z|ch|sh)$/i.test(w)) return `${w}es`;
  if (/[^aeiou]y$/i.test(w)) return `${w.slice(0, -1)}ies`;
  return `${w}s`;
}

/**
 * Return the singular or plural label for a case type.
 * For 'other', the user-supplied customName is used (and pluralised
 * when plural: true). Falls back to a generic 'Case' if neither
 * code nor customName resolves.
 */
export function getCaseTypeLabel(
  code: string | null | undefined,
  customName?: string | null,
  opts?: { plural?: boolean },
): string {
  const plural = !!opts?.plural;
  if (code === 'other') {
    const name = (customName ?? '').trim();
    if (!name) return plural ? 'Cases' : 'Case';
    return plural ? pluralise(name) : name;
  }
  const def = code ? DEF_BY_CODE[code] : undefined;
  if (!def) return plural ? 'Cases' : 'Case';
  return plural ? def.plural : def.singular;
}

/**
 * Return the badge prefix (e.g. "CS", "UC", "LH") for a case type.
 * For 'other', returns the uppercased customName (or '' if missing).
 */
export function getCaseTypePrefix(
  code: string | null | undefined,
  customName?: string | null,
): string {
  if (code === 'other') {
    const name = (customName ?? '').trim();
    return name ? name.toUpperCase() : '';
  }
  const def = code ? DEF_BY_CODE[code] : undefined;
  return def?.prefix ?? '';
}

/**
 * Build a case label from its parts.
 *
 *  includeAbbreviation && prefix && includeNumber  → "CS3 Short name"  (chip-only: "CS3")
 *  includeAbbreviation && prefix && !includeNumber → "CS Short name"   (chip-only: "CS")
 *  !includeAbbreviation && includeNumber           → "3 Short name"    (chip-only: "3")
 *  neither                                          → "Short name"     (chip-only: "Short name")
 *
 * `withShortName=false` returns the prefix portion only (for cross-ref chips,
 * nav dots, badge labels that do not include the case's short name).
 */
export function buildCaseLabel(opts: {
  prefix: string;
  number: number | null | undefined;
  shortName: string | null | undefined;
  includeNumber: boolean;
  includeAbbreviation: boolean;
  withShortName?: boolean;
}): string {
  const { prefix, number, shortName, includeNumber, includeAbbreviation } = opts;
  const withShortName = opts.withShortName !== false;
  const ab = includeAbbreviation && prefix ? prefix : '';
  const nm = includeNumber && number !== null && number !== undefined ? String(number) : '';
  const prefixPart = `${ab}${nm}`;
  const sn = (shortName ?? '').trim();
  if (!withShortName) {
    return prefixPart || sn || (number !== null && number !== undefined ? String(number) : '');
  }
  if (prefixPart && sn) return `${prefixPart} ${sn}`;
  return prefixPart || sn || (number !== null && number !== undefined ? String(number) : '');
}

