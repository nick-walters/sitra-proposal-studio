# A3 grouped toggles + merged B3.1 cost-justification tables

## A. New A3 panel layout (`B31OptionalJustificationsCard`)

Three grouped sections, in order: **B. Subcontracting costs** → **C. Purchase costs** → **D. Other direct cost categories**. Each header is a top-level checkbox with one-line description; C and D expand to show sub-checkboxes when "any cost exists" for that umbrella.

### B. Subcontracting costs
- One checkbox, no children.
- If **no** subcontracting cost values are filled anywhere in the proposal → checkbox forced unchecked, disabled, description greyed out.
- If **any** are filled → checkbox forced checked, disabled, description normal, mentions "Table 3.1.g — Subcontracting cost items".

### C. Purchase costs (merged Table 3.1.h)
- Umbrella checkbox. Disabled+greyed when no C.1/C.2/C.3 values exist anywhere. Otherwise user-toggleable; defaults off **unless** a forced-on subcategory below requires it.
- Mentions "Table 3.1.h — Purchase costs (Travel, Equipment, Other)" when checked.
- Subcategory checkboxes appear (indented) for each of C.1/C.2/C.3 that has **any** values filled:
  - **C.1 Travel and subsistence** — user toggleable, default off.
  - **C.2 Equipment** — auto-locked **checked** (disabled) if any participant's C.2 cost exceeds 15% of that participant's personnel costs; otherwise user-toggleable.
  - **C.2 sub-option** "Include equipment costs that fall below the 15% threshold" — visible only when at least one participant has equipment costs below the 15% threshold; reuses existing `equipment_all` toggle.
  - **C.3 Other goods, works and services** — user toggleable, default off.
- If umbrella C is unchecked, all sub-toggles are visually disabled.

### D. Other direct cost categories (merged Table 3.1.i)
- Same shape as C. Disabled+greyed when no D.1/D.2 values exist. Otherwise user-toggleable.
- Sub-checkboxes (when any values exist) — **never auto-locked**:
  - **D.1 FSTP**
  - **D.2 Internally invoiced goods & services**
- Mentions "Table 3.1.i" when checked.

"Any cost filled" detection uses `budget_cost_justification_items` rows per `category`, fetched once via a new lightweight hook.

## B. B3.1 rendered tables (merged C and D)

`B31SectionContent` recomputes which tables render in this fixed order, with sequential lettering from 3.1.g:

1. **3.1.g — Subcontracting** (existing `B31SubcontractingTable`, unchanged structure).
2. **3.1.h — Purchase costs** (new `B31PurchaseCostsTable`): one table containing rows for each enabled sub-category in order C.1 → C.2 → C.3.
3. **3.1.i — Other direct costs** (new `B31OtherDirectCostsTable`): one table for D.1 → D.2.

Each merged table has columns: **Category | Participant | Cost (€) | Justification**, where:
- "Category" cell merges (rowSpan) across all rows belonging to that category block; label is one of "Travel" / "Equipment" / "Other" / "FSTP" / "Internally invoiced" (no codes).
- Within each category block, rows are grouped by participant (rowSpan on Participant), then one row per justification item, with a per-participant Subtotal row, exactly like the existing single-category tables.
- A category subtotal row closes each block; final grand-total row across the whole table.

C.2 (Equipment) rows in 3.1.h are filtered by the same 15%-of-personnel rule unless the "include below threshold" sub-option is on (existing `useB31SectionData` `includeAllEquipment` path is reused).

The old `B31EquipmentTable` and per-category uses of `B31JustificationTable` for travel/other_goods/fstp/internally_invoiced are removed from `B31SectionContent` and replaced by the two new merged components. The files themselves stay for now (no dead-code purge needed this turn).

## C. Data model

Two new boolean columns on `proposals` for the umbrella toggles (the C-umbrella also needs to persist because the user can leave it unchecked even when sub-data exists):
- `b31_show_purchase_costs` (default `false`)
- `b31_show_other_direct_costs` (default `false`)

Existing per-subcategory columns (`b31_show_travel_justification`, `b31_show_other_goods_justification`, `b31_show_fstp_justification`, `b31_show_internally_invoiced_justification`, `b31_show_all_equipment_justification`) are reused for the sub-checkboxes. A new persisted column for the C.2 sub-toggle ("equipment in 3.1.h at all") is **not** needed — C.2's inclusion is computed: `forced=true` when above-threshold rows exist, otherwise free, persisted in a new column `b31_show_equipment_justification` so users can opt out of C.2 entirely if no above-threshold rows force it.

So one more new column:
- `b31_show_equipment_justification` (default `false`).

`useB31JustificationToggles` is extended with the three new keys and their setters.

## Render rules (effective inclusion)

Equipment rows render in 3.1.h when: umbrella C is on **and** (any-participant >15% **or** `b31_show_equipment_justification` is on). When forced-on by >15%, the UI checkbox is disabled+checked.

Subcontracting in 3.1.g renders whenever any subcontracting item exists (B umbrella is always forced-on by data).

## Technical notes

- New hook `useB31CostPresence(proposalId)` returns `{ subcontracting, travel, equipment, equipmentAboveThreshold, equipmentBelowThreshold, otherGoods, fstp, internallyInvoiced }` booleans — one query against `budget_cost_justification_items` joined with `budget_rows` for the equipment >15% check (reuses logic already in `useB31SectionData`).
- New components: `B31PurchaseCostsTable.tsx`, `B31OtherDirectCostsTable.tsx` — both wrap a shared internal renderer `MergedJustificationTable` taking `blocks: { categoryLabel: string; participants: B31SubcontractingParticipant[] }[]`.
- `B31SectionContent` letter computation switches to: B included (data-driven), C included (umbrella+any enabled sub-block), D included (umbrella+any enabled sub-block).
- `B31OptionalJustificationsCard` rewritten as a nested checkbox group; existing single flat list is removed.

## Files touched

- migration: add `b31_show_purchase_costs`, `b31_show_other_direct_costs`, `b31_show_equipment_justification` to `proposals`.
- `src/hooks/useB31JustificationToggles.ts` — add three keys, columns, defaults.
- `src/hooks/useB31CostPresence.ts` — **new**.
- `src/components/B31OptionalJustificationsCard.tsx` — rewrite as B/C/D grouped panel with auto-lock logic.
- `src/components/B31PurchaseCostsTable.tsx` — **new**.
- `src/components/B31OtherDirectCostsTable.tsx` — **new**.
- `src/components/B31SectionContent.tsx` — replace individual C/D table renders with the two merged tables; update lettering.
- `src/hooks/useB31SectionData.ts` — expose `equipmentAboveThresholdByParticipant` separately so the merged table can include below-threshold rows when the sub-option is on, without losing the lock-on signal.

No removals this turn; old single-category tables remain in the repo but unused outside tests.
