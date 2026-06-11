## Goal

Make daily backups produce a complete, faithful, well-structured archive of every proposal — fixing all current defects (wrong files, missing content, wrong format, manual-run gated by hour), and adding WP draft + case draft backups.

## Issues being fixed

| # | Current | Fix |
|---|---|---|
| 1 | "Run backup now" returns 0 proposals when not at 06:00 Helsinki | Pass `force=1` (and `trigger:"manual"` body flag) so the hour-gate is bypassed for the admin button. |
| 2 | 13 files including an orphan `b3` doc (B3 legacy content actually holds B1.2 material) and many UUID-keyed Part B versions | Build the file list from a fixed allow-list of canonical section IDs (`b1-1, b1-2, b2-1, b2-2, b3-1, b3-2`). Ignore any section_id that is a UUID or `b3` (legacy). |
| 3 | `b31-intro-text` saved as a separate file | Merge `b31-intro-text` into the B3.1 file as the top section, followed by the b3-1 editor content, followed by the compulsory B3.1 tables (tasks, deliverables, milestones, risks). |
| 4 | B3.1 file contains only a few cross-refs | Pull compulsory B3.1 data from `wp_drafts` + `b31_tasks` + `wp_draft_deliverables` + `wp_draft_milestones` + `wp_draft_risks` (and effort) and render them as proper tables in the docx. |
| 5 | A2 only has basic org info | For each participant, include: departments, key researchers, infrastructure, achievements, dependencies, previous projects, members, organisation roles. |
| 6 | A3 is a partial text file | Replace with `{ACR} Part A3 {stamp}.xlsx`: consolidated budget rows per participant + totals row (full per-partner sheet refactor remains deferred per your earlier instruction). |
| 7 | A4 / A5 only contain justifications | Render full ethics checklist: every `*_yes/no` flag with its page reference and details; A5 lists OCD uploads plus any A5-related fields. |
| 8 | Files are ordered by build sequence | Sort the file list alphabetically before upload (filenames already start with `{ACR} Part …`, so alpha = canonical order). |
| 9 | Tables unreadable in `.txt` | Switch every text artefact to `.docx` (proper Word tables, headings, lists). A3 stays `.xlsx`. |
| 10 | WP drafts and case drafts not backed up | Add `{ACR} WP{N} Draft {stamp}.docx` for each `wp_drafts` row and `{ACR} Case {N} Draft {stamp}.docx` for each `case_drafts` row. |

## Final file list per proposal (alphabetical)

```
{ACR} Case 1 Draft {stamp}.docx     (one per case_drafts row)
{ACR} Case 2 Draft {stamp}.docx
…
{ACR} Part A1 {stamp}.docx
{ACR} Part A2 {stamp}.docx
{ACR} Part A3 {stamp}.xlsx
{ACR} Part A4 {stamp}.docx
{ACR} Part A5 {stamp}.docx
{ACR} Part B1.1 {stamp}.docx
{ACR} Part B1.2 {stamp}.docx
{ACR} Part B2.1 {stamp}.docx
{ACR} Part B2.2 {stamp}.docx
{ACR} Part B3.1 {stamp}.docx     (intro-text + b3-1 editor + compulsory tables, all merged)
{ACR} Part B3.2 {stamp}.docx
{ACR} WP1 Draft {stamp}.docx        (one per wp_drafts row)
{ACR} WP2 Draft {stamp}.docx
…
```

## Technical approach

- **Edge function** `supabase/functions/generate-proposal-backups/index.ts`:
  - Add `docx` (via `npm:docx@9`) and `xlsx` (via `npm:xlsx@0.18`) to render artefacts in Deno.
  - Refactor builders into one-per-artefact functions returning `{ name, bytes, mime }`:
    - `buildA1Docx`, `buildA2Docx` (per-participant sections via `participants` + 7 child tables), `buildA3Xlsx` (single sheet from `budget_rows` joined to `participants`), `buildA4Docx`, `buildA5Docx`, `buildPartBSectionDocx(sectionId)`, `buildB31Docx` (intro + b3-1 + tables), `buildWpDraftDocx(wp)`, `buildCaseDraftDocx(case)`.
  - HTML → docx: walk the section HTML and emit `Paragraph` / `Table` / `TextRun` nodes (covers headings, lists, paragraphs, tables, line breaks). No external HTML-to-docx parser — a small in-house walker, similar in spirit to the existing `htmlToText` helper.
  - Force flag: read both `?force=1` query param and `body.trigger === "manual"` to bypass the 06:00 gate.
  - Sort the final `files[]` array by name before uploading to the bucket / SharePoint.
- **Section allow-list & merge logic**:
  - Constant `PART_B_SECTIONS = ["b1-1","b1-2","b2-1","b2-2","b3-1","b3-2"]`.
  - Helper `latestSectionContent(proposalId, sectionId)` (one query each, indexed lookup).
  - For B3.1, also fetch `b31-intro-text` and the b31 children for the WP collection.
- **Admin "Run backup now" button** (`src/pages/admin/BackupsAdmin.tsx`): invoke the function with `{ trigger: "manual", force: true }` and surface per-proposal result counts in the toast.
- **No DB migration needed** — existing tables `proposal_backups` and `sharepoint_backup_config` already cover everything; row schema unchanged.
- **No frontend types regen needed**.

## Out of scope (per your earlier note)

- Per-partner detailed A3 sheets feeding the consolidated sheets — deferred until after this round.
- SharePoint connector linking — pending your admin approval.

## QA after build

1. Click "Run backup now" → toast should report N proposals, including AddGenAI.
2. Open the new AddGenAI backup in the Backups panel: confirm filenames, alphabetical order, presence of WP / Case files, no `b3` or UUID files.
3. Download each docx/xlsx and spot-check: A2 per-participant content, A4 checklist with Yes/No + page, B3.1 with intro + body + tables, WP1 with tasks/deliverables/milestones/risks.