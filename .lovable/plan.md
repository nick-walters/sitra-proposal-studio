# Plan: Case drafts → B1.2, project-wide subsections, retroactive headings

## 1. Project-wide case subsections & guidelines (new)

New table `case_subsection_templates` (per proposal): `id, proposal_id, key, heading, guideline, order_index, is_default, created_at, updated_at`. Seeded on proposal creation with the five defaults (background_context, key_stakeholders, proposed_solutions, expected_outcomes, replicability).

- New button in case manager toolbar: **Edit case subsections & guidelines** → dialog listing rows with drag-handle, heading input, guideline textarea, add-row, delete-row.
- Edits propagate live: every case-draft editor and the B1.2 Cases table read headings/guidelines from this table instead of per-case `heading_*` / `guideline_*` columns.
- Per-case heading/guideline editing in `CaseDraftEditor` is removed (fields become read-only labels rendered from the template).
- `case_drafts.heading_*` and `guideline_*` columns are kept for now (no destructive drop) but stop being written/read; content storage moves to a generic `case_drafts.subsection_content jsonb` keyed by template `key`. Existing per-case data migrated into that jsonb on the same migration.

## 2. B1.2 Cases table (auto-inserted placeholder)

When ≥1 case draft exists for the proposal, the B1.2 editor auto-inserts (idempotently, once) a new unnumbered subheading + caption + table block under the new section structure (see §4):

- Subheading text derives from case type: "Living lab descriptions", "Case descriptions", "Challenge descriptions", "Pilot descriptions", "Demonstration descriptions", "Use case descriptions", or the `custom_type_name` + " descriptions" for Other. If mixed types exist, fall back to "Case descriptions".
- Positioned **directly above** the existing "Linked research & innovation activities" subheading (i.e. below Methodologies content).
- Auto-generated `EditableCaption` above the table, participating in the existing B1.2 caption sequence so it gets the next free letter and is cross-referenceable like any other table.

### Table style (mirrors 3.1.b, black-coloured)

Per case, a block of rows:

```
┌────────────────────────────────────────────────────┐
│  [ CS1 · Short name · Title ]   ← long white badge │  ← all black border/font
│  Lead: Participant short name                       │
├────────────────────────────────────────────────────┤
│  ***Background context:*** content…                │
├────────────────────────────────────────────────────┤
│  ***Key stakeholders:*** content…                  │
├────────────────────────────────────────────────────┤
│  …(remaining template rows)                        │
└────────────────────────────────────────────────────┘
```

- Long white badge spans full inner width, bold black text, black outline, case-badge typography.
- Number prefix shown only when the existing case-number toggle is on.
- Lead participant on its own line beneath the badge.
- Each subsection in its own full-width cell, black 1px dividers, no inner column splits.
- Headings rendered from project-wide template (bold italic + colon), the heading text itself is **not** editable in the table (edit via the dialog); the content after the colon is fully editable inline.
- Rows fully reorderable and deletable in B1.2 (authority shift identical to 3.1.b — once populated, B1.2 is the source of truth).

## 3. Populate flow (case manager)

- Add **Populate to B1.2** button in case manager toolbar. Dialog: confirm + list cases to include (all by default, like WP populate but only whole-case granularity).
- On populate: overwrite/insert each selected case into the B1.2 Cases table, set `case_drafts.is_locked = true` and `locked_by/at`.
- Lock banner on `CaseDraftEditor` (whole editor read-only) with coordinator **Override** session-local button, mirroring WP-draft pattern.
- Cases deleted/added in case manager: row stays in B1.2 until next populate (B1.2 is authority). Placeholder rows for newly-added unpopulated cases still appear (badge + lead only, empty subsection cells), matching auto-insert behaviour.

## 4. Retroactive B-section subheadings

Idempotent inserter run once per proposal on first load of each affected section. For sections 1.1, 1.2, 2.1, 2.2, 3.2: inserts each listed subheading at the **top** of the section content (preserving everything below), skipping any subheading already present (case-insensitive match on heading text).

Subheadings inserted per your spec:
- 1.1 — Objectives; Ambition
- 1.2 — Methodologies; Linked research & innovation activities; Ongoing projects table; Open science practices; Data management; Gender dimension; Case studies & open calls
- 2.1 — Pathway to impact; Scale & significance of expected impacts; Key performance indicators
- 2.2 — Key exploitable results; Draft plan for the dissemination & exploitation of results, including communication plan; Intellectual property management
- 3.2 — Interdisciplinarity & complementarity of the consortium for addressing the project's objectives; Participants' capacity, contributions & resources; Value chain coverage & industrial involvement; Justification of the participation of international organisations & third countries

Tracked via a `proposal_subsection_seeding` jsonb flag on `proposals` so it runs exactly once per (proposal, section).

## Technical notes

- New migration: `case_subsection_templates` table (with grants + RLS following proposal-edit pattern), `case_drafts.subsection_content jsonb default '{}'::jsonb`, `case_drafts.is_locked/locked_by/locked_at` already exist, data-copy from existing columns into jsonb + template seed per existing proposal.
- New components: `CaseSubsectionTemplateDialog.tsx`, `B12CasesTable.tsx` (parallels `B31WPDescriptionTables`), `B12CasesTablePopulator.ts` (parallels `b31Population.ts`).
- Caption integration: extend B1.2's existing tableOffset logic so the auto-inserted cases-table caption is counted before/after editor tables consistently with `renumberCaptionsInEditor`.
- Hooks: extend `useCaseDrafts` (or create) to expose subsection_content + lock state; update `CaseDraftEditor` to render template-driven sections and respect lock.
- No changes to participant/acronym/figure/WP cross-ref sources.

## Files (high-level)

- New: `supabase/migrations/<ts>_case_subsections_b12.sql`
- New: `src/components/CaseSubsectionTemplateDialog.tsx`
- New: `src/components/B12CasesTable.tsx`
- New: `src/lib/b12CasesPopulation.ts`
- New: `src/lib/seedBSectionSubheadings.ts`
- Edit: `src/components/CaseDraftEditor.tsx` (template-driven, lock banner, override)
- Edit: `src/pages/CaseManager.tsx` (toolbar buttons: edit subsections, populate)
- Edit: `src/components/B12SectionContent.tsx` (or equivalent B1.2 renderer) to mount cases table + caption above "Linked research & innovation activities"
- Edit: `src/lib/renumberCaptionsInEditor.ts` (offset handling for the cases table caption)
- Edit: `src/hooks/useCaseDrafts.ts` (subsection_content, lock)
- Edit: section loader (likely `useSectionContent.ts` or section page) to invoke `seedBSectionSubheadings` once

## Out of scope (deferred)

- Cross-ref menu changes for cases (already handled in earlier work — picker continues to source from `case_drafts`).
- Dropping the legacy `heading_*` / `guideline_*` columns (kept until migration is verified in production).

Want me to proceed with this scope, or adjust anything (especially §1's move to project-wide templates, since that's the biggest structural change)?