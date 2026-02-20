

# EC Budget Table for Part A3 -- Full Redesign

## Overview

Replace the current category-based budget editor in A3 with an official EC portal-style budget sheet. The new sheet presents **one row per participant** with columns matching the screenshot: personnel costs, subcontracting, purchase costs (travel, equipment, other goods), internally invoiced services, indirect costs, total eligible costs, funding rate, EU contribution, and financial columns. Coordinators/admins/owners can lock individual participant rows. Cost justifications are entered via pop-up dialogs and feed Part B3.1 tables. Person-months feed the effort matrix (Table 3.1.f) and WP list table (3.1.a).

---

## Data Architecture

### New database table: `budget_rows`

One row per participant per proposal, replacing the multi-row `budget_items` approach with a flat structure that mirrors the portal exactly.

```text
budget_rows
-----------
id                          uuid PK
proposal_id                 uuid FK -> proposals
participant_id              uuid FK -> participants (unique with proposal_id)
role_label                  text (e.g. "Coordinator", "Participant")
personnel_costs             numeric default 0
subcontracting_costs        numeric default 0
purchase_travel             numeric default 0
purchase_equipment          numeric default 0
purchase_other_goods        numeric default 0
internally_invoiced         numeric default 0
indirect_costs_override     numeric | null  (null = auto-calculate 25%)
funding_rate_override       numeric | null  (null = use rule engine)
income_generated            numeric default 0
financial_contributions     numeric default 0
own_resources               numeric default 0
is_locked                   boolean default false
locked_by                   uuid | null FK -> auth.users
locked_at                   timestamptz | null
created_at                  timestamptz default now()
updated_at                  timestamptz default now()
```

### New database table: `budget_cost_justifications`

Stores per-participant justifications for specific cost categories, accessible via pop-up buttons.

```text
budget_cost_justifications
--------------------------
id                  uuid PK
budget_row_id       uuid FK -> budget_rows
category            text  (e.g. 'subcontracting', 'equipment', 'other_goods', 'internally_invoiced')
justification_text  text
updated_by          uuid FK -> auth.users
created_at          timestamptz default now()
updated_at          timestamptz default now()
```

### Calculated columns (client-side, not stored)

These are derived in the component, not in the database:

- **Direct costs** = personnel + subcontracting + travel + equipment + other_goods + internally_invoiced
- **Indirect costs** = 25% of (direct costs minus subcontracting minus internally_invoiced), unless `indirect_costs_override` is set
- **Total eligible costs** = direct costs + indirect costs
- **Funding rate** = from rule engine (100% RIA, 70% IA for profit entities, etc.) unless `funding_rate_override` is set
- **Maximum EU contribution** = total eligible costs x funding rate
- **Requested EU contribution** = min(maximum EU contribution, total eligible costs)
- **Total estimated income** = requested EU + income_generated + financial_contributions + own_resources

### RLS policies

- All authenticated users with access to the proposal can SELECT.
- INSERT/UPDATE: allowed if the participant is not locked, OR if the user is coordinator/admin/owner.
- Lock/unlock: only coordinator/admin/owner.
- DELETE: only coordinator/admin/owner.

### Migration to new structure

- The existing `budget_items` table stays in place (no data loss). The new `budget_rows` table is additive.
- On first load, if no `budget_rows` exist for the proposal, the component auto-initialises one row per participant with zeroes.
- A one-time migration function can optionally aggregate old `budget_items` into `budget_rows` (manual trigger via a button).

---

## Component Design

### `BudgetPortalSheet` (new, replaces `BudgetSpreadsheetEnhanced` in the A3 route)

A horizontally scrollable spreadsheet table matching the portal screenshot layout:

```text
| No. | Name of beneficiary | Country | Role | Personnel costs/EUR | Subcontracting costs/EUR | Purchase costs - Travel/EUR | Purchase costs - Equipment/EUR | Purchase costs - Other goods/EUR | Internally invoiced/EUR | Indirect costs/EUR | Total eligible costs | Funding rate | Max EU contribution | Requested EU contribution/EUR | Max grant amount | Income generated | Financial contributions | Own resources | Total estimated income |
```

**Key UI features:**

1. **Inline editing**: Each numeric cell is an editable input (using `FormattedNumberInput` for thousand separators).
2. **Auto-calculated columns** are greyed out and read-only (indirect costs, totals, EU contribution, max grant).
3. **Justification pop-ups**: Subcontracting, Equipment, Other goods, and Internally invoiced columns have a small button icon. Clicking opens a `Dialog` where the participant can write their justification. The justification is saved to `budget_cost_justifications`.
4. **Locking**: Coordinators/admins/owners see a lock toggle per row. When locked, the row becomes read-only for other users, with a lock icon displayed.
5. **TOTAL row** at the bottom sums all participant rows.
6. **Role column**: Auto-populated from participant data (participant_number === 1 gets "Coordinator", else "Participant"). Editable by coordinators.
7. **Sticky first columns**: No., Name, Country, Role are sticky-left for horizontal scrolling.

### `useBudgetRows` (new hook)

- Fetches/upserts `budget_rows` for the proposal.
- Auto-initialises rows for any participant that doesn't have one yet.
- Provides `updateRow`, `lockRow`, `unlockRow` functions.
- Handles debounced saves (300ms) to avoid excessive writes.
- Provides computed totals per row and grand totals.

### `BudgetJustificationDialog` (new component)

- A `Dialog` that opens when a justification button is clicked.
- Shows a `Textarea` for the justification text.
- Saves to `budget_cost_justifications`.
- Displays who last edited and when.

---

## Data Flow to Part B3.1

### Person-months to effort matrix (Table 3.1.f) and WP list (Table 3.1.a)

Currently, person-months are managed per-task in `wp_draft_task_effort`. The budget sheet will display a **read-only person-months column** (derived from the effort matrix) rather than duplicating the data. This avoids conflicts. The personnel costs column in the budget sheet will be editable directly.

Alternatively, if the user enters personnel costs in the budget sheet, the system can back-calculate an implied total PM using the participant's `personnel_cost_rate`. This would be shown as a helper tooltip, not as a source of truth that overwrites task-level effort.

### Cost justifications to Tables 3.1.g and 3.1.h

The existing `appendCostJustificationsToB31` function in `b31Population.ts` will be updated to read from `budget_cost_justifications` instead of (or in addition to) the old `budget_items.justification` field. The "Copy justifications to B3.1" button stays in A3, and now uses the new structured justification data:

- **Subcontracting justifications** feed Table 3.1.g (already exists as `B31SubcontractingTable`).
- **Equipment justifications** feed Table 3.1.h (already exists as `B31EquipmentTable`).
- Other goods and internally invoiced justifications can be appended as additional tables if needed.

---

## Implementation Steps

### Step 1: Database migration
- Create `budget_rows` table with RLS policies.
- Create `budget_cost_justifications` table with RLS policies.
- Add unique constraint on `(proposal_id, participant_id)` for `budget_rows`.

### Step 2: `useBudgetRows` hook
- Fetch budget rows joined with participant data (name, country, number, type).
- Auto-create missing rows for new participants.
- Debounced update function.
- Lock/unlock functions restricted to coordinator tier.
- Computed columns (indirect costs, totals, EU contribution).

### Step 3: `BudgetPortalSheet` component
- Horizontally scrollable table with sticky left columns.
- Inline `FormattedNumberInput` cells for editable columns.
- Grey/disabled cells for calculated columns.
- TOTAL row.
- Lock toggle per row (for coordinators).
- Justification buttons on relevant columns.

### Step 4: `BudgetJustificationDialog` component
- Category-specific justification editing.
- Save to `budget_cost_justifications`.

### Step 5: Wire into ProposalEditor
- Replace `BudgetSpreadsheetEnhanced` in the A3 route with `BudgetPortalSheet`.
- Keep the header layout consistent with other Part A sections (Guidelines button inline, etc.).
- Retain History, Export CSV, and "Copy justifications to B3.1" actions.

### Step 6: Update B3.1 data flow
- Update `b31Population.ts` to read justifications from `budget_cost_justifications`.
- Ensure `B31SubcontractingTable` and `B31EquipmentTable` can display data sourced from the new table.
- Display person-months summary from `wp_draft_task_effort` as a read-only column in the budget sheet.

### Step 7: Funding rate integration
- Apply the existing funding rate rules (100% RIA, 70% IA for profit-making) automatically per participant based on proposal type and organisation category.
- Allow coordinator override via `funding_rate_override`.

---

## Files affected

| Action | File |
|--------|------|
| Create | `src/components/BudgetPortalSheet.tsx` |
| Create | `src/components/BudgetJustificationDialog.tsx` |
| Create | `src/hooks/useBudgetRows.ts` |
| Edit   | `src/pages/ProposalEditor.tsx` -- swap `BudgetSpreadsheetEnhanced` for `BudgetPortalSheet` in A3 route |
| Edit   | `src/lib/b31Population.ts` -- read from `budget_cost_justifications` |
| Edit   | `src/components/B31SubcontractingTable.tsx` -- optionally source from new justifications |
| Edit   | `src/components/B31EquipmentTable.tsx` -- optionally source from new justifications |
| Migration | Create `budget_rows` and `budget_cost_justifications` tables with RLS |

The old `BudgetSpreadsheetEnhanced.tsx`, `useBudget.ts`, and `BudgetChangeHistory.tsx` remain in the codebase during transition but are no longer rendered from the A3 route. They can be removed in a follow-up cleanup once the new sheet is validated.

