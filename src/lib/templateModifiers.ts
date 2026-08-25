/**
 * ONE mechanism for template variation.
 *
 * A modifier declares WHEN it applies (action type, funding mode, work
 * programme, submission stage, FSTP) and WHAT it changes:
 *
 *   - STRUCTURAL, applied at SEEDING — page limit delta, template flags,
 *     funding overrides, and the extra blocks/guidance that carry the
 *     modifier's code in `condition_modifier_codes`. Those blocks live in the
 *     VERSIONED template; the modifier only selects them.
 *   - TEXTUAL, resolved at RENDER — `{{PLACEHOLDER}}` substitutions inside
 *     guidance and criteria content.
 *   - NON-TEMPLATE, declared but not implemented — effects outside Part A/B,
 *     e.g. the lump sum budget sheet.
 *
 * Modifiers are NOT versioned: they are rules about when variation applies,
 * and they read the proposal's pinned template version for the content they
 * act on.
 */

export interface ModifierConditions {
  action_type?: string;
  budget_type?: string;
  work_programme?: string;
  submission_stage?: string;
  uses_fstp?: boolean;
}

export interface ModifierEffects {
  /** Additive across all applicable modifiers. */
  page_limit_delta?: number;
  /** Shallow-merged; higher priority wins a key clash. */
  funding_overrides?: Record<string, number>;
  /** Template booleans, e.g. { includes_participant_table: false }. */
  flags?: Record<string, boolean>;
}

export interface ResolvedModifier {
  id: string;
  code: string;
  name: string;
  description: string | null;
  conditions: ModifierConditions;
  effects: ModifierEffects;
  text_substitutions: Record<string, string>;
  non_template_effects: Record<string, unknown>;
  priority: number;
  is_active: boolean;
  is_admin_editable: boolean;
}

export interface ProposalAttributes {
  actionType?: string | null;
  budgetType?: string | null;
  workProgramme?: string | null;
  submissionStage?: string | null;
  usesFstp?: boolean | null;
}

/** Every condition key present must match; absent keys are wildcards. */
export function modifierApplies(cond: ModifierConditions, attrs: ProposalAttributes): boolean {
  if (cond.action_type && cond.action_type !== attrs.actionType) return false;
  if (cond.budget_type && cond.budget_type !== attrs.budgetType) return false;
  if (cond.work_programme && cond.work_programme !== attrs.workProgramme) return false;
  if (cond.submission_stage && cond.submission_stage !== attrs.submissionStage) return false;
  if (cond.uses_fstp !== undefined && cond.uses_fstp !== !!attrs.usesFstp) return false;
  return true;
}

/**
 * Applicable modifiers in deterministic order: ascending priority, then code.
 * Stacking is therefore reproducible — the LAST modifier wins a scalar clash.
 */
export function applicableModifiers(
  all: ResolvedModifier[],
  attrs: ProposalAttributes,
): ResolvedModifier[] {
  return all
    .filter((m) => m.is_active && modifierApplies(m.conditions ?? {}, attrs))
    .sort((a, b) => (a.priority - b.priority) || a.code.localeCompare(b.code));
}

export interface MergedEffects {
  codes: string[];
  /** Additive. */
  pageLimitDelta: number;
  /** Shallow merge, highest priority last. */
  fundingOverrides: Record<string, number>;
  flags: Record<string, boolean>;
  substitutions: Record<string, string>;
  nonTemplate: Record<string, unknown>;
}

export function mergeModifierEffects(mods: ResolvedModifier[]): MergedEffects {
  const out: MergedEffects = {
    codes: [], pageLimitDelta: 0, fundingOverrides: {}, flags: {},
    substitutions: {}, nonTemplate: {},
  };
  for (const m of mods) {
    out.codes.push(m.code);
    const e = (m.effects ?? {}) as ModifierEffects;
    out.pageLimitDelta += Number(e.page_limit_delta ?? 0) || 0;
    Object.assign(out.fundingOverrides, e.funding_overrides ?? {});
    Object.assign(out.flags, e.flags ?? {});
    Object.assign(out.substitutions, m.text_substitutions ?? {});
    Object.assign(out.nonTemplate, m.non_template_effects ?? {});
  }
  return out;
}

/** Replaces `{{NAME}}` placeholders; unknown placeholders are left untouched. */
export function applySubstitutions(html: string, subs: Record<string, string>): string {
  if (!html || !subs || Object.keys(subs).length === 0) return html;
  return html.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(subs, name) ? subs[name] : whole,
  );
}

/** Modifier-gated content: null/empty gate = always included. */
export function passesModifierGate(gate: string[] | null | undefined, codes: string[]): boolean {
  if (!gate || gate.length === 0) return true;
  return gate.some((c) => codes.includes(c));
}

export function normaliseModifierRow(row: any): ResolvedModifier {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description ?? null,
    conditions: (row.conditions ?? {}) as ModifierConditions,
    effects: (row.effects ?? {}) as ModifierEffects,
    text_substitutions: (row.text_substitutions ?? {}) as Record<string, string>,
    non_template_effects: (row.non_template_effects ?? {}) as Record<string, unknown>,
    priority: row.priority ?? 0,
    is_active: !!row.is_active,
    is_admin_editable: !!row.is_admin_editable,
  };
}
