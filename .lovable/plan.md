# Generic card model for the Part B editors — revised proposal

Written proposal only. No code, migrations or data changes.

## 0. Decisions carried in from review

1. All six Part B sections (1.1, 1.2, 2.1, 2.2, 3.1, 3.2) migrate to cards. `section_content` is superseded for Part B. `section_versions` is **retained and stays readable** as legacy history in the version-history UI even after a section has cards.
2. No cross-document move. A card belongs to one document permanently.
3. The FSTP annex gets its own row in `template_types`.
4. Source-fed cards are strictly read-only; no override layer, no `card_table_cells` rows for them.
5. Pre-deletion version history counts against the retention cap; restore does not reset the counter.
6. Cron surface — **confirmed to exist and reusable** (see §16).
7. The B2.1 two-part table exports as two `<table>` elements with one caption paragraph above the first.

## 1. Core idea

One `proposal_cards` table holds every card in every Part B editor and in the FSTP annex. A card belongs to a section from `proposal_template_sections`, has a `kind` discriminator, four independent constraint flags, and an order index. Payload lives in child tables, not jsonb (§2.8). Fields, versions, guidelines and the recycle bin hang off cards.

```text
card_templates ──(seed)──> proposal_cards <── proposal_template_sections
                                 |
                                 ├── card_fields ──── card_field_versions
                                 ├── card_table (+ columns / rows / cells)
                                 ├── card_figure
                                 ├── card_outcome_entries
                                 ├── card_guidelines
                                 └── card_deletions  (recycle bin ledger)
```

## 2. Proposed schemas

### 2.1 `proposal_cards`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK DEFAULT gen_random_uuid() | |
| proposal_id | uuid NOT NULL | FK `proposals(id)` ON DELETE CASCADE |
| section_id | uuid NOT NULL | FK `proposal_template_sections(id)` ON DELETE CASCADE |
| document | text NOT NULL DEFAULT 'part_b' | CHECK in ('part_b','fstp_annex'); immutable (trigger) |
| kind | text NOT NULL | CHECK in ('text','figure','table','outcome_list') |
| template_key | text | stable key from `card_templates.key`; NULL for user-created cards |
| title | text NULL | genuinely nullable — see §14 |
| order_index | integer NOT NULL | §5 |
| is_deletable | boolean NOT NULL DEFAULT true | flag 1 |
| is_hideable | boolean NOT NULL DEFAULT true | flag 2 |
| is_source_fed | boolean NOT NULL DEFAULT false | flag 3 |
| is_fixed_position | boolean NOT NULL DEFAULT false | flag 4 |
| is_visible | boolean NOT NULL DEFAULT true | soft-hide |
| source_key | text | mirror source, e.g. `b31.deliverables` |
| origin | text NOT NULL DEFAULT 'manual' | CHECK ('auto','manual'); drives restore position |
| deleted_at | timestamptz | NULL = live |
| deleted_by | uuid | |
| created_at / updated_at | timestamptz NOT NULL DEFAULT now() | `update_updated_at_column` trigger |

- UNIQUE `(section_id, order_index)` DEFERRABLE INITIALLY DEFERRED.
- UNIQUE `(proposal_id, template_key)` WHERE `template_key IS NOT NULL` — one card per template key per proposal, makes seeding idempotent.
- Index `(proposal_id, section_id, deleted_at, order_index)`; partial index `(proposal_id) WHERE deleted_at IS NOT NULL`.
- Validation trigger: `is_fixed_position = true` ⇒ `is_deletable = false`; source-fed cards may not own `card_fields` or `card_table_cells`; `document` and `kind` immutable after insert.

### 2.2 `card_fields`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| card_id | uuid NOT NULL | FK `proposal_cards(id)` ON DELETE CASCADE |
| proposal_id | uuid NOT NULL | denormalised for RLS |
| heading | text NULL | H4 heading; NULL = no heading |
| content_html | text | sanitised rich text |
| order_index | integer NOT NULL | |
| assigned_participant_id | uuid | FK `participants(id)` ON DELETE SET NULL |
| origin | text NOT NULL DEFAULT 'manual' | |
| deleted_at / deleted_by | timestamptz / uuid | |
| deleted_with_card | boolean NOT NULL DEFAULT false | recycle-bin discriminator |
| created_at / updated_at | timestamptz | |

UNIQUE `(card_id, order_index)` deferrable; index `(card_id, deleted_at, order_index)`.

### 2.3 `card_field_versions`

`id` PK, `field_id` FK `card_fields(id)` ON DELETE RESTRICT, `proposal_id`, `version_number int`, `content_html`, `heading`, `is_auto_save boolean default true`, `created_by uuid`, `created_at timestamptz`. UNIQUE `(field_id, version_number)`. Update/delete blocked by triggers mirroring `prevent_section_version_update` / `prevent_section_version_delete`. Deletion is soft, so RESTRICT only matters at purge, which deletes versions first.

### 2.4 Table cards

- `card_table` — `card_id` PK, `caption text`, `caption_suffix char(1)` (derived), `variant text NOT NULL DEFAULT 'standard'` CHECK ('standard','cases','wp_description'), `parts smallint NOT NULL DEFAULT 1`.
- `card_table_columns` — `id`, `card_id`, `part smallint NOT NULL DEFAULT 1`, `order_index`, `label_html`, `width_px integer`, `align_h`, `align_v`.
- `card_table_rows` — `id`, `card_id`, `part smallint NOT NULL DEFAULT 1`, `order_index`, `row_type text` CHECK ('header','body').
- `card_table_cells` — `id`, `proposal_id`, `row_id`, `column_id`, `content_html`, `align_h text NULL`, `align_v text NULL`, `colspan int default 1`, `rowspan int default 1`. UNIQUE `(row_id, column_id)`.

Column widths persist on `card_table_columns.width_px`, replacing `table_column_widths.table_key` with the card id. `table_column_widths` is kept read-only for legacy editor tables and dropped once Part B migration completes.

### 2.5 Figure cards

`card_figure` — `card_id` PK, `figure_id uuid` FK `figures(id)`, `float text` CHECK ('none','left','right'), `max_width_cm numeric`, `caption text`. `figures` remains the asset record; the card is the placement.

### 2.6 Outcome/impact cards (B2.1 list)

`card_outcome_entries` — `id`, `proposal_id`, `card_id`, `order_index`, `quote_html`, `label_a text`, `value_a_html`, `label_b text`, `value_b_html`, timestamps.

### 2.7 Recycle bin ledger

`card_deletions` — `id`, `proposal_id`, `section_id`, `target_type text` CHECK ('card','field'), `target_id uuid`, `parent_card_id uuid`, `deleted_at`, `deleted_by`, `purge_after timestamptz NULL`, `restored_at`, `restored_by`. Indexes `(proposal_id, restored_at, deleted_at)` and `(purge_after) WHERE restored_at IS NULL`.

### 2.8 Payload storage: child tables, not jsonb

1. Version history is per field; a jsonb blob versions the whole card, conflicting with §7.
2. Cross-ref chips and caption renumbering need stable FK targets, not jsonb paths.
3. Per-cell alignment, colspan and resizable columns are a direct relational fit.
4. RLS and GRANTs apply cleanly per table instead of pushing authorisation into app code.

## 3. Constraint flags

| Case | deletable | hideable | source_fed | fixed |
|---|---|---|---|---|
| B3.1 compulsory mirrored cards | false | false | true | true |
| B3.1 undeletable-but-hideable free-text top card | false | true | false | true |
| B3.1 cost-justification cards (from `b31_show_*`) | false | true | true | true |
| B3.2 source-fed cards (from `mirror_*`) | false | true | true | true |
| Migrated methodology narrative subsections | false | true | false | false |
| User-added card | true | true | false | false |

No fifth flag. "Editable heading" is `is_source_fed` plus nullable `title`; "required non-empty" belongs to the compliance checker.

## 4. Document scope

`proposal_cards.document` CHECK `('part_b','fstp_annex')`, immutable. The FSTP annex has its own `template_types` row (decision 3) whose sections live in `proposal_template_sections` like any other, so `document` is derivable from the section but stored anyway as a denormalised guard and a single export predicate. The annex export in `FstpTab.tsx` selects `document = 'fstp_annex'` and skips page-limit accounting entirely.

## 5. Ordering with fixed cards

Within a section, all `is_fixed_position` cards form one contiguous fixed block at the bottom, in template order.

- Fixed cards seeded at 1000, 1010, 1020… (10-step gaps).
- New cards append at `max(order_index of free cards) + 1`, below free cards and above the block.
- Drag rules, enforced client-side and by trigger: a free card's index must be `< min(fixed.order_index)`; fixed cards cannot be reordered; nothing may land between two fixed cards.
- Reorder writes the full ordered id list in one transaction against the deferrable unique constraint — no negative-value swap workaround.

## 6. Deletion and recycle bin

**Who** — delete, restore and purge-now are all **coordinator-or-above**: `public.is_coordinator_or_above(auth.uid())` combined with `public.is_proposal_admin(auth.uid(), proposal_id)`; `useProposalRole.ts` `roleTier === 'coordinator'` gates the UI. Editors can edit content but cannot delete cards or fields. Every deletion is behind an AlertDialog "are you sure" confirmation naming the card or field.

**Delete** sets `deleted_at`/`deleted_by` and cascades a soft delete to the card's fields with `deleted_with_card = true`, inserting ledger rows. Nothing is physically removed, so all versions survive.

**Bin listing** — per section, behind a discrete recycle-icon button: cards, plus fields whose `deleted_with_card = false`. That flag is exactly how the bin distinguishes an individually deleted field from one that went down with its card.

**Restore**
- Card: clears `deleted_at` on the card and on all fields with `deleted_with_card = true`; the most recent state and full history return. Fields deleted individually *before* the card stay in the bin.
- Individually deleted field: restores into its original parent card.
- Field whose parent card is still deleted: the action restores the card first as one operation, warning "Restoring this field will also restore its card *X*". No orphans, no synthetic parents.

**Restore position**
- Cards: `origin='auto'` reinserts at its stored `order_index` relative to survivors, then indices normalise; `origin='manual'` restores at the bottom of the free block.
- Fields: same rule one level down — auto fields return to their recorded `order_index` within the card, manual fields become the card's last field.

**Retention and purge** — "submitted" is `proposals.status = 'submitted'` (existing `proposal_status` enum). A trigger on `proposals` sets `purge_after = now() + interval '30 days'` on unrestored ledger rows when status becomes 'submitted', and clears it if status reverts. Before submission `purge_after IS NULL` = retained indefinitely. Purge runs on the existing cron surface (§16).

## 7. Version history and `section_versions`

- New per-field history in `card_field_versions`, written by a security-definer `insert_card_field_version` mirroring `insert_section_version`, with a card-aware variant of `thin_section_versions`. Per decision 5, pre-deletion versions count against the cap and restore does not reset it.
- `section_versions` is **retained and never hidden**. The version-history panel shows two groups for a Part B section: "Field history" (new model, per field) and "Legacy section history" (read-only `section_versions` snapshots), the latter visible even once the section has cards. No migration of legacy rows — they key on whole-section HTML with no per-field equivalent, and synthesising fields would fabricate history.
- `section_content` is superseded for Part B: after migration it is written no more, read only by the legacy viewer, and marked read-only at the app layer.

## 8. Shared table style

**Location** — `src/lib/tableStyleSpec.ts` (tokens + helpers) with `src/styles/table-card.css` imported once, so React consumers and the print renderer resolve the same values.

```ts
export const TABLE_SPEC = {
  fontFamily: '"Times New Roman", serif', fontSizePt: 11, lineHeight: 1.0,
  cellPadding: { x: '0.3pt', y: '0pt' },
  headerBorderBottom: '1.5px solid #000', bodyBorderBottom: '1px solid #e5e7eb',
  layout: 'fixed', width: '100%', maxWidth: '18cm',
  align: { h: 'left', v: 'middle' }, repeatHeader: false,
  captionPosition: 'above',
} as const;
export function tableStyleCss(variant?: 'standard'|'cases'|'wp_description'): string;
export function tableClassNames(variant?): { table: string; th: string; td: string };
export function cellAlignStyle(h?: AlignH, v?: AlignV): CSSProperties;
```

Last-row rule: `tbody tr:last-child td { border-bottom: 0 }`. Header repeat disabled with `thead { display: table-row-group }` in print CSS.

| Existing duplicate | Action |
|---|---|
| `src/index.css` block 1 (editor tables) | replaced by `table-card.css` |
| `src/index.css` block 2 (mirror/preview tables) | replaced by `table-card.css` |
| `src/components/CasesTableNodeView.tsx` | declared exception — keeps its own styling, imports only font tokens from `TABLE_SPEC` |
| `src/lib/printRenderer.tsx` | switches to `tableStyleCss()` for inline export CSS |
| WP description table (`B31WPDescriptionTables.tsx`) | declared exception — keeps its own styling |

**Alignment controls** — horizontal and vertical dropdowns in the formatting bar, rendered only when the selection is inside a table cell; they write `card_table_cells.align_h/align_v`, falling back to the column default and then the spec default.

**Captions (corrected)** — captions render **above** the table, as a paragraph immediately preceding it: bold-italic `Table N.N.x.` label plus italic caption text. The letter suffix is assigned per section in document order and recomputed on insert, reorder and restore by an extended `captionRenumbering.ts`. In a two-part table card, one caption paragraph sits above part 1 only.

**Cross-references** — cells are rich text sanitised with `CROSS_REF_RICH_TEXT_CONFIG` and hydrated with `hydrateRefBadges()`, exactly as the cases table and B3.1 mirror do today; chip rendering carries into table cards unchanged. Compulsory tables auto-insert badge markup (e.g. milestone numbers) into their designated column on reconcile.

## 9. Impact canvas replacement

Delete the canvas subsystem: `impact_canvas_columns`, `impact_canvas_rows`, `impact_canvas_elements`, `proposals.impact_canvas_enabled`, and `figures` rows with `figure_type = 'impact-canvas'`.

Replacement: one `kind='table'` card in B2.1 (`variant='standard'`, `parts=2`) with flags `deletable=false, hideable=true, source_fed=false, fixed=true`, rendering one logical table in two stacked parts sharing **one caption placed above part 1**:

- part 1 columns: Target groups | Specific needs | Expected results
- part 2 columns: DEC measures | Expected outcomes | Expected impacts

`card_table_rows.part` / `card_table_columns.part` separate the halves. All six headings editable. Default content per part: one header row plus one empty body row; rows addable. No stakeholder grouping. Word export emits two `<table>` elements preceded by the single caption paragraph.

## 10. Checkbox migration — `b31_show_*` and `mirror_*`

Verified column inventory on `proposals`:

- Eight, default `false`: `b31_show_purchase_costs`, `b31_show_travel_justification`, `b31_show_equipment_justification`, `b31_show_all_equipment_justification`, `b31_show_other_goods_justification`, `b31_show_other_direct_costs`, `b31_show_fstp_justification`, `b31_show_internally_invoiced_justification`.
- Five, default `true`: `mirror_value_chain`, `mirror_industrial_involvement`, `mirror_infrastructure`, `mirror_contribution_resources`, `mirror_participation_justification`.

**Decision: the columns are dropped; `proposal_cards.is_visible` becomes the single source of truth.** Retaining them as source of truth would recreate the dual-system problem — two writable switches for one behaviour and a preview/DOCX divergence risk. The A3 and A2 checkbox UIs stay where they are but write `is_visible` on the target card by `template_key`.

Mapping (all cards `is_source_fed=true, is_deletable=false, is_hideable=true, is_fixed_position=true`):

| Boolean | Card `template_key` | Section |
|---|---|---|
| b31_show_purchase_costs | `b31.purchase_costs_table` (3.1.h umbrella) | B3.1 |
| b31_show_travel_justification | `b31.just_travel` (sub-row within 3.1.h) | B3.1 |
| b31_show_equipment_justification | `b31.just_equipment` | B3.1 |
| b31_show_all_equipment_justification | `b31.just_equipment_all` | B3.1 |
| b31_show_other_goods_justification | `b31.just_other_goods` | B3.1 |
| b31_show_other_direct_costs | `b31.other_direct_costs_table` (3.1.i umbrella) | B3.1 |
| b31_show_fstp_justification | `b31.just_fstp` | B3.1 |
| b31_show_internally_invoiced_justification | `b31.just_internally_invoiced` | B3.1 |
| mirror_value_chain | `b32.value_chain` | B3.2 |
| mirror_industrial_involvement | `b32.industrial_involvement` | B3.2 |
| mirror_infrastructure | `b32.infrastructure` | B3.2 |
| mirror_contribution_resources | `b32.contribution_resources` | B3.2 |
| mirror_participation_justification | `b32.participation_justification` | B3.2 |

The umbrella/sub-row semantics of `B31OptionalJustificationsCard.tsx` (forced-on cases: subcontracting always on; equipment forced on above the 15% threshold) stay in that component — it now sets `is_visible` on the sub cards and the umbrella card instead of on `proposals` columns. Data-presence gating (`useB31CostPresence`) is unchanged and still disables checkboxes.

**Backfill** — for each proposal, `is_visible := <the boolean's current value>` on the corresponding seeded card, before the columns are dropped.

**`generate-proposal-backups/index.ts:1408-1427` — exactly what changes.** Today the function selects the eight `b31_show_*` columns from `proposals` and branches on them to decide which justification tables enter the DOCX. It must instead select the visibility of the eight B3.1 justification cards, i.e. read `proposal_cards (template_key, is_visible)` filtered to `proposal_id = :id AND deleted_at IS NULL AND template_key LIKE 'b31.%'`, build a `Record<template_key, boolean>`, and replace each `proposal.b31_show_x` test with `visible['b31.x']`. Nothing else in the function changes; the same eight branches remain, only their input changes. Until the columns are dropped, the function should read cards and fall back to the columns when no card row exists, so backup runs never regress mid-migration.

**Snapshot-restore migrations** — the two migrations that copy the eight columns back onto `proposals` during snapshot restore must drop those columns from their copy list, and `proposal_cards` (plus `card_*` children) must be added to `restore_in_scope_tables()` with a `proposal_id`-scoped predicate in `restore_scope_predicates()` / `capture_scope_predicates()`. Otherwise a restore would revert content but not visibility. Snapshots taken before the change carry the old columns; the restore function should ignore unknown keys rather than error.

**`mirror_*` has no edge-function consumer** — confirmed; only `ExpertiseMatrixCard.tsx` and the B3.2 renderers read it, so the change is client-side plus the backfill.

## 11. Card templates

`card_templates` — the catalogue of auto-created cards.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| template_type_id | uuid NOT NULL | FK `template_types(id)` — the Part B type or the FSTP annex type |
| section_source_id | uuid | FK `template_sections(id)`; resolved to the proposal's `proposal_template_sections` row at seed time |
| section_number | text NOT NULL | fallback matcher, e.g. `3.1` |
| document | text NOT NULL DEFAULT 'part_b' | CHECK ('part_b','fstp_annex') |
| key | text NOT NULL | stable `template_key`, e.g. `b31.deliverables` |
| kind | text NOT NULL | as `proposal_cards.kind` |
| default_title | text NULL | |
| order_index | integer NOT NULL | |
| is_deletable / is_hideable / is_source_fed / is_fixed_position | boolean NOT NULL | the four flags |
| default_visible | boolean NOT NULL DEFAULT true | seeds `is_visible` |
| source_key | text | mirror source |
| condition_budget_type | budget_type NULL | NULL = any |
| condition_uses_fstp | boolean NULL | NULL = any |
| default_fields | jsonb | array of `{heading, order_index}` seeds for text cards (structure only, no content) |
| default_table | jsonb | column labels, parts, initial row count for table cards |
| is_active | boolean NOT NULL DEFAULT true | |
| created_at / updated_at | timestamptz | |

UNIQUE `(template_type_id, key)`; index `(template_type_id, document, section_number, order_index)`.

**Seeding a new proposal.** `create_proposal_with_role` already knows `p_template_type_id`, `p_budget_type` and `p_uses_fstp`. After the proposal's `proposal_template_sections` are materialised, a security-definer `seed_proposal_cards(p_proposal_id)`:
1. reads the proposal's template type, budget type and FSTP flag;
2. selects active `card_templates` where `template_type_id` matches and (`condition_budget_type IS NULL OR = proposal.budget_type`) and (`condition_uses_fstp IS NULL OR = proposal.uses_fstp`);
3. joins each template row to the proposal's section by `section_source_id`, falling back to `section_number`;
4. inserts `proposal_cards` with `origin='auto'`, `template_key = key`, flags copied, `is_visible = default_visible`, and `order_index` = the template's index (fixed cards keep their 1000+ range);
5. expands `default_fields` into `card_fields` and `default_table` into `card_table*` rows;
6. is idempotent via `ON CONFLICT (proposal_id, template_key) DO NOTHING`, so it also serves as a repair/backfill pass for existing proposals and for FSTP being switched on later.

This **replaces `seed_methodology_subsections()`** entirely: the five narrative B1.2 subsections become five `card_templates` rows for the Part B template type in section 1.2, and the trigger is dropped once the migration lands. Rows conditioned on `uses_fstp = true` cover the FSTP annex template type; lump-sum-only tables use `condition_budget_type = 'lump_sum'`.

## 12. Worked example A — B3.1 (corrected)

Section: the `proposal_template_sections` row for 3.1, `document='part_b'`. All source-fed rows are `deletable=false, source_fed=true, fixed=true, origin=auto`.

| order_index | kind | template_key | title | hideable | visible by default | source |
|---|---|---|---|---|---|---|
| 1 | text | `b31.intro` | (none, title NULL) | true | true | authored, `fixed=true`, `deletable=false`, `source_fed=false` |
| 2… | text | — | user-added narrative | true | true | authored, freely orderable, deletable |
| 1000 | table | `b31.wp_list` | Table 3.1.a List of work packages | false | true | `wp_drafts` |
| 1010 | table | `b31.wp_descriptions` | Table 3.1.b Work package descriptions | false | true | `wp_drafts` + `wp_draft_tasks` (variant `wp_description`) |
| 1020 | table | `b31.deliverables` | Table 3.1.c List of deliverables | false | true | `wp_draft_deliverables` |
| 1030 | table | `b31.milestones` | Table 3.1.d List of milestones | false | true | `proposal_milestones` |
| 1040 | table | `b31.risks` | Table 3.1.e Critical risks | false | true | `proposal_risks` |
| 1050 | table | `b31.person_months` | Table 3.1.f Summary of staff effort | false | true | `wp_draft_effort` |
| 1060 | table | `b31.subcontracting` | Table 3.1.g Subcontracting costs | false | true (forced by data presence) | `budget_rows` + `budget_cost_justification_items` |
| 1070 | table | `b31.purchase_costs_table` | Table 3.1.h Purchase costs | true | from `b31_show_purchase_costs` | `budget_rows` + `budget_cost_justification_items` |
| 1071 | table | `b31.just_travel` | (sub-block of 3.1.h) | true | from `b31_show_travel_justification` | as above |
| 1072 | table | `b31.just_equipment` | (sub-block of 3.1.h) | true | from `b31_show_equipment_justification` | as above |
| 1073 | table | `b31.just_equipment_all` | (sub-block of 3.1.h) | true | from `b31_show_all_equipment_justification` | as above |
| 1074 | table | `b31.just_other_goods` | (sub-block of 3.1.h) | true | from `b31_show_other_goods_justification` | as above |
| 1080 | table | `b31.other_direct_costs_table` | Table 3.1.i Other direct cost categories | true | from `b31_show_other_direct_costs` | as above |
| 1081 | table | `b31.just_fstp` | (sub-block of 3.1.i) | true | from `b31_show_fstp_justification` | as above |
| 1082 | table | `b31.just_internally_invoiced` | (sub-block of 3.1.i) | true | from `b31_show_internally_invoiced_justification` | as above |
| 1090 | figure | `b31.gantt` | Gantt chart | true | true | `figures` (`figure_type='gantt'`) |
| 1100 | figure | `b31.pert` | PERT chart | true | true | `figures` (`figure_type='pert'`) |

The fixed block is 1000–1100. Free cards occupy 1..999; new cards append at the top of that range's tail and can be dragged anywhere below 1000. The expertise matrix does **not** appear here — it is B3.2.

## 13. Worked example B — B3.2

Section: `proposal_template_sections` row for 3.2, `document='part_b'`.

| order_index | kind | template_key | title | deletable | hideable | source_fed | fixed | source |
|---|---|---|---|---|---|---|---|---|
| 1 | text | `b32.intro` | (none, title NULL) | false | true | false | true | authored |
| 2… | text | — | user-added narrative | true | true | false | false | authored |
| 1000 | table | `b32.participants` | Table 3.2.a Consortium participants | false | false | true | true | `participants` |
| 1010 | table | `b32.expertise_matrix` | Table 3.2.b Expertise matrix | false | false | true | true | `expertise_matrix_rows/columns/cells` |
| 1020 | text | `b32.value_chain` | Value chain coverage | false | true | true | true | `participant_descriptions` — visibility from `mirror_value_chain` |
| 1030 | text | `b32.industrial_involvement` | Industrial involvement | false | true | true | true | `participant_descriptions` — `mirror_industrial_involvement` |
| 1040 | text | `b32.infrastructure` | Infrastructure | false | true | true | true | `participant_infrastructure` — `mirror_infrastructure` |
| 1050 | text | `b32.contribution_resources` | Contribution and resources | false | true | true | true | `participant_descriptions` — `mirror_contribution_resources` |
| 1060 | text | `b32.participation_justification` | Justification of participation | false | true | true | true | `participant_descriptions` — `mirror_participation_justification` |

Source-fed text cards render projected content; they own no `card_fields`.

## 14. Guidelines attached to cards

New `card_guidelines` (authoring level, alongside `card_templates`) and a per-proposal read path:

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| card_template_id | uuid | FK `card_templates(id)` — guidance for auto cards |
| section_source_id | uuid | optional: section-level guidance shown on every card of that section |
| guideline_type | text NOT NULL | CHECK ('evaluation','commission','sitra') → orange / blue / black |
| title | text | |
| content | text NOT NULL | |
| order_index | integer NOT NULL | |
| condition_budget_type | budget_type NULL | lump sum vs actual costs |
| condition_uses_fstp | boolean NULL | |
| is_active | boolean NOT NULL DEFAULT true | |

- Guidance is authored against the **card template**, not the proposal's card instance, so it stays editable centrally and applies to every proposal; the panel resolves it at read time by `template_key`, filtered by the proposal's budget type and FSTP flag. User-created cards inherit only section-level guidance.
- The three sources are visually distinct exactly as today: evaluation criteria orange, Commission template guidance blue, Sitra guidance black. `guideline_type` drives the colour token; no per-row colour is stored.
- Funding-mode conditionality (lump-sum page limits and recommendations) is expressed by `condition_budget_type`, mirroring the `card_templates` condition columns.
- Existing `section_guidelines` rows migrate to `card_guidelines` with `section_source_id` set (section-wide) unless a row is clearly card-specific, in which case it moves to the matching `card_template_id`. `section_guidelines` is retained read-only for one release, then dropped.

**`title` nullability** — yes, `proposal_cards.title` is genuinely nullable. NULL means "this card has no H3 heading" (either never had one or the user deleted it); an empty string is not used. The earlier `title_deleted` boolean is removed as redundant.

## 15. H3 numbering toggle

- New column `proposals.h3_numbering_enabled boolean NOT NULL DEFAULT false`. Proposal-wide, applying to every card H3 in both documents.
- Rendering: when off, a card title renders as plain H3 text. When on, the renderer prefixes a computed number in section-document order — `<section_number>.<n>` (e.g. `3.1.2`) — computed at render time from live card order, never stored. Toggling is therefore instant and lossless, and reordering renumbers automatically. Hidden cards are skipped in the count; source-fed cards with no title are skipped.
- Word/PDF export applies the same computation, so previews and exports agree.
- Because zero stored content uses the numbered-H3 representation, the `HeadingNumberLabel` mark and the `SubheadingDropdown` H3 options are retired with **no migration** — delete `src/extensions/HeadingNumberLabel.ts`, `src/lib/renumberH3Headings.ts`, and the H3 entries in the subheading dropdown.

## 16. Cron surface — findings (open question 6)

Both `pg_cron` and `pg_net` are installed, and two jobs already exist in `cron.job`:

| jobid | jobname | schedule | target |
|---|---|---|---|
| 2 | `proposal-backups-hourly-helsinki-gate` | `0 * * * *` | `functions/v1/generate-proposal-backups` via `net.http_post` |
| 3 | `deadline-reminders-daily` | `0 8 * * *` | `functions/v1/deadline-reminders` via `net.http_post` |

So the pattern is established: a `cron.schedule` entry issuing `net.http_post` to an edge function with headers built by `jsonb_build_object`. The purge reuses it — a third job, e.g. `card-recycle-bin-purge-daily` on `30 3 * * *`, posting to a new `purge-deleted-cards` function that calls a security-definer `purge_deleted_cards()` deleting versions, then fields/cells, then cards, then ledger rows where `purge_after < now() AND restored_at IS NULL`. No new infrastructure is required. Note `deadline-reminders` runs with `verify_jwt = false` in `supabase/config.toml`; the purge function should do the same and authenticate the caller with a shared secret header.

## 17. RLS sketch

For every new table (`proposal_cards`, `card_fields`, `card_field_versions`, `card_table*`, `card_figure`, `card_outcome_entries`, `card_deletions`; plus `card_templates` / `card_guidelines`, which are catalogue tables):

```sql
GRANT SELECT, INSERT, UPDATE ON public.<t> TO authenticated;
GRANT ALL ON public.<t> TO service_role;
ALTER TABLE public.<t> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "<t>_select" ON public.<t> FOR SELECT TO authenticated
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "<t>_insert" ON public.<t> FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "<t>_update" ON public.<t> FOR UPDATE TO authenticated
  USING (public.can_edit_proposal(auth.uid(), proposal_id))
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));
```

- **No `DELETE` grant to `authenticated` at all** — hard delete belongs to `service_role` (the purge job) only.
- Soft delete, restore and purge-now are **coordinator-or-above** and run through security-definer functions `soft_delete_card`, `soft_delete_card_field`, `restore_card`, `restore_card_field`, `purge_proposal_bin`, each beginning with `IF NOT (public.is_coordinator_or_above(auth.uid()) AND public.is_proposal_admin(auth.uid(), p_proposal_id)) THEN RAISE EXCEPTION ...`. A trigger additionally refuses `deleted_at` transitions performed by a plain UPDATE, so the functions are the only path and the flag checks (`is_deletable`) live in one place.
- `card_field_versions`: SELECT as above; INSERT only via the security-definer writer; UPDATE/DELETE blocked by trigger.
- `card_templates` and `card_guidelines` have no `proposal_id`: `SELECT TO authenticated USING (true)`, write restricted to `public.is_global_admin(auth.uid())` (template administration).
- Child tables carry denormalised `proposal_id` so every policy is one function call with no joins.

## 18. Migration of the methodologies model

1. Create the new tables with GRANTs, RLS and triggers; seed `card_templates` for the Part B template type (all six sections) and the FSTP annex type.
2. Run `seed_proposal_cards` for every existing proposal (idempotent), creating the auto cards with their flags.
3. For each proposal, map `methodology_subsections` onto the seeded B1.2 narrative cards by `key`: copy `title`, `order_index`, `is_visible`, and copy `content_html` into the card's single field (`origin='auto'`).
4. `methodology_items` become `card_fields` of the single "Methodologies" card, preserving `order_index`, carrying `heading`, `content_html`, `assigned_participant_id`, `origin='manual'`. Case-placeholder items become fields with `origin='auto'` whose `source_key` marks the placeholder position, so the B1.2 reconciler still drops the cases table after the right run.
5. `methodology_linked_activities` **stays as its own relational table** and backs a source-fed table card in B1.2 (`kind='table'`, `is_source_fed=true`, `source_key='b12.linked_activities'`) projected at render time. It is a distinct data domain (activity records with year ranges) with its own editing UI; copying it into `card_table_*` would require rewriting `LinkedActivitiesTable.tsx` for no gain.
6. Backfill card visibility from the thirteen booleans (§10), then drop `seed_methodology_subsections()` and its trigger.
7. Leave `methodology_subsections`, `methodology_items`, `section_guidelines`, `table_column_widths` and the thirteen boolean columns in place read-only for one release; drop after verification.

## 19. Components to change or delete

**Must change**
- `MethodologiesPage.tsx`, `MethodologyItemsList.tsx`, `MethodologyRichEditor.tsx` — read cards/fields.
- `useMethodologySubsections.ts`, `useMethodologyItems.ts` → `useSectionCards` / `useCardFields`.
- `useB12MethodologyMirrorsReconciler.ts`, `src/lib/b12MethodologyRuns.ts`, `B12MethodologiesSlotContent.tsx`, `B12LinkedActivitiesSlotContent.tsx`.
- `B31TablesEditor.tsx`, `B31WPDescriptionTables.tsx`, `useB31SectionData.ts`, `useB31JustificationToggles.ts` (now writes card visibility), `B31OptionalJustificationsCard.tsx`.
- `ExpertiseMatrixCard.tsx` and the B3.2 renderers — write/read card visibility instead of `mirror_*`.
- `supabase/functions/generate-proposal-backups/index.ts` lines ~1408-1427 — read card visibility (§10).
- The two snapshot-restore migrations + `restore_in_scope_tables()`, `restore_scope_predicates()`, `capture_scope_predicates()`, `create_proposal_snapshot`, `restore_proposal_snapshot`, `preview_proposal_restore`.
- `printRenderer.tsx`, `useDocxExport.ts`, `usePdfExport.ts`, `esrPdfExport.ts` — shared table spec, caption-above, card ordering, annex document filter.
- `src/index.css` — table blocks removed in favour of `table-card.css`.
- `useColumnResize.ts` — writes `card_table_columns.width_px`.
- `captionRenumbering.ts`, `renumberCaptionsInEditor.ts` — card-aware table suffixes, caption above.
- `FormattingToolbar.tsx` — cell-alignment controls; `SubheadingDropdown` loses H3 options.
- `FstpTab.tsx` — annex export scoped by `document`.
- `FigureManager.tsx`, `FigureSizePicker.tsx`, `ResizableImage.tsx` — figure cards, canvas presets removed.
- `useSectionVisibility.ts`, `useSectionLocking.ts` — card-level visibility.
- `useProposalTemplateCreation.ts`, `create_proposal_with_role` — call `seed_proposal_cards`.
- Version-history panel — dual "field history" / "legacy section history" view.

**Can be deleted**
- `ImpactCanvasSection.tsx`, `ImpactCanvasGraphic.tsx`, `ImpactCanvasFreeformEditor.tsx`, `ImpactCanvasCellEditor.tsx`, `ImpactCanvasTextBox.tsx`, `ImpactCanvasTextToolbar.tsx`, `OverviewCanvasSection.tsx`, `OverviewCanvasSlotNodeView.tsx`.
- `useImpactCanvas.ts`, `useOverviewCanvasSlotReconciler.ts`; extensions `OverviewCanvasSlotNode.ts`, `CanvasFontSize.ts`, `CanvasHeader.ts`, `HeadingNumberLabel.ts`.
- `src/lib/impactCanvasLayout.ts`, `impactCanvasBoundStyle.ts`, `impactCanvasFocusedEditor.ts`, `impactCanvasTextSizing.ts`, `exportImpactCanvasToWord.ts`, `rasteriseCanvasFigure.tsx`, `canvasFigureSize.ts`, `canvasSize.tsx`, `canvasSelectionPreservation.ts`, `collapseStackedCanvasFontSize.ts`, `CanvasSizeContext.tsx`, `renumberH3Headings.ts`.
- `supabase/functions/generate-impact-pathway/index.ts` (and its `config.toml` entry).
- After the legacy window: `methodology_subsections`, `methodology_items`, `table_column_widths`, `section_guidelines`, the eight `b31_show_*` and five `mirror_*` columns, `proposals.impact_canvas_enabled`, `seed_methodology_subsections()`, `seed_impact_canvas_columns()`.

## 20. Open questions

1. **Sub-block cards inside 3.1.h / 3.1.i** — the four travel/equipment/other-goods rows are today merged into one rendered table. Should they be separate cards (as modelled, indices 1071-1074) whose rendered output merges, or one card with a jsonb visibility map? The former is more consistent but produces cards that never render standalone.
2. **Figure cards vs `figures.section_id`** — do Gantt/PERT keep their `figures` rows as the placement source, or does `card_figure` become authoritative and `figures.section_id` stop being read?
3. **Cases table placement** — the B1.2 cases table is currently positioned by a placeholder field inside the methodologies card. Should it become its own table card with a fixed position, retiring the placeholder mechanism?
4. **FSTP annex sections** — what section list does the new annex template type carry, and does the annex reuse the Part B numbering scheme for table captions or start its own sequence?
5. **Section-level recycle bin scope** — should the bin also list deleted table rows/columns and outcome entries, or is card + field the right granularity?
6. **Legacy history discoverability** — should legacy `section_versions` entries be restorable into a card field (as new content), or strictly read-only?
7. **`is_visible` and page counting** — do hidden cards count toward the Part B page limit estimate (`usePageEstimate.ts`)? Assumed no, but the lump-sum guidance interaction should be confirmed.
