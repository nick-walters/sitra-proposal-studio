## Goal

Make B3.1 the authoritative source for tasks/deliverables/milestones (T/D/MS). WP drafts become a workshop that only enters B3.1 via the **Populate** button. Cross-references resolve against B3.1 data, with granular locking and yellow placeholders for deleted refs.

## Behaviour model

1. **WP drafts → B3.1 only via Populate.** No auto-mirroring in either direction.
2. **B3.1 content is fully editable** after populate; edits never flow back to the draft.
3. **Re-populate** wholesale replaces the selected parts in B3.1 (per current `populateB31` behaviour) — coordinator+ must press Populate again to push further draft changes.
4. **Granular lock** on the WP draft: lock only the parts that were populated.
   - Objectives populated → lock objectives editor.
   - Description-before-tasks populated → lock that editor.
   - Tasks populated → lock tasks table (add/edit/delete/reorder).
   - Deliverables populated → lock deliverables table.
   - Milestones populated → lock milestones table.
   - Risks populated → lock risks table.
   - Coordinator+ can override per-section to keep editing; doing so does NOT unpopulate B3.1.
5. **Cross-ref source = B3.1 only.** Pickers and badge resolution use `b31_tasks`, `b31_deliverables`, `b31_milestones` (+ `wp_drafts` shell for WP/colour). Items that exist only in a WP draft are not pickable and not resolved.
6. **Reorder/renumber in B3.1** continues to update badges live (existing step-3 wiring, but now keyed off B3.1 rows directly — no `wp_draft_task_id` round-trip needed).
7. **Deleted in B3.1** → cross-refs become the yellow italic `[cross-reference to a deleted task/deliverable/milestone]` placeholder (already implemented for all types).
8. Participant refs → A2 (unchanged). Acronym → A1 (unchanged). Figure/table → Part B editors (unchanged). Case → deferred.

## Database changes

Add per-section populate flags on `wp_drafts` so the lock UI knows what to lock:

```sql
ALTER TABLE public.wp_drafts
  ADD COLUMN IF NOT EXISTS b31_populated_objectives boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS b31_populated_description boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS b31_populated_tasks boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS b31_populated_deliverables boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS b31_populated_milestones boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS b31_populated_risks boolean NOT NULL DEFAULT false;
```

`populateB31` sets the relevant flag to true at the end of each section's copy block. No data backfill needed (disposable test proposal).

## Code changes

### Populate flow (`src/lib/b31Population.ts`)
- After each section is copied, write the matching `b31_populated_*` flag to `true` on each affected `wp_drafts` row.
- Re-populate continues to wholesale replace the selected scope.

### WP draft editor lock UI
- `WPDraftEditor.tsx` + `WPTableSection.tsx` (and the objectives/description/deliverables/milestones/risks editors): read the per-section flags and disable inputs / add/delete/reorder controls when locked. Show a small "Populated to B3.1 — coordinator+ can override" banner with an override toggle for coordinator+.
- Override toggle is session-local (no DB write); refreshing re-locks. Keeps B3.1 as the source of truth.

### Cross-reference picker
- `useProposalReferences.ts` (and related picker components for T/D/MS) switch from `wp_draft_tasks/_deliverables/_milestones` to `b31_tasks/b31_deliverables/b31_milestones`. WP shell info (number, colour, short name) still comes from `wp_drafts`. Participant/acronym/figure/table sources unchanged.

### Sync / badge resolution
- `syncCrossReferences.ts` lookup maps already use B3.1 rows for T/D/MS resolution. Confirm task lookup is by `b31_tasks.id` (not `wp_draft_task_id`). Remove obsolete `wp_draft_task_id`-based fallback paths if any remain.
- Step-3 mirror writes in `B31WPDescriptionTables.tsx` (writes back to `wp_draft_tasks`) become obsolete — remove them so B3.1 reorders no longer touch the draft.

### Initial B3.1 state for unpopulated WPs
- `useB31SectionData` / `B31WPDescriptionTables`: when a WP has no `b31_tasks` rows, render only the placeholder bar (WP number, short name, title, leader, dynamic duration from A1). No objectives, no task rows, no D/MS rows. The auto-seed trigger `initialize_b31_tasks` is dropped so new WPs start empty in B3.1.

```sql
DROP TRIGGER IF EXISTS initialize_b31_tasks_trigger ON public.wp_drafts;
-- function kept for now in case of rollback; safe to drop later
```

### Disposable proposal cleanup
- One-off: for the test proposal, clear `b31_tasks`, `b31_deliverables`, `b31_milestones`, `b31_risks` rows that originated from auto-mirror (i.e. all of them, since nothing has been explicitly populated yet). User confirmed existing data is disposable.

## Out of scope (deferred)
- Case drafts → B1.2 populate flow (separate ticket).
- Any change to participant/acronym/figure/table cross-ref sources.

## Acceptance

1. Fresh WP: B3.1 shows only the placeholder bar. T/D/MS pickers show no items for that WP.
2. Populate tasks only → B3.1 gets the tasks; WP draft tasks table locks; WP objectives still editable.
3. Edit a task title in B3.1 → WP draft task unchanged.
4. Reorder tasks in B3.1 → cross-ref badges renumber.
5. Delete a task in B3.1 → cross-refs to it become the yellow `[cross-reference to a deleted task]` placeholder.
6. Coordinator+ override on a locked draft section → can edit, but B3.1 is unaffected until they press Populate again.
7. TypeScript compiles.
