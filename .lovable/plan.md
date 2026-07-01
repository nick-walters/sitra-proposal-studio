## Goal

Fix the €0 requested-EU-contribution bug in **both** the eligibility check and the rendered A3 payload by routing both paths through one shared, pure helper that mirrors today's client-side `computeRow` math.

## 1) Extract pure helper — `src/lib/budgetCompute.ts` (new)

A single pure function with no React/Supabase deps:

```text
computeBudgetRow(input) → {
  personnel, directCosts, indirect, totalEligible,
  fundingRate, maxEuContribution, requestedEuContribution
}
```

Inputs (plain object): all numeric cost columns from `budget_rows` (personnel_costs, subcontracting_costs, purchase_travel, purchase_equipment, purchase_other_goods, financial_support_third_parties, internally_invoiced, procurement), `pm_rate`, `indirect_costs_override`, `funding_rate_override`, `requested_eu_contribution` (override), `has_in_kind` + all `requested_*` columns, plus `totalPersonMonths`, `proposalType`, `organisationCategory`.

The body is a verbatim port of the math at `useBudgetRows.ts` lines ~121–169 (personnel via pm_rate × PM, direct sum, 25% indirect base excluding sub+FSTP, RIA=100/IA-LE=70 funding rate, in-kind branch summing `requested_*` capped at `maxEu`).

## 2) Refactor `src/hooks/useBudgetRows.ts` — behaviour-preserving

Replace the local `computeRow` body with a call to `computeBudgetRow`, mapping the existing `BudgetRowData` fields to the helper's input shape. Public types (`ComputedBudgetRow`) and outputs unchanged. **A3 portal figures must be byte-identical after.**

## 3) Fix the rendered A3 payload — `src/lib/printRenderer.tsx` `buildA3BudgetHtml`

- Replace the current `.select(...)` with the full set of columns the helper needs (all cost categories incl. `procurement`, `financial_support_third_parties`, `internally_invoiced`; `pm_rate`; `indirect_costs_override` (NOT the non-existent `indirect_costs`); `funding_rate_override`; `requested_eu_contribution`; `has_in_kind`; all `requested_*`).
- Fetch per-participant total person-months from `wp_draft_effort` joined through `wp_drafts.proposal_id` (same pattern as `useBudgetRows.fetchRows`).
- Fetch the proposal `type` and each participant's `organisation_category` (participants already pass in; add `organisation_category` if missing).
- For each row, call `computeBudgetRow` and render: Personnel (computed), Subcontracting, Equipment, Other goods, Travel, **Indirect (computed)**, **Requested EU (computed)** — plus a non-zero totals row.

## 4) Client passes computed budget — `src/components/PanelEvaluator.tsx`

Before the `propose-evaluation-panel` invoke at line 383:
- Fetch the same data the renderer fetches (budget_rows full, wp_draft_effort PM totals, participants' categories, proposal type).
- Run `computeBudgetRow` per row.
- Build `computedBudget = { totalRequestedEu, totalDirectCosts, totalIndirect, totalEligible, perParticipant: [{ participantId, participantNumber, shortName, requestedEu, totalEligible, fundingRate }] }`.
- Pass it in the invoke body alongside the existing fields.

## 5) Edge function consumes passed-in budget — `supabase/functions/propose-evaluation-panel/index.ts`

- Add `computedBudget` to the request schema (optional, validated).
- Remove the `requested_eu_contribution` / cost columns from the `budget_rows` select (keep the query only if needed for participant-count fallback; otherwise drop the budget fetch entirely).
- Replace the `totalRequestedEu` / `totalDirectCosts` reducers with values from `computedBudget`. `budgetPopulated` becomes `computedBudget.totalRequestedEu > 0 || computedBudget.totalDirectCosts > 0`.
- `budgetSummary` string is rebuilt from the passed-in totals (same wording).
- No math ported to Deno.

## Acceptance verification (ADDGenAI `dd66432e…`)

1. Open A3 portal — figures unchanged after the refactor.
2. Trigger an export/render — A3 table shows real per-participant Requested EU and a **non-zero** total.
3. Run an evaluation start — eligibility no longer says "€0 across all participants"; `evaluation_cost_log` / `proposal_analyses` row reflects the real total.
4. `tsgo` clean.

## Files touched

- `src/lib/budgetCompute.ts` (new)
- `src/hooks/useBudgetRows.ts` (refactor only)
- `src/lib/printRenderer.tsx` (`buildA3BudgetHtml` only)
- `src/components/PanelEvaluator.tsx` (`startEvaluation` only)
- `supabase/functions/propose-evaluation-panel/index.ts` (data-gathering + summary block only)

Nothing else.
