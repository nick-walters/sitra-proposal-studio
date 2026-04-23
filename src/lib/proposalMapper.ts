/**
 * proposalMapper — single source of truth for camelCase ↔ snake_case
 * field mappings between ProposalData and the database row.
 *
 * Each entry specifies:
 *  - dbKey: the snake_case column name
 *  - fromDb: optional transform when reading from DB (default: identity)
 *  - toDb: optional transform when writing to DB (default: identity)
 *
 * Fields not listed here (id, created_at, updated_at, type, budget_type, status, acronym, title)
 * are handled inline because they need special casting or are always present.
 */

// Helper to convert camelCase to snake_case
export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

// Helper to convert snake_case to camelCase
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

type Transform = (v: any) => any;

interface FieldMapping {
  dbKey: string;
  fromDb?: Transform;
  toDb?: Transform;
}

const toDate: Transform = (v) => v ? new Date(v) : undefined;
const toIso: Transform = (v) => v?.toISOString?.() ?? v ?? null;
const orUndefined: Transform = (v) => v || undefined;
const orFalse: Transform = (v) => v || false;
const orEmptyArray: Transform = (v) => v || [];
const defaultTrue: Transform = (v) => v !== false;

/**
 * Map of camelCase ProposalData keys → DB column info.
 * Keys not in this map are handled specially in fromDb/toDb.
 */
const PROPOSAL_FIELD_MAP: Record<string, FieldMapping> = {
  submissionStage:              { dbKey: 'submission_stage', fromDb: orUndefined },
  isTwoStageSecondStage:        { dbKey: 'is_two_stage_second_stage', fromDb: orFalse },
  totalBudget:                  { dbKey: 'total_budget', fromDb: orUndefined },
  totalBudgetText:              { dbKey: 'total_budget_text', fromDb: orUndefined },
  deadline:                     { dbKey: 'deadline', fromDb: toDate, toDb: toIso },
  openingDate:                  { dbKey: 'opening_date', fromDb: toDate, toDb: toIso },
  description:                  { dbKey: 'description', fromDb: orUndefined },
  duration:                     { dbKey: 'duration', fromDb: orUndefined },
  topicId:                      { dbKey: 'topic_id', fromDb: orUndefined },
  topicUrl:                     { dbKey: 'topic_url', fromDb: orUndefined },
  topicTitle:                   { dbKey: 'topic_title', fromDb: orUndefined },
  topicDescription:             { dbKey: 'topic_description', fromDb: orUndefined },
  topicExpectedOutcome:         { dbKey: 'topic_expected_outcome', fromDb: orUndefined },
  topicScope:                   { dbKey: 'topic_scope', fromDb: orUndefined },
  topicDestinationDescription:  { dbKey: 'topic_destination_description', fromDb: orUndefined },
  topicFootnotes:               { dbKey: 'topic_footnotes', fromDb: orEmptyArray },
  outcomeFootnotes:             { dbKey: 'outcome_footnotes', fromDb: orEmptyArray },
  scopeFootnotes:               { dbKey: 'scope_footnotes', fromDb: orEmptyArray },
  destinationFootnotes:         { dbKey: 'destination_footnotes', fromDb: orEmptyArray },
  topicContentImportedAt:       { dbKey: 'topic_content_imported_at', fromDb: toDate },
  workProgramme:                { dbKey: 'work_programme', fromDb: orUndefined },
  destination:                  { dbKey: 'destination', fromDb: orUndefined },
  logoUrl:                      { dbKey: 'logo_url', fromDb: orUndefined },
  submittedAt:                  { dbKey: 'submitted_at', fromDb: toDate },
  decisionDate:                 { dbKey: 'decision_date', fromDb: toDate, toDb: toIso },
  decisionDateIsEstimated:      { dbKey: 'decision_date_is_estimated', fromDb: orFalse },
  templateTypeId:               { dbKey: 'template_type_id', fromDb: orUndefined },
  expectedProjects:             { dbKey: 'expected_projects', fromDb: orUndefined },
  usesFstp:                     { dbKey: 'uses_fstp', fromDb: orFalse },
  fstpType:                     { dbKey: 'fstp_type', fromDb: (v) => v || 'grant' },
  indicativeBudgetPerProject:   { dbKey: 'indicative_budget_per_project', fromDb: orUndefined },
  fstpBudget:                   { dbKey: 'fstp_budget', fromDb: orUndefined },
  fstpBudgetPerThirdParty:      { dbKey: 'fstp_budget_per_third_party', fromDb: orUndefined },
  casesEnabled:                 { dbKey: 'cases_enabled', fromDb: orFalse },
  casesType:                    { dbKey: 'cases_type', fromDb: orUndefined },
  wpDraftsVisible:              { dbKey: 'wp_drafts_visible', fromDb: defaultTrue },
  caseDraftsVisible:            { dbKey: 'case_drafts_visible', fromDb: defaultTrue },
  reportingPeriods:             { dbKey: 'reporting_periods', fromDb: orUndefined },
  acronymSegments:              { dbKey: 'acronym_segments', fromDb: orUndefined },
  evaluationCriteriaNotes:      { dbKey: 'evaluation_criteria_notes', fromDb: orUndefined },
};

/**
 * Convert a raw DB row to a ProposalData-shaped object.
 * The caller must still set `id`, `acronym`, `title`, `type`, `budgetType`, `status`,
 * `createdAt`, and `updatedAt` because those require type assertions.
 */
export function proposalFromDb(data: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [camelKey, mapping] of Object.entries(PROPOSAL_FIELD_MAP)) {
    const raw = data[mapping.dbKey];
    result[camelKey] = mapping.fromDb ? mapping.fromDb(raw) : raw;
  }
  return result;
}

/**
 * Convert a partial ProposalData update to DB column format.
 * Only includes keys that are present in `updates`.
 */
export function proposalToDb(updates: Record<string, any>): Record<string, any> {
  const dbUpdates: Record<string, any> = {};
  for (const [camelKey, value] of Object.entries(updates)) {
    const mapping = PROPOSAL_FIELD_MAP[camelKey];
    if (!mapping) continue; // skip unmapped keys (id, type, etc.)
    if (value === undefined && !(camelKey in updates)) continue;
    dbUpdates[mapping.dbKey] = mapping.toDb ? mapping.toDb(value) : value;
  }
  return dbUpdates;
}
