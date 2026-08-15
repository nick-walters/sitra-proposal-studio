# Generic card model for the Part B editors — revision 3

Written proposal only. No code, migrations or data changes.

## 0. Decisions carried in from review

Round 1: all six Part B sections migrate to cards; `section_content` superseded for Part B; `section_versions` retained and always readable as legacy history; no cross-document move; the FSTP annex gets its own `template_types` row; source-fed cards strictly read-only; pre-deletion versions count against the retention cap; the B2.1 two-part table exports as two `<table>` elements with one caption above the first.

Round 2:
1. The 3.1.h / 3.1.i sub-blocks are separate cards, each with its own visibility toggle; their output merges into the parent table at render (§12.1).
2. `card_figure` is authoritative for placement; `figures` stays the asset record and `figures.section_id` is no longer read.
3. The B1.2 cases table keeps the placeholder mechanism, modelled as a field-level marker inside the methodologies card (§18.1).
4. FSTP annex section list — remains open, to be specified.
5. Recycle-bin granularity is card + field only.
6. Legacy `section_versions` is strictly read-only, never restorable into a card field.
7. Hidden cards do not count toward page-limit estimates, H3 numbering, or citation numbering.

## 1. Core idea

One `proposal_cards` table holds every card in every Part B editor and in the FSTP annex. A card belongs to a section from `proposal_template_sections`, has a `kind` discriminator, four independent constraint flags, and an order index. Payload lives in child tables, not jsonb (§2.8).

```text
card_templates ──(seed)──> proposal_cards <── proposal_template_sections
        |                        |
 card_guidelines           ├── card_fields ──── card_field_versions
 (via join table)          |        └── citation_instances ──> proposal_references
                           ├── card_table (+ columns / rows / cells)
                           ├── card_figure
                           ├── card_outcome_entries
                           └── card_deletions  (recycle bin ledger)
```

## 2. Proposed schemas

### 2.1 `proposal_cards`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK DEFAULT gen_random_uuid() | |
| proposal_id | uuid NOT NULL | FK `proposals(id)` ON DELETE CASCADE |
| section_id | uuid NOT NULL | FK `proposal_template_sections(id)` ON DELETE CASCADE |
| document | text NOT NULL DEFAULT 'part_b' | CHECK in ('part_b','fstp_annex'); immutable |
| kind | text NOT NULL | CHECK in ('text','figure','table','outcome_list','references') |
| template_key | text | stable key from `card_templates.key`; NULL for user-created cards |
| title | text NULL | genuinely nullable — NULL means "no H3 heading" (§14) |
| order_index | integer NOT NULL | §5 |
| anchor | text NOT NULL DEFAULT 'free' | CHECK in ('head','free','tail') — §5 |
| is_deletable | boolean NOT NULL DEFAULT true | flag 1 |
| is_hideable | boolean NOT NULL DEFAULT true | flag 2 |
| is_source_fed | boolean NOT NULL DEFAULT false | flag 3 |
| is_fixed_position | boolean NOT NULL DEFAULT false | flag 4 (true ⇔ `anchor <> 'free'`) |
| is_visible | boolean NOT NULL DEFAULT true | soft-hide |
| source_key | text | mirror source, e.g. `b31.deliverables` |
| render_group | text | merges rendered output into a parent card (§12.1) |
| origin | text NOT NULL DEFAULT 'manual' | CHECK ('auto','manual'); drives restore position |
| deleted_at / deleted_by | timestamptz / uuid | |
| created_at / updated_at | timestamptz NOT NULL DEFAULT now() | `update_updated_at_column` trigger |

- UNIQUE `(section_id, order_index)` DEFERRABLE INITIALLY DEFERRED.
- UNIQUE `(proposal_id, template_key)` WHERE `template_key IS NOT NULL` — makes seeding idempotent.
- Index `(proposal_id, section_id, deleted_at, order_index)`; partial index `(proposal_id) WHERE deleted_at IS NOT NULL`.
- Validation trigger: `is_fixed_position = true` ⇒ `is_deletable = false` and `anchor <> 'free'`; source-fed cards own no `card_fields` / `card_table_cells`; `document` and `kind` immutable.

### 2.2 `card_fields`

`id` PK; `card_id` FK `proposal_cards(id)` ON DELETE CASCADE; `proposal_id` (denormalised for RLS); `heading text NULL`; `content_html text`; `order_index int NOT NULL`; `field_role text NOT NULL DEFAULT 'narrative'` CHECK ('narrative','case_placeholder') — see §18.1; `placeholder_case_type_id uuid NULL` FK `proposal_case_types(id)`; `assigned_participant_id uuid` FK `participants(id)` ON DELETE SET NULL; `origin text NOT NULL DEFAULT 'manual'`; `deleted_at`, `deleted_by`, `deleted_with_card boolean NOT NULL DEFAULT false`; timestamps.

UNIQUE `(card_id, order_index)` deferrable; index `(card_id, deleted_at, order_index)`.

### 2.3 `card_field_versions`

`id` PK; `field_id` FK `card_fields(id)` ON DELETE RESTRICT; `proposal_id`; `version_number int`; `content_html`; `heading`; `is_auto_save boolean default true`; `created_by uuid`; `created_at`. UNIQUE `(field_id, version_number)`. Update/delete blocked by triggers mirroring `prevent_section_version_update` / `prevent_section_version_delete`.

### 2.4 Table cards

- `card_table` — `card_id` PK, `caption text`, `caption_suffix char(1)` (derived), `variant text NOT NULL DEFAULT 'standard'` CHECK ('standard','cases','wp_description'), `parts smallint NOT NULL DEFAULT 1`.
- `card_table_columns` — `id`, `card_id`, `part smallint DEFAULT 1`, `order_index`, `label_html`, `width_px integer`, `align_h`, `align_v`.
- `card_table_rows` — `id`, `card_id`, `part smallint DEFAULT 1`, `order_index`, `row_type text` CHECK ('header','body').
- `card_table_cells` — `id`, `proposal_id`, `row_id`, `column_id`, `content_html`, `align_h NULL`, `align_v NULL`, `colspan int default 1`, `rowspan int default 1`. UNIQUE `(row_id, column_id)`.

Column widths live on `card_table_columns.width_px`, replacing `table_column_widths.table_key` with the card id.

### 2.5 Figure cards

`card_figure` — `card_id` PK; `figure_id uuid` FK `figures(id)`; `float text` CHECK ('none','left','right'); `max_width_cm numeric`; `caption text`. Per decision 2, this row is **authoritative for placement**: the renderer resolves figures from cards only and stops reading `figures.section_id` (the column is retained but unused, dropped after the legacy window).

### 2.6 Outcome/impact cards (B2.1 list)

`card_outcome_entries` — `id`, `proposal_id`, `card_id`, `order_index`, `quote_html`, `label_a text`, `value_a_html`, `label_b text`, `value_b_html`, timestamps.

### 2.7 Recycle bin ledger

`card_deletions` — `id`, `proposal_id`, `section_id`, `target_type text` CHECK ('card','field'), `target_id uuid`, `parent_card_id uuid`, `deleted_at`, `deleted_by`, `purge_after timestamptz NULL`, `restored_at`, `restored_by`. Indexes `(proposal_id, restored_at, deleted_at)`, `(purge_after) WHERE restored_at IS NULL`. Per decision 5, only cards and fields are ledgered; table rows/columns and outcome entries are not separately restorable — they ride with their card.

### 2.8 Payload storage: child tables, not jsonb

1. Version history is per field; a jsonb blob versions the whole card.
2. Cross-ref chips, citation anchors and caption renumbering need stable FK targets.
3. Per-cell alignment, colspan and resizable columns are a direct relational fit.
4. RLS and GRANTs apply cleanly per table.

## 3. Constraint flags

| Case | deletable | hideable | source_fed | fixed | anchor |
|---|---|---|---|---|---|
| B3.1 / B3.2 intro free-text card | false | true | false | true | head |
| User-added card | true | true | false | false | free |
| Migrated methodology narrative subsections | false | true | false | false | free |
| B3.1 compulsory mirrored tables | false | false | true | true | tail |
| Cost-justification cards (from `b31_show_*`) | false | true | true | true | tail |
| B3.2 source-fed components (from `mirror_*`) | false | true | true | true | tail |
| References card (§15) | false | false | true | true | tail |

No fifth flag: "editable heading" is `is_source_fed` plus nullable `title`; "required non-empty" is a compliance-checker concern.

## 4. Document scope

`proposal_cards.document` CHECK `('part_b','fstp_annex')`, immutable. The FSTP annex has its own `template_types` row whose sections live in `proposal_template_sections`. The annex export in `FstpTab.tsx` selects `document = 'fstp_annex'` and skips page-limit accounting.

## 5. Ordering — two fixed anchors (corrected)

The previous version was self-contradictory. There are **two** fixed anchors per section:

- **Fixed head** — `anchor = 'head'`. Normally exactly one card (the intro free-text card): undeletable, hideable, always first.
- **Free band** — `anchor = 'free'`. Everything the user creates or that migrated from the methodologies model. Freely orderable among themselves.
- **Fixed tail** — `anchor = 'tail'`. The compulsory source-fed tables, figures and the references card, in template order, always last.

Index allocation per section:

| Anchor | Range | Seeding |
|---|---|---|
| head | 0–99 | 0, 10, 20… |
| free | 100–999 | new cards append at `max(free.order_index) + 1`, or 100 if none |
| tail | 1000+ | 1000, 1010, 1020… |

Drag rules, enforced client-side and by trigger:

- A free card's new index must satisfy `max(head.order_index) < idx < min(tail.order_index)`.
- **A free card may NOT be dragged above the fixed head card.** The head is a permanent first position; the drop zone above it is not a valid target and the drag preview refuses it.
- A free card may not be dropped between two tail cards, nor after the tail.
- Head and tail cards cannot be reordered at all — not among themselves, not out of their band.
- Hiding a card (`is_visible = false`) does not change its index; the head card stays the head even when hidden.
- Reorder writes the full ordered id list in one transaction against the deferrable unique constraint.

## 6. Deletion and recycle bin

**Who** — delete, restore and purge-now are all **coordinator-or-above**: `public.is_coordinator_or_above(auth.uid())` combined with `public.is_proposal_admin(auth.uid(), proposal_id)`; the UI gates on `useProposalRole.ts` `roleTier === 'coordinator'`. Editors edit content but cannot delete cards or fields. Every deletion goes through an AlertDialog "are you sure" confirmation naming the card or field.

**Delete** sets `deleted_at` / `deleted_by` and cascades a soft delete to the card's fields with `deleted_with_card = true`, inserting ledger rows. Nothing is physically removed, so all versions survive.

**Bin listing** — per section, behind a discrete recycle-icon button: cards, plus fields whose `deleted_with_card = false`. That flag is exactly how the bin distinguishes an individually deleted field from one that went down with its card.

**Restore**
- Card: clears `deleted_at` on the card and on all fields with `deleted_with_card = true`. Fields deleted individually before the card stay in the bin.
- Individually deleted field: restores into its original parent card.
- Field whose parent card is still deleted: restores the card first as one operation, warning "Restoring this field will also restore its card *X*".

**Restore position** — `origin='auto'` cards reinsert at their stored `order_index` relative to survivors (always landing back inside their own band), then indices normalise; `origin='manual'` cards restore at the bottom of the free band. Fields follow the same rule one level down: auto fields to their recorded index, manual fields as the card's last field.

**Retention and purge** — "submitted" is `proposals.status = 'submitted'`. A trigger sets `purge_after = now() + interval '30 days'` on unrestored ledger rows when status becomes 'submitted', clearing it if status reverts. Before submission `purge_after IS NULL` = indefinite retention. Purge runs on the existing cron surface (§16).

## 7. Version history and `section_versions`

- Per-field history in `card_field_versions`, written by a security-definer `insert_card_field_version` mirroring `insert_section_version`, thinned by a card-aware variant of `thin_section_versions`. Pre-deletion versions count against the cap; restore does not reset it.
- `section_versions` is retained and never hidden. The version-history panel shows "Field history" (new model) and "Legacy section history" (`section_versions`), the latter visible even once the section has cards, and per decision 6 **strictly read-only** — viewable and copyable by the user, never restorable into a card field.
- `section_content` is superseded for Part B: no longer written, read only by the legacy viewer.

## 8. Shared table style

**Location** — `src/lib/tableStyleSpec.ts` (tokens + helpers) plus `src/styles/table-card.css` imported once.

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

No bottom border under the final row (`tbody tr:last-child td { border-bottom: 0 }`); header repeat disabled with `thead { display: table-row-group }` in print CSS.

| Existing duplicate | Action |
|---|---|
| `src/index.css` block 1 (editor tables) | replaced by `table-card.css` |
| `src/index.css` block 2 (mirror/preview tables) | replaced by `table-card.css` |
| `CasesTableNodeView.tsx` | declared exception; imports font tokens only |
| `printRenderer.tsx` | switches to `tableStyleCss()` |
| WP description table (`B31WPDescriptionTables.tsx`) | declared exception |

**Alignment controls** — horizontal and vertical dropdowns shown only when the selection is inside a table cell; they write `card_table_cells.align_h/align_v`, falling back to column default then spec default.

**Captions** — rendered **above** the table as a preceding paragraph: bold-italic `Table N.N.x.` label plus italic caption. Suffix assigned per section in document order, recomputed on insert, reorder and restore. A two-part card carries one caption above part 1.

**Cross-references** — cells are sanitised with `CROSS_REF_RICH_TEXT_CONFIG` and hydrated with `hydrateRefBadges()`; chip rendering carries over unchanged. Compulsory tables auto-insert badge markup into designated columns on reconcile.

## 9. Impact canvas replacement

Delete `impact_canvas_columns`, `impact_canvas_rows`, `impact_canvas_elements`, `proposals.impact_canvas_enabled`, and `figures` rows with `figure_type='impact-canvas'`.

Replacement: one `kind='table'` card in B2.1 (`variant='standard'`, `parts=2`), flags `deletable=false, hideable=true, source_fed=false, fixed=true, anchor='tail'`, rendering one logical table in two stacked parts under a single caption **above part 1**:

- part 1: Target groups | Specific needs | Expected results
- part 2: DEC measures | Expected outcomes | Expected impacts

All six headings editable; one header row plus one empty body row per part by default; rows addable; no stakeholder grouping. Word export emits two `<table>` elements preceded by the one caption paragraph.

## 10. Checkbox migration — `b31_show_*` and `mirror_*`

Verified inventory on `proposals`: eight `b31_show_*` (default `false`) — `purchase_costs`, `travel_justification`, `equipment_justification`, `all_equipment_justification`, `other_goods_justification`, `other_direct_costs`, `fstp_justification`, `internally_invoiced_justification`; five `mirror_*` (default `true`) — `value_chain`, `industrial_involvement`, `infrastructure`, `contribution_resources`, `participation_justification`.

**Decision: the columns are dropped; `proposal_cards.is_visible` becomes the single source of truth.** Retaining them would recreate a dual system and risk preview/DOCX divergence. The A3 and A2 checkbox UIs stay where they are but write `is_visible` on the target card by `template_key`.

| Boolean | Card `template_key` | Section |
|---|---|---|
| b31_show_purchase_costs | `b31.purchase_costs_table` | B3.1 |
| b31_show_travel_justification | `b31.just_travel` | B3.1 |
| b31_show_equipment_justification | `b31.just_equipment` | B3.1 |
| b31_show_all_equipment_justification | `b31.just_equipment_all` | B3.1 |
| b31_show_other_goods_justification | `b31.just_other_goods` | B3.1 |
| b31_show_other_direct_costs | `b31.other_direct_costs_table` | B3.1 |
| b31_show_fstp_justification | `b31.just_fstp` | B3.1 |
| b31_show_internally_invoiced_justification | `b31.just_internally_invoiced` | B3.1 |
| mirror_value_chain | `b32.value_chain` | B3.2 |
| mirror_industrial_involvement | `b32.industrial_involvement` | B3.2 |
| mirror_infrastructure | `b32.infrastructure` | B3.2 |
| mirror_contribution_resources | `b32.contribution_resources` | B3.2 |
| mirror_participation_justification | `b32.participation_justification` | B3.2 |

Umbrella/forced-on semantics stay in `B31OptionalJustificationsCard.tsx` (subcontracting always on; equipment forced on above the 15% threshold), now writing card visibility. `useB31CostPresence` gating is unchanged. Backfill sets each card's `is_visible` from the column's current value before the columns are dropped.

**`generate-proposal-backups/index.ts:1408-1427`** — today it selects the eight `b31_show_*` columns and branches on them for the DOCX. It must instead read `proposal_cards (template_key, is_visible)` for `proposal_id = :id AND deleted_at IS NULL AND template_key LIKE 'b31.%'`, build a `Record<template_key, boolean>`, and replace each `proposal.b31_show_x` test with `visible['b31.x']`. The eight branches themselves are unchanged. During migration it falls back to the column when no card row exists, so backup runs never regress.

**Snapshot-restore migrations** — drop the eight columns from their copy lists, and add `proposal_cards` and the `card_*` children to `restore_in_scope_tables()` with `proposal_id`-scoped predicates in `restore_scope_predicates()` / `capture_scope_predicates()`; otherwise a restore reverts content but not visibility. Old snapshots carrying the columns must be ignored rather than error.

**`mirror_*` has no edge-function consumer** — confirmed; only `ExpertiseMatrixCard.tsx` and the B3.2 renderers read it.

## 11. Card templates

`card_templates`:

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| template_type_id | uuid NOT NULL | FK `template_types(id)` |
| section_source_id | uuid | FK `template_sections(id)`; resolved to the proposal's section at seed time |
| section_number | text NOT NULL | fallback matcher |
| document | text NOT NULL DEFAULT 'part_b' | |
| key | text NOT NULL | stable `template_key` |
| kind | text NOT NULL | |
| default_title | text NULL | |
| anchor | text NOT NULL DEFAULT 'free' | head / free / tail |
| order_index | integer NOT NULL | within its band |
| is_deletable / is_hideable / is_source_fed / is_fixed_position | boolean NOT NULL | |
| default_visible | boolean NOT NULL DEFAULT true | |
| source_key / render_group | text | |
| condition_budget_type | budget_type NULL | NULL = any |
| condition_uses_fstp | boolean NULL | NULL = any |
| default_fields | jsonb | `{heading, order_index, field_role}` seeds |
| default_table | jsonb | column labels, parts, initial rows |
| is_active | boolean NOT NULL DEFAULT true | |
| created_at / updated_at | timestamptz | |

UNIQUE `(template_type_id, key)`; index `(template_type_id, document, section_number, anchor, order_index)`.

**Seeding.** After a proposal's `proposal_template_sections` are materialised, a security-definer `seed_proposal_cards(p_proposal_id)`:
1. reads the proposal's template type, `budget_type` and `uses_fstp`;
2. selects active templates for that type where `condition_budget_type IS NULL OR = budget_type` and `condition_uses_fstp IS NULL OR = uses_fstp`;
3. joins each to the proposal's section by `section_source_id`, falling back to `section_number`;
4. inserts `proposal_cards` with `origin='auto'`, `template_key`, flags, `anchor`, band-appropriate `order_index`, `is_visible = default_visible`;
5. expands `default_fields` into `card_fields` and `default_table` into `card_table*`;
6. is idempotent via `ON CONFLICT (proposal_id, template_key) DO NOTHING`, so it doubles as a repair/backfill pass and handles FSTP being switched on later.

This **replaces `seed_methodology_subsections()`**: the five B1.2 narrative subsections become five `card_templates` rows, and the trigger is dropped.

## 12. Worked example A — B3.1

Section: the `proposal_template_sections` row for 3.1, `document='part_b'`.

| order_index | anchor | kind | template_key | title | del. | hide. | fed | source |
|---|---|---|---|---|---|---|---|---|
| 0 | head | text | `b31.intro` | (NULL) | false | true | false | authored |
| 100… | free | text | — | user-added narrative | true | true | false | authored |
| 1000 | tail | table | `b31.wp_list` | Table 3.1.a List of work packages | false | false | true | `wp_drafts` |
| 1010 | tail | table | `b31.wp_descriptions` | Table 3.1.b Work package descriptions | false | false | true | `wp_drafts` + `wp_draft_tasks` (variant `wp_description`) |
| 1020 | tail | table | `b31.deliverables` | Table 3.1.c List of deliverables | false | false | true | `wp_draft_deliverables` |
| 1030 | tail | table | `b31.milestones` | Table 3.1.d List of milestones | false | false | true | `proposal_milestones` |
| 1040 | tail | table | `b31.risks` | Table 3.1.e Critical risks | false | false | true | `proposal_risks` |
| 1050 | tail | table | `b31.person_months` | Table 3.1.f Summary of staff effort | false | false | true | `wp_draft_effort` |
| 1060 | tail | table | `b31.subcontracting` | Table 3.1.g Subcontracting costs | false | false (data-forced) | true | `budget_rows` + `budget_cost_justification_items` |
| 1070 | tail | table | `b31.purchase_costs_table` | Table 3.1.h Purchase costs | false | true | true | as above |
| 1071 | tail | table | `b31.just_travel` | (merged into 3.1.h) | false | true | true | as above |
| 1072 | tail | table | `b31.just_equipment` | (merged into 3.1.h) | false | true | true | as above |
| 1073 | tail | table | `b31.just_equipment_all` | (merged into 3.1.h) | false | true | true | as above |
| 1074 | tail | table | `b31.just_other_goods` | (merged into 3.1.h) | false | true | true | as above |
| 1080 | tail | table | `b31.other_direct_costs_table` | Table 3.1.i Other direct cost categories | false | true | true | as above |
| 1081 | tail | table | `b31.just_fstp` | (merged into 3.1.i) | false | true | true | as above |
| 1082 | tail | table | `b31.just_internally_invoiced` | (merged into 3.1.i) | false | true | true | as above |
| 1090 | tail | figure | `b31.gantt` | Gantt chart | false | true | true | `figures` via `card_figure` |
| 1100 | tail | figure | `b31.pert` | PERT chart | false | true | true | `figures` via `card_figure` |
| 1110 | tail | references | `b31.references` | References | false | false | true | §15 |

The expertise matrix is **not** here — it is B3.2.

### 12.1 How sub-block cards merge into their parent table

Sub-block cards carry `render_group = 'b31.purchase_costs_table'` (or `'b31.other_direct_costs_table'`). Rules:

- The **parent** card owns the caption, the column set and the header row.
- Each **sub-block** card projects zero or more body row groups from `budget_rows` + `budget_cost_justification_items` for its cost category, plus an optional category label row.
- At render, the renderer collects `[parent] ++ children ordered by order_index` where `is_visible = true`, and emits **one** `<table>`: parent header, then each visible child's rows in order. Hidden children contribute nothing and leave no gap.
- If the parent is hidden, nothing renders regardless of child visibility. If the parent is visible but every child is hidden, the parent renders an empty table — the UI warns the coordinator and offers to hide the parent instead.
- Sub-block cards never render standalone, are never draggable, and appear in the editor only as an indented visibility row under the parent. Each keeps its own `is_visible`, which is the point of modelling them as cards.
- Caption lettering counts parents only, so the merged table is a single `Table 3.1.h`.

## 13. Worked example B — B3.2

| order_index | anchor | kind | template_key | title | del. | hide. | fed | source |
|---|---|---|---|---|---|---|---|---|
| 0 | head | text | `b32.intro` | (NULL) | false | true | false | authored |
| 100… | free | text | — | user-added narrative | true | true | false | authored |
| 1000 | tail | table | `b32.participants` | Table 3.2.a Consortium participants | false | false | true | `participants` |
| 1010 | tail | table | `b32.expertise_matrix` | Table 3.2.b Expertise matrix | false | false | true | `expertise_matrix_rows/columns/cells` |
| 1020 | tail | text | `b32.value_chain` | Value chain coverage | false | true | true | `participant_descriptions` (`mirror_value_chain`) |
| 1030 | tail | text | `b32.industrial_involvement` | Industrial involvement | false | true | true | `participant_descriptions` |
| 1040 | tail | text | `b32.infrastructure` | Infrastructure | false | true | true | `participant_infrastructure` |
| 1050 | tail | text | `b32.contribution_resources` | Contribution and resources | false | true | true | `participant_descriptions` |
| 1060 | tail | text | `b32.participation_justification` | Justification of participation | false | true | true | `participant_descriptions` |
| 1070 | tail | references | `b32.references` | References | false | false | true | §15 |

Source-fed text cards render projected content and own no `card_fields`.

## 14. Guidelines attached to cards (corrected — many-to-many)

Three tables:

**`card_guidelines`** — the guidance text, authored once:

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| guideline_type | text NOT NULL | CHECK ('evaluation','commission','sitra') → orange / blue / black |
| title | text | |
| content | text NOT NULL | |
| order_index | integer NOT NULL | display order within a card |
| condition_budget_type | budget_type NULL | lump sum vs actual costs |
| condition_uses_fstp | boolean NULL | |
| is_active | boolean NOT NULL DEFAULT true | |
| created_at / updated_at | timestamptz | |

**`card_guideline_templates`** — the join, so one guideline attaches to many cards:

`id` PK; `guideline_id` FK `card_guidelines(id)` ON DELETE CASCADE; `card_template_id` FK `card_templates(id)` ON DELETE CASCADE; `order_index int` (per-card override of display order). UNIQUE `(guideline_id, card_template_id)`; index `(card_template_id, order_index)`.

**`card_guideline_sections`** — optional second join for section-wide guidance shown on every card in a section: `guideline_id`, `section_source_id` FK `template_sections(id)`. UNIQUE `(guideline_id, section_source_id)`.

- An evaluation criterion covering several themes is now **one row** in `card_guidelines` with several join rows — no duplicated text, and editing it updates every card that shows it.
- The three sources stay visually distinct exactly as today; `guideline_type` drives the colour token, no per-row colour stored.
- Funding-mode conditionality lives on the guideline row (`condition_budget_type`), so lump-sum page limits and recommendations swap automatically.
- Guidance is authored against card **templates**, not per-proposal instances; the panel resolves it at read time by `template_key` filtered on the proposal's budget type and FSTP flag. User-created cards inherit only section-wide guidance.
- Existing `section_guidelines` rows migrate into `card_guidelines` + `card_guideline_sections`, or + `card_guideline_templates` where clearly card-specific. `section_guidelines` is retained read-only for one release then dropped.

**`title` nullability** — yes, `proposal_cards.title` is genuinely nullable. NULL = no H3 heading (never had one, or deleted). Empty string is not used; the earlier `title_deleted` boolean is removed as redundant.

## 15. Citations and references

### 15.1 How citations work today (reported before proposing)

- **Storage of the bibliography**: table `public.references` — `id`, `proposal_id`, `citation_number int`, `doi`, `authors text[]`, `year`, `title`, `journal`, `volume`, `pages`, `formatted_citation`, `verified`, timestamps. Read/written by `src/hooks/useProposalReferences.ts`, which allocates `citation_number` as `max + 1` per proposal. There is also an unused `section_footnotes` table (present in generated types, no `src/` consumer).
- **In-document representation**: `src/components/CitationMark.tsx` defines **both** a `CitationNode` (inline atom, `<sup data-citation="N">N</sup>`) and a legacy `CitationMark` (a mark on `<sup>` with the same attribute), plus an adjacency ProseMirror plugin that adds `citation-adjacent` for the comma between consecutive citations, and a hover tooltip plugin. So the stored HTML inside `section_content` is a `<sup data-citation="N">` element, where **N is the stable DB `citation_number`, not the display number**.
- **Display numbering today**: `src/hooks/useGlobalCitationOrder.ts` reads every `section_content` row for the proposal, regex-scans for `data-citation` / numeric `<sup>`, orders sections by `localeCompare` numeric on `section_id`, and builds a `displayMap: Map<dbNumber, displayNumber>` by order of first appearance. So dynamic proposal-wide numbering **already exists in principle**, keyed off whole-section HTML.
- **Footnote rendering**: `src/components/FootnoteCitation.tsx` renders a single reference on one line with title truncation; used for the per-page/per-section footnote strip. Neither `useDocxExport.ts` nor `usePdfExport.ts` currently emits real footnotes — grep for "footnote" in both returns nothing.

### 15.2 Proposed schema

**`proposal_references`** (rename/replacement of `references`, same shape plus):

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| proposal_id | uuid NOT NULL | |
| ref_key | integer NOT NULL | stable internal id (today's `citation_number`) — never displayed |
| doi, authors, year, title, journal, volume, pages, formatted_citation, verified | as today | |
| created_at / updated_at | timestamptz | |

UNIQUE `(proposal_id, ref_key)`. Renaming `citation_number` → `ref_key` makes the "stable id, not display number" distinction explicit in code.

**`citation_instances`** — one row per occurrence, anchored to the field:

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| proposal_id | uuid NOT NULL | |
| reference_id | uuid NOT NULL | FK `proposal_references(id)` ON DELETE CASCADE |
| field_id | uuid | FK `card_fields(id)` ON DELETE CASCADE — narrative citations |
| cell_id | uuid | FK `card_table_cells(id)` ON DELETE CASCADE — citations in table cells |
| card_id | uuid NOT NULL | denormalised, for fast section/order joins |
| position | integer NOT NULL | character offset of the anchor within the field/cell HTML |
| created_at | timestamptz | |

CHECK exactly one of `field_id` / `cell_id` is non-null. Index `(proposal_id, card_id, position)`, index `(reference_id)`.

`citation_instances` is a **derived index, not the source of truth** — the authoritative anchor remains the `<sup data-citation="<ref_key>">` node inside the field HTML, so copy/paste, undo and track-changes keep working with no new editor plumbing. A debounced reconciler rewrites the rows for a field whenever its HTML is saved (same pattern as the existing badge reconcilers). This keeps numbering computable with one query instead of regex-scanning every field.

### 15.3 Numbering computation

A single pure module, `src/lib/citationNumbering.ts`, is the only place numbers are computed. It takes the ordered card tree and returns `Map<ref_key, displayNumber>` plus per-scope lists.

Order of first citation:
`section.order_index` → `card.order_index` (head, then free, then tail) → `field.order_index` (or table row/column order for cells) → `position` within the field.

Rules:
- Numbers are **never stored**; every consumer calls the module.
- A reference cited more than once always reuses its first-assigned number.
- **Hidden cards are skipped entirely** — they consume no numbers, consistent with page estimates and H3 numbering. A reference cited only in hidden cards gets **no number** and is listed as unnumbered in the editor's references list (rendered with an em dash in place of the number and a muted tooltip "not currently cited in visible content").
- Deleting the only citation of a reference removes it from the sequence and everything after renumbers, live.
- Cards in the recycle bin are excluded like hidden cards.
- The reference entry itself survives deletion of its citations; it stays in the library until explicitly removed.

Implementation shape: a `useCitationNumbering(proposalId)` hook over a `['citation-numbering', proposalId]` TanStack query joining `citation_instances` to cards/fields with the visibility and order predicates, memoised, invalidated by the same reconciler that writes the instances. `useGlobalCitationOrder.ts` is replaced by this module; its `section_content` regex path is retired with Part B.

### 15.4 The references card

Each Part B section ends with a `kind='references'` card: `template_key = '<section>.references'`, `anchor='tail'`, `is_deletable=false`, `is_hideable=false`, `is_source_fed=true`, `is_visible=true` always. It owns no fields.

- It lists every reference cited **anywhere in that section's visible cards**, sorted by display number ascending — including references whose first citation was in a different section (they show their proposal-wide number, which may be lower than any number first assigned in this section).
- References cited only in hidden cards of this section appear unnumbered at the end of the list.
- Entries render with `formatted_citation` through `FootnoteCitation`-style single-line formatting, with a link to jump to the first citation in this section.
- **Subsection previews** (continuous scroll) apply the identical rule: every reference cited in that subsection, with proposal-wide numbers.
- Because it is a card, it participates in ordering and export like any other, but it can never be dragged, hidden or deleted.

## 16. Per-page footnotes — feasibility report

### 16.1 DOCX — supported, straightforward

`docx` (project uses `^9.5.3`) has first-class footnote support: `new Document({ footnotes: { 1: { children: [new Paragraph({ children: [new TextRun(...)] })] }, … } })` and `new FootnoteReferenceRun(1)` placed inline in the paragraph run sequence. Word itself performs the page-bottom placement, numbering display and reflow, so "footnote at the foot of the page where first cited" is satisfied by construction — the exporter never has to know page geometry.

How `useDocxExport.ts` would emit it:
1. Compute the display map with `citationNumbering.ts` over the visible card tree.
2. Walk the export tree; the **first** occurrence of each `ref_key` emits `new FootnoteReferenceRun(displayNumber)`; every later occurrence emits a plain superscript `TextRun(String(displayNumber), { superScript: true })` so it links visually but does not create a second footnote.
3. Build the `footnotes` map keyed by display number, each containing the formatted citation as a paragraph in the footnote style (8pt, line-height 0.9, matching `FootnoteCitation`).
4. The references card exports as a normal list at the end of its section, unchanged.

### 16.2 PDF (current path) — not achievable

`usePdfExport.ts` builds a self-contained HTML string and prints it through a hidden iframe / `window.open` using Chrome's print engine. Chrome/Blink implements neither `float: footnote` nor the CSS Generated Content for Paged Media footnote area, and exposes no page-break callbacks, so **per-page footnotes are impossible on that path**. Today the export produces no footnotes at all, so nothing regresses — but the requirement cannot be met without changing the pipeline.

Alternatives evaluated:

| Option | Footnote support | Migration cost | Notes |
|---|---|---|---|
| (i) Paged.js | **Yes, verified** — Paged.js implements `float: footnote` with `::footnote-call` / `::footnote-marker` and footnote counters; its issue tracker shows the feature is live but rough (open issues on multi-paragraph footnotes, superscript markers, counter resets, multi-column) | Medium: add the polyfill, restructure the print HTML into a Paged.js-driven container, re-verify every table/figure break rule, keep the existing Chrome print as fallback | Runs client-side, keeps everything in the browser, no new backend surface; visual QA burden is real |
| (ii) Server-side rendering in an edge function | Yes, if the renderer supports it (a Chromium-based renderer inherits the same limitation unless paired with Paged.js server-side; a true paged engine like WeasyPrint/Prince does support footnotes natively) | High: new function, font packaging, asset/auth plumbing for private storage URLs, cold-start latency, and a second rendering codebase to keep in sync with the preview | Best fidelity ceiling, worst maintenance cost |
| (iii) DOCX → PDF headless conversion | Yes, inherited from Word's own layout | Medium-high: requires a converter service (LibreOffice headless or a paid API) — no such dependency exists today; output styling drifts from the HTML preview | Guarantees DOCX/PDF parity, which is attractive given DOCX is the primary submission format |

**Recommendation: (i) Paged.js**, with (iii) as a later parity play if DOCX/PDF divergence becomes a complaint. Paged.js keeps rendering in the browser next to the existing preview code, needs no backend, and — importantly — the same engine then powers the full Part B preview (below), so one investment fixes both surfaces. Its known footnote bugs are all in areas this document avoids (single-paragraph footnotes, single-column body).

### 16.3 Full Part B preview (HTML in the browser)

Without a pagination engine the browser has no page concept, so per-page footnotes are impossible there too. Two states:

- **Before Paged.js lands**: the preview renders citations as superscript numbers and shows the section's references card at the end of each section — i.e. per-section references rather than per-page footnotes. This is stated in the preview header so users are not surprised by the DOCX differing.
- **After Paged.js lands**: the preview runs through the same Paged.js pass as the PDF export and shows true per-page footnotes, so preview, PDF and DOCX agree.

## 17. Cron surface — verified

Both `pg_cron` and `pg_net` are installed, and `cron.job` already holds two jobs:

| jobid | jobname | schedule | target |
|---|---|---|---|
| 2 | `proposal-backups-hourly-helsinki-gate` | `0 * * * *` | `functions/v1/generate-proposal-backups` via `net.http_post` |
| 3 | `deadline-reminders-daily` | `0 8 * * *` | `functions/v1/deadline-reminders` via `net.http_post` |

The purge reuses this pattern: a third job, e.g. `card-recycle-bin-purge-daily` at `30 3 * * *`, posting to a new `purge-deleted-cards` function that calls a security-definer `purge_deleted_cards()` deleting versions, then fields/cells, then cards, then ledger rows where `purge_after < now() AND restored_at IS NULL`. No new infrastructure. Like `deadline-reminders` it runs with `verify_jwt = false` and authenticates the caller with a shared secret header.

## 18. RLS sketch

For every new per-proposal table (`proposal_cards`, `card_fields`, `card_field_versions`, `card_table*`, `card_figure`, `card_outcome_entries`, `card_deletions`, `proposal_references`, `citation_instances`):

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

- **No `DELETE` grant to `authenticated`** — hard delete belongs to `service_role` (the purge job) only. Exception: `citation_instances` is machine-maintained, so its writes happen through the security-definer reconciler rather than direct client DML.
- Soft delete, restore and purge-now are **coordinator-or-above**, via security-definer `soft_delete_card`, `soft_delete_card_field`, `restore_card`, `restore_card_field`, `purge_proposal_bin`, each guarded by `IF NOT (public.is_coordinator_or_above(auth.uid()) AND public.is_proposal_admin(auth.uid(), p_proposal_id)) THEN RAISE EXCEPTION …`. A trigger refuses `deleted_at` transitions from a plain UPDATE, so the functions are the only path and the `is_deletable` checks live in one place.
- `card_field_versions`: SELECT as above; INSERT only via the security-definer writer; UPDATE/DELETE blocked by trigger.
- Catalogue tables (`card_templates`, `card_guidelines`, `card_guideline_templates`, `card_guideline_sections`) have no `proposal_id`: `SELECT TO authenticated USING (true)`, writes restricted to `public.is_global_admin(auth.uid())`.
- Child tables carry denormalised `proposal_id` so every policy is one function call with no joins.

## 19. Migration of the methodologies model

1. Create the new tables with GRANTs, RLS and triggers; seed `card_templates` for the Part B template type (all six sections, including each section's references card) and the FSTP annex type.
2. Run `seed_proposal_cards` for every existing proposal (idempotent).
3. Map `methodology_subsections` onto the seeded B1.2 narrative cards by key: copy `title`, `order_index`, `is_visible`, and `content_html` into the card's single field (`origin='auto'`).
4. `methodology_items` become `card_fields` of the single "Methodologies" card, preserving `order_index`, `heading`, `content_html`, `assigned_participant_id`, `origin='manual'`.
5. Backfill card visibility from the thirteen booleans (§10); backfill `citation_instances` by scanning migrated field HTML for `data-citation`.
6. Drop `seed_methodology_subsections()` and its trigger.
7. Keep `methodology_subsections`, `methodology_items`, `section_guidelines`, `table_column_widths`, the thirteen boolean columns and `figures.section_id` read-only for one release, then drop.

### 18.1 Cases-table placeholder (decision 3)

The B1.2 cases table stays positional-by-placeholder because its location depends on which run of methodology items precedes it — something a fixed-position card cannot express. Model:

- A placeholder is a `card_fields` row inside the methodologies card with `field_role = 'case_placeholder'` and `placeholder_case_type_id` naming the case type. It carries its own `content_html` (the intro text shown above the table) and its own `order_index`, so it is dragged among the narrative fields exactly as today.
- The renderer walks the card's visible fields in order; on a `case_placeholder` field it emits the intro text and then the cases table for that case type, projected from `case_drafts`. Everything after continues in order.
- The B1.2 mirror reconciler keeps its existing behaviour of moving the `casesTable` node immediately after the corresponding run — the run boundary is now "the placeholder field", which is more robust than the current heuristic.
- Placeholder fields are `origin='auto'`, are not individually deletable (they disappear when the case type is removed), and are excluded from the recycle bin.

### 18.2 `methodology_linked_activities`

Stays as its own relational table and backs a source-fed table card in B1.2 (`kind='table'`, `is_source_fed=true`, `source_key='b12.linked_activities'`) projected at render time. It is a distinct data domain (activity records with year ranges) with its own editing UI; copying it into `card_table_*` would mean rewriting `LinkedActivitiesTable.tsx` for no gain.

## 20. H3 numbering toggle

- New column `proposals.h3_numbering_enabled boolean NOT NULL DEFAULT false`, proposal-wide, applying to every card H3 in both documents.
- Off: the title renders as plain H3 text. On: the renderer prefixes `<section_number>.<n>` computed at render time from live card order — never stored — so toggling is instant and lossless and reordering renumbers. Hidden cards are skipped; titleless cards are skipped.
- Word/PDF export applies the same computation, so previews and exports agree.
- Zero stored content uses the numbered-H3 representation, so `HeadingNumberLabel` and the `SubheadingDropdown` H3 options retire with **no migration**.

## 21. Components to change or delete

**Must change**
- `MethodologiesPage.tsx`, `MethodologyItemsList.tsx`, `MethodologyRichEditor.tsx` — read cards/fields.
- `useMethodologySubsections.ts`, `useMethodologyItems.ts` → `useSectionCards` / `useCardFields`.
- `useB12MethodologyMirrorsReconciler.ts`, `src/lib/b12MethodologyRuns.ts`, `B12MethodologiesSlotContent.tsx`, `B12LinkedActivitiesSlotContent.tsx` — placeholder fields (§18.1).
- `B31TablesEditor.tsx`, `B31WPDescriptionTables.tsx`, `useB31SectionData.ts`, `useB31JustificationToggles.ts`, `B31OptionalJustificationsCard.tsx` — card visibility, merged sub-blocks.
- `ExpertiseMatrixCard.tsx` and B3.2 renderers — card visibility instead of `mirror_*`.
- `supabase/functions/generate-proposal-backups/index.ts` (~1408-1427) + footnote emission.
- The two snapshot-restore migrations and `restore_in_scope_tables()`, `restore_scope_predicates()`, `capture_scope_predicates()`, `create_proposal_snapshot`, `restore_proposal_snapshot`, `preview_proposal_restore`.
- `printRenderer.tsx`, `useDocxExport.ts` (footnotes), `usePdfExport.ts` (Paged.js), `esrPdfExport.ts`.
- `src/index.css` — table blocks removed in favour of `table-card.css`.
- `useColumnResize.ts` — writes `card_table_columns.width_px`.
- `captionRenumbering.ts`, `renumberCaptionsInEditor.ts` — card-aware suffixes, caption above.
- `FormattingToolbar.tsx` — cell-alignment controls; `SubheadingDropdown` loses H3 options.
- `FstpTab.tsx` — annex export scoped by `document`.
- `FigureManager.tsx`, `FigureSizePicker.tsx`, `ResizableImage.tsx` — `card_figure` authoritative.
- `useSectionVisibility.ts`, `useSectionLocking.ts` — card-level visibility.
- `useProposalTemplateCreation.ts`, `create_proposal_with_role` — call `seed_proposal_cards`.
- `useProposalReferences.ts` — `proposal_references`, `ref_key` naming; `CitationMark.tsx` — display number from the numbering module rather than the raw attribute; `FootnoteCitation.tsx` — reused by the references card.
- Version-history panel — dual field/legacy view, legacy read-only.

**Can be deleted**
- `ImpactCanvasSection.tsx`, `ImpactCanvasGraphic.tsx`, `ImpactCanvasFreeformEditor.tsx`, `ImpactCanvasCellEditor.tsx`, `ImpactCanvasTextBox.tsx`, `ImpactCanvasTextToolbar.tsx`, `OverviewCanvasSection.tsx`, `OverviewCanvasSlotNodeView.tsx`.
- `useImpactCanvas.ts`, `useOverviewCanvasSlotReconciler.ts`, `useGlobalCitationOrder.ts`; extensions `OverviewCanvasSlotNode.ts`, `CanvasFontSize.ts`, `CanvasHeader.ts`, `HeadingNumberLabel.ts`.
- `src/lib/impactCanvasLayout.ts`, `impactCanvasBoundStyle.ts`, `impactCanvasFocusedEditor.ts`, `impactCanvasTextSizing.ts`, `exportImpactCanvasToWord.ts`, `rasteriseCanvasFigure.tsx`, `canvasFigureSize.ts`, `canvasSize.tsx`, `canvasSelectionPreservation.ts`, `collapseStackedCanvasFontSize.ts`, `CanvasSizeContext.tsx`, `renumberH3Headings.ts`.
- The legacy `CitationMark` mark in `CitationMark.tsx` (the node stays) once stored HTML is normalised to `CitationNode`.
- `supabase/functions/generate-impact-pathway/index.ts` and its `config.toml` entry.
- After the legacy window: `methodology_subsections`, `methodology_items`, `table_column_widths`, `section_guidelines`, `section_footnotes` (already unused), the eight `b31_show_*` and five `mirror_*` columns, `proposals.impact_canvas_enabled`, `figures.section_id`, `seed_methodology_subsections()`, `seed_impact_canvas_columns()`.

## 22. Open questions

1. **FSTP annex section list** — to be specified: which sections the annex template type carries, and whether its table/figure captions continue the Part B sequence or start their own.
2. **Multiple head cards** — is one fixed head per section always enough, or should the model allow an ordered head band (e.g. an intro plus a compulsory summary table above the free band)? The schema allows it; the templates currently assume one.
3. **Citation anchors in source-fed content** — mirrored tables project from draft tables (`wp_drafts`, `proposal_risks`, …) whose text can contain citations authored elsewhere. Do those citations participate in proposal-wide numbering, and if so, what is their "position" for ordering purposes?
4. **Unnumbered references in export** — a reference cited only in hidden cards is unnumbered in the editor. Should it be omitted from DOCX/PDF entirely, or listed at the end of the bibliography without a number?
5. **References card in the FSTP annex** — does the annex get its own references card with its own sequence, or does it share the Part B proposal-wide numbering?
6. **Paged.js rollout order** — does the pagination engine land before or after the card migration? Doing it after keeps the migration smaller; doing it first means the preview and PDF agree from day one.
7. **Reference deletion policy** — when a reference's last citation disappears, should the library entry be flagged for cleanup after some period, or retained silently forever?
