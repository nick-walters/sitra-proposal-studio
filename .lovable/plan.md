# A2: three views, per-participant tabs, locking

Modelled throughout on the lump-sum budget panel.

## 1. Three views

A three-button toggle in the same style and position as the budget one
(`BudgetPortalSheet.tsx`), inside `ParticipantListView.tsx`:

`Overview · Enter participant info · Completeness check`

- **Overview** — the participant list, with the capacity (expertise) matrix
  beneath it. The matrix already sits under the list today, so it simply stays
  there. Visible to everyone with proposal access; the default.
- **Enter participant info** — participant badge strip plus the selected
  participant's subpage, in place.
- **Completeness check** — unchanged content.

Choice stored per user per proposal under `a2-view:<userId>:<proposalId>`,
mirroring the budget's `ls-budget-view:<userId>:<proposalId>`. A stored view the
user cannot see falls back to Overview.

## 2. Per-participant tabs

A wrapping strip of `ParticipantBubble` badges, faded when inactive, copied from
`LumpSumBudgetPanel.tsx`. Selecting one renders `ParticipantDetailForm` in place
instead of navigating away.

The existing sidebar route (`a2-<participantId>`) is untouched and keeps
rendering the subpage as its own page, so existing direct links still work.

## 3. Who may edit

Adopts the budget rule exactly, via one call to
`public.editable_participant_ids(_proposal_id)`:
anyone may view; a person listed against an organisation in A2 may edit it;
coordinator and above may edit any; a coordinator may override per participant
per user.

This tightens current behaviour: proposal-level editors not listed against an
organisation lose edit rights on it. Intended.

**Override store:** reuse `ls_budget_permission_overrides`, because
`editable_participant_ids` already reads it and the instruction is to reuse that
function with one call. Consequence, stated plainly: a coordinator granting
budget edit rights on a participant also grants participant-information edit
rights on it, and vice versa. If those must be separable, a second override
table and a second function are needed instead — say so and I will split them.

## 4. Locking

Coordinator and above can lock a participant's information. A locked
participant's subpage is entirely read-only for everybody, coordinators
included; they must unlock first. Lock-all control in the budget's style and
position with the same three colour states (green none, red all, orange mixed).

Stored as new columns on `participants`: `info_locked`, `info_locked_by`,
`info_locked_at`.

Enforced in RLS as well as the interface, following the `ls_` tables. The lock
check is added to write policies on:

- `participants`
- `participant_members`
- `participant_researchers`
- `participant_achievements`
- `participant_previous_projects`
- `participant_infrastructure`
- `participant_dependencies`
- `participant_departments`
- `participant_organisation_roles`
- `participant_descriptions`
- `participant_ocd_uploads`
- `expertise_matrix_cells` (the locked participant's column)

A `SECURITY DEFINER` helper `participant_info_editable(participant_id)` combines
"may edit" and "not locked" so each policy stays one call.

## 5. Permissions dialog

`ParticipantPermissionsDialog.tsx`, matching `LumpSumPermissionsDialog.tsx`:
same search field, same list of everyone with proposal access, same effective
right and reason columns, coordinators listed with their control disabled.

## Technical notes

- New hook `useParticipantAccess.ts` mirroring `useLumpSumBudgetAccess.ts`
  (locks, members, overrides, optimistic lock patching, lock-all, override
  set/clear).
- `ParticipantDetailForm` receives a single `canEdit` already computed from
  editability and lock, and passes it down. `ContactPersonsSection` and
  `ResearchersTable` are not touched — they inherit it.
- `ParticipantListView` sources the member mutation handlers it needs for the
  in-place subpage from the existing shared proposal-data hook, so the editor
  page does not need changing.

## Testing

Rule checks read-only against SUSIE-Q for both approved accounts. Lock
enforcement tested destructively on a throwaway proposal only, which is then
removed. No SUSIE-Q participant left locked, nothing deleted.
