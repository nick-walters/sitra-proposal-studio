## Overview

Three coordinated pieces of work:

1. Add a **per-participant detailed-budget sheet** to the existing A3 Excel export. Summary sheets reference these new sheets via formulas.
2. Build a **daily backup engine** that produces, for every active proposal:
   - one `.txt` per Part A section (A1, A2, A4, A5),
   - one `.txt` per Part B section (latest version only),
   - one `.xlsx` for A3 (reusing the upgraded export generator).
3. Push the same daily bundle to **two destinations**: a private Lovable Cloud storage bucket (90-day rolling, in-app download) **and** a SharePoint folder via the Microsoft SharePoint connector at **06:00 Europe/Helsinki** (handles EET/EEST automatically).

File naming convention: `{ACRONYM} Part {X} YYYY-MM-DD HH-MM-SS.{ext}` (colons replaced with hyphens for SharePoint/Windows safety).

---

## Part 1 — Per-participant detailed-budget sheet in A3 Excel export

Refactor `src/lib/` Excel generator so each participant gets its own worksheet named e.g. `P{n} {ShortName}` containing the same detailed breakdown that the live A3 portal shows for that partner: personnel (with WP allocations and PM rates), subcontracting, equipment, other goods/services/works, indirect costs (25 %), totals, requested EU contribution.

The existing summary sheets (A3.1 totals, A3.2 effort, A3.3 per-WP, FSTP if applicable) become **formula-driven**, referencing the per-participant tabs (e.g. `='P2 Acme'!$E$42`) instead of writing precomputed numbers. Round-to-cent rules in the budget engine memory remain authoritative — formulas use `ROUND(..., 2)` to match.

The refactored generator is split into a **shared module** that runs in both browser (live export) and Deno (backup edge function):

```
src/lib/budgetExcel/
  ├─ buildWorkbook.ts        ← pure function, uses xlsx-js-style + jszip via npm: specifiers
  ├─ participantSheet.ts
  ├─ summarySheets.ts
  └─ formulas.ts             ← shared cell-reference helpers
```

The live "Export A3" button continues to call `buildWorkbook` from the browser unchanged. The backup edge function imports the same module via `npm:` specifiers.

---

## Part 2 — Backup engine (edge function + storage)

**New table** `proposal_backups`:

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| proposal_id | uuid FK | |
| backup_timestamp | timestamptz | exact run time |
| sharepoint_status | text | `pending` / `uploaded` / `failed` / `skipped` |
| sharepoint_path | text | full SharePoint path once uploaded |
| bucket_paths | jsonb | array of object keys in `proposal-backups` bucket |
| size_bytes | int | total bundle size |
| error | text | last error message if any |

RLS: read restricted via `is_proposal_admin()` (coordinators & global admins only). GRANT block follows public-schema rules.

**New private storage bucket** `proposal-backups` created via `supabase--storage_create_bucket`. RLS on `storage.objects` mirrors the table policy. 90-day rolling retention enforced by a daily cleanup step inside the same edge function (deletes both bucket objects and table rows older than 90 days).

**New edge function** `generate-proposal-backups`:
- Triggered hourly by `pg_cron` → `net.http_post`.
- On entry, computes current `Europe/Helsinki` local hour using `Intl.DateTimeFormat`. Exits immediately unless local hour is `06`. This handles EET/EEST switches with zero manual intervention.
- For every active (non-archived) proposal:
  1. Build Part A text files from `part_a_data`, `participants`, `participant_*`, `ethics_assessment`, `participant_ocd_uploads`.
  2. Build Part B text files from latest `section_versions` per Part B section, using a minimal HTML→text converter (headings → `# Title`, lists → `- item`, tables → tab-separated rows, cross-refs rendered as visible text). HTML sanitised via `_shared/sanitizeEditorHtml.ts`.
  3. Build A3 `.xlsx` by importing the shared `buildWorkbook` module from Part 1.
  4. Upload each file to the `proposal-backups` bucket under `{proposal_id}/{YYYY-MM-DD HH-MM-SS}/{filename}`.
  5. Push each file to SharePoint (Part 3).
  6. Insert one `proposal_backups` row with the outcome.
- Cleanup pass: delete bucket objects and rows older than 90 days. SharePoint files are **not** deleted automatically — they're owned by the user's tenant.

**File naming** (used identically in bucket and SharePoint):
- `{ACRONYM} Part A1 YYYY-MM-DD HH-MM-SS.txt`
- `{ACRONYM} Part A2 YYYY-MM-DD HH-MM-SS.txt`
- `{ACRONYM} Part A3 YYYY-MM-DD HH-MM-SS.xlsx`
- `{ACRONYM} Part A4 YYYY-MM-DD HH-MM-SS.txt`
- `{ACRONYM} Part A5 YYYY-MM-DD HH-MM-SS.txt`
- `{ACRONYM} Part B{section_number} YYYY-MM-DD HH-MM-SS.txt`

---

## Part 3 — SharePoint delivery

Uses the **Microsoft SharePoint** connector (gateway-backed, auto-refreshing OAuth). One workspace-level connection covers all proposals.

**Configuration table** `sharepoint_backup_config` (single-row, global, admin-editable):

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| site_id | text | Microsoft Graph site ID |
| root_folder_path | text | e.g. `Documents/Sitra proposal backups` |
| per_proposal_subfolder | bool | default `true` |
| updated_by | uuid | |
| updated_at | timestamptz | |

A small **Settings → Backups** admin page lets a global admin paste the SharePoint site URL and root folder path. The page resolves the site URL → site ID via Graph `GET /sites/{hostname}:/sites/{path}` and stores the resolved ID.

**Per-proposal subfolder logic** (best-effort, with fallback as you requested):
- Attempt to ensure folder `{root_folder_path}/{ACRONYM} Proposal Backup/` exists (PUT empty folder via Graph).
- If creation fails (permission, naming collision, etc.), fall back to the flat root folder — the filename itself already contains the acronym and timestamp, so files remain unambiguous.

**Upload call** (per file):
```
PUT https://connector-gateway.lovable.dev/microsoft_sharepoint/sites/{site-id}/drive/root:/{folder}/{filename}:/content
Authorization: Bearer ${LOVABLE_API_KEY}
X-Connection-Api-Key: ${MICROSOFT_SHAREPOINT_API_KEY}
Content-Type: text/plain  (or application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)
Body: <file bytes>
```

Files ≤4 MB use the simple PUT shown above; daily proposal bundles will be well under that. If a file ever exceeds 4 MB we'd switch to a resumable upload session — not needed for v1.

Failures don't block the in-platform backup: the bucket upload always runs first, then SharePoint. The `proposal_backups` row records `sharepoint_status = failed` with the error and the next day's run retries automatically.

---

## Part 4 — In-app UI for coordinators & admins

New **"Backups"** panel on the proposal editor (visible only when `is_proposal_admin()` is true):
- Lists daily backup runs newest first.
- Each row shows: timestamp, total size, SharePoint status icon, expand to see individual files.
- Per-file download button generates a 60-second signed URL via `supabase.storage.from('proposal-backups').createSignedUrl(...)`.
- Read-only — no manual trigger button (out of scope).

Settings → Backups admin page (global admins only):
- SharePoint site URL + root folder inputs, "Test connection" button (calls Graph `/sites/{id}` and reports success/failure).
- Toggle for "Create one subfolder per proposal".

---

## Part 5 — Scheduling

Run via `supabase--insert` (not migration — it embeds the project ref and anon key):

```sql
select cron.schedule(
  'proposal-backups-hourly-helsinki-gate',
  '0 * * * *',
  $$
  select net.http_post(
    url := '<project-functions-url>/generate-proposal-backups',
    headers := '{"Content-Type":"application/json","apikey":"<anon-key>"}'::jsonb,
    body := concat('{"trigger":"cron","fired_at":"', now(), '"}')::jsonb
  );
  $$
);
```

The edge function self-gates to 06:00 Helsinki local time. Hourly invocation cost is negligible (each non-matching call exits in <50 ms with no DB reads beyond the time check).

---

## Required user action before/during build

1. **Connect Microsoft SharePoint** via the connector picker when prompted. The connector is gateway-backed and OAuth-refreshed automatically.
2. **After Part 3 lands**, an admin opens Settings → Backups and pastes the SharePoint site URL + root folder path (e.g. `https://yourtenant.sharepoint.com/sites/Sitra` + `Documents/Sitra proposal backups`). Until then, SharePoint uploads are skipped (`sharepoint_status = skipped`); in-platform bucket backups still run.

---

## Out of scope

- Restore flow (read-only backups only).
- Including budget CSV/PDF or figures in the daily bundle.
- Including B3.1 structured tables, WP drafts, or budget tables in the text bundle (only Part B section-editor content is included as text; A3 covers the budget side).
- Email delivery / digest.
- User-triggered ad-hoc backup button.
- Deleting SharePoint files on retention expiry (tenant-owned).
