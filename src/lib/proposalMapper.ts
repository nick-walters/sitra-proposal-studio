/**
 * proposalMapper — SINGLE source of truth for camelCase ↔ snake_case
 * field mappings between ProposalData and the proposals DB row.
 *
 * Every column in the `proposals` table is declared here exactly once.
 * The `snakeCase` field is typed as `keyof ProposalRow`, so TypeScript will
 * error if a column is renamed/removed when Supabase regenerates types.
 *
 * Each entry declares:
 *  - snakeCase: the database column name (compile-time checked)
 *  - fromDb:    transform when reading from DB
 *  - toDb:      transform when writing to DB, or `null` for read-only fields
 */

import type { Database } from '@/integrations/supabase/types';
import type { BudgetType } from '@/types/proposal';

type ProposalRow = Database['public']['Tables']['proposals']['Row'];

type ProposalType = 'RIA' | 'IA' | 'CSA';
type ProposalStatus = 'draft' | 'submitted' | 'funded' | 'not_funded';

// ───── camelCase ↔ snake_case helpers (still exported for ethics mapper) ─────
export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// ───── Transforms ─────
type Transform = (v: any) => any;

const identity: Transform = (v) => v;
const toDate: Transform = (v) => (v ? new Date(v) : undefined);
const toIso: Transform = (v) => v?.toISOString?.() ?? v ?? null;
// Preserve 0, '' and false; only collapse null/undefined → undefined
const orUndefined: Transform = (v) => (v === null || v === undefined ? undefined : v);
const orFalse: Transform = (v) => v || false;
const orEmptyArray: Transform = (v) => v || [];
const defaultTrue: Transform = (v) => v !== false;
const castType: Transform = (v) => v as ProposalType;
const castBudgetType: Transform = (v) => v as BudgetType;
const castStatus: Transform = (v) => v as ProposalStatus;

interface FieldMapping {
  snakeCase: keyof ProposalRow;
  fromDb: Transform;
  /** null = read-only (never written back to DB) */
  toDb: Transform | null;
}

/**
 * Single source of truth — every column of the proposals table.
 */
const PROPOSAL_FIELD_MAP: Record<string, FieldMapping> = {
  // ── Always-present / identity-cast ──
  id:                           { snakeCase: 'id',                              fromDb: identity,       toDb: null },
  acronym:                      { snakeCase: 'acronym',                         fromDb: identity,       toDb: identity },
  title:                        { snakeCase: 'title',                           fromDb: identity,       toDb: identity },
  type:                         { snakeCase: 'type',                            fromDb: castType,       toDb: identity },
  budgetType:                   { snakeCase: 'budget_type',                     fromDb: castBudgetType, toDb: identity },
  status:                       { snakeCase: 'status',                          fromDb: castStatus,     toDb: identity },
  createdAt:                    { snakeCase: 'created_at',                      fromDb: toDate,         toDb: null },
  updatedAt:                    { snakeCase: 'updated_at',                      fromDb: toDate,         toDb: null },
  createdBy:                    { snakeCase: 'created_by',                      fromDb: orUndefined,    toDb: null },

  // ── Submission & stage ──
  submissionStage:              { snakeCase: 'submission_stage',                fromDb: orUndefined,    toDb: identity },
  isTwoStageSecondStage:        { snakeCase: 'is_two_stage_second_stage',       fromDb: orFalse,        toDb: identity },
  submittedAt:                  { snakeCase: 'submitted_at',                    fromDb: toDate,         toDb: toIso },

  // ── Budget ──
  totalBudget:                  { snakeCase: 'total_budget',                    fromDb: orUndefined,    toDb: identity },
  totalBudgetText:              { snakeCase: 'total_budget_text',               fromDb: orUndefined,    toDb: identity },
  budgetTemplateId:             { snakeCase: 'budget_template_id',              fromDb: orUndefined,    toDb: identity },

  // ── Dates & duration ──
  deadline:                     { snakeCase: 'deadline',                        fromDb: toDate,         toDb: toIso },
  openingDate:                  { snakeCase: 'opening_date',                    fromDb: toDate,         toDb: toIso },
  decisionDate:                 { snakeCase: 'decision_date',                   fromDb: toDate,         toDb: toIso },
  decisionDateIsEstimated:      { snakeCase: 'decision_date_is_estimated',      fromDb: orFalse,        toDb: identity },
  duration:                     { snakeCase: 'duration',                        fromDb: orUndefined,    toDb: identity },

  // ── Description ──
  description:                  { snakeCase: 'description',                     fromDb: orUndefined,    toDb: identity },

  // ── Topic ──
  topicId:                      { snakeCase: 'topic_id',                        fromDb: orUndefined,    toDb: identity },
  topicUrl:                     { snakeCase: 'topic_url',                       fromDb: orUndefined,    toDb: identity },
  topicTitle:                   { snakeCase: 'topic_title',                     fromDb: orUndefined,    toDb: identity },
  topicDescription:             { snakeCase: 'topic_description',               fromDb: orUndefined,    toDb: identity },
  topicExpectedOutcome:         { snakeCase: 'topic_expected_outcome',          fromDb: orUndefined,    toDb: identity },
  topicScope:                   { snakeCase: 'topic_scope',                     fromDb: orUndefined,    toDb: identity },
  topicDestinationDescription:  { snakeCase: 'topic_destination_description',   fromDb: orUndefined,    toDb: identity },
  topicFootnotes:               { snakeCase: 'topic_footnotes',                 fromDb: orEmptyArray,   toDb: identity },
  outcomeFootnotes:             { snakeCase: 'outcome_footnotes',               fromDb: orEmptyArray,   toDb: identity },
  scopeFootnotes:               { snakeCase: 'scope_footnotes',                 fromDb: orEmptyArray,   toDb: identity },
  destinationFootnotes:         { snakeCase: 'destination_footnotes',           fromDb: orEmptyArray,   toDb: identity },
  topicContentImportedAt:       { snakeCase: 'topic_content_imported_at',       fromDb: toDate,         toDb: toIso },

  // ── Programme ──
  workProgramme:                { snakeCase: 'work_programme',                  fromDb: orUndefined,    toDb: identity },
  destination:                  { snakeCase: 'destination',                     fromDb: orUndefined,    toDb: identity },

  // ── Branding ──
  logoUrl:                      { snakeCase: 'logo_url',                        fromDb: orUndefined,    toDb: identity },
  bannerTitleOverride:          { snakeCase: 'banner_title_override',           fromDb: orUndefined,    toDb: identity },
  bannerTopicLineOverride:      { snakeCase: 'banner_topic_line_override',      fromDb: orUndefined,    toDb: identity },

  // ── Template ──
  templateTypeId:               { snakeCase: 'template_type_id',                fromDb: orUndefined,    toDb: identity },

  // ── FSTP ──
  expectedProjects:             { snakeCase: 'expected_projects',               fromDb: orUndefined,    toDb: identity },
  usesFstp:                     { snakeCase: 'uses_fstp',                       fromDb: orFalse,        toDb: identity },
  fstpType:                     { snakeCase: 'fstp_type',                       fromDb: (v) => v || 'grant', toDb: identity },
  indicativeBudgetPerProject:   { snakeCase: 'indicative_budget_per_project',   fromDb: orUndefined,    toDb: identity },
  fstpBudget:                   { snakeCase: 'fstp_budget',                     fromDb: orUndefined,    toDb: identity },
  fstpBudgetPerThirdParty:      { snakeCase: 'fstp_budget_per_third_party',     fromDb: orUndefined,    toDb: identity },

  // ── Cases ──
  casesEnabled:                 { snakeCase: 'cases_enabled',                   fromDb: orFalse,        toDb: identity },
  casesType:                    { snakeCase: 'cases_type',                      fromDb: orUndefined,    toDb: identity },
  caseIncludeAbbreviation:      { snakeCase: 'case_include_abbreviation',      fromDb: orFalse,        toDb: identity },
  caseIncludeNumber:            { snakeCase: 'case_include_number',             fromDb: orFalse,        toDb: identity },

  // ── Drafts visibility ──
  wpDraftsVisible:              { snakeCase: 'wp_drafts_visible',               fromDb: defaultTrue,    toDb: identity },
  caseDraftsVisible:            { snakeCase: 'case_drafts_visible',             fromDb: defaultTrue,    toDb: identity },
  useWpThemes:                  { snakeCase: 'use_wp_themes',                   fromDb: orFalse,        toDb: identity },

  // ── Misc ──
  reportingPeriods:             { snakeCase: 'reporting_periods',               fromDb: orUndefined,    toDb: identity },
  acronymSegments:              { snakeCase: 'acronym_segments',                fromDb: orUndefined,    toDb: identity },
  evaluationCriteriaNotes:      { snakeCase: 'evaluation_criteria_notes',       fromDb: orUndefined,    toDb: identity },

  // ── OCD ──
  ocdTemplatePath:              { snakeCase: 'ocd_template_path',               fromDb: orUndefined,    toDb: identity },
  requiresOcd:                  { snakeCase: 'requires_ocd',                    fromDb: orFalse,        toDb: identity },
};

/**
 * Convert a raw DB row to a ProposalData-shaped object.
 * All fields are handled — no inline overrides needed at the call site.
 */
export function proposalFromDb(row: ProposalRow | Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [camelKey, mapping] of Object.entries(PROPOSAL_FIELD_MAP)) {
    const dbValue = (row as Record<string, any>)[mapping.snakeCase as string];
    result[camelKey] = mapping.fromDb(dbValue);
  }
  return result;
}

/**
 * Convert a partial ProposalData update to DB column format.
 * Only includes keys present in `updates` that have a non-null toDb transform.
 */
export function proposalToDb(updates: Record<string, any>): Record<string, any> {
  const dbUpdates: Record<string, any> = {};
  for (const [camelKey, mapping] of Object.entries(PROPOSAL_FIELD_MAP)) {
    if (!(camelKey in updates)) continue;
    if (mapping.toDb === null) continue;
    dbUpdates[mapping.snakeCase as string] = mapping.toDb(updates[camelKey]);
  }
  return dbUpdates;
}
