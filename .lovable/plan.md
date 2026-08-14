# Generic card model for the Part B editors

A written proposal. No code, migrations or data changes are included here.

## 1. Core idea

One `proposal_cards` table holds every card in every Part B editor (and in the FSTP annex). A card belongs to a section from `proposal_template_sections`, has a `kind` discriminator, four independent constraint flags, and an order index. Card payload lives in child tables, not jsonb (argued in section 3). Fields, versions and the recycle bin hang off cards.

```text
proposal_template_sections
        |
        v
   proposal_cards ──┬── card_fields ──── card_field_versions
                    ├── card_table (+ card_table_columns / rows / cells)
                    ├── card_figure
                    └── card_outcome_entries
                    └── card_deletions (recycle bin ledger)
```

## 2. Proposed schemas

### 2.1 `proposal_cards`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| proposal_id | uuid NOT NULL | FK `proposals(id)` on delete cascade |
| section_id | uuid NOT NULL | FK `proposal_template_sections(id)` on delete cascade |
| document | text NOT NULL DEFAULT 'part_b' | CHECK in ('part_b','fstp_annex') |
| kind | text NOT NULL | CHECK in ('text','figure','table','outcome_list') |
| title | text | H3 heading text; NULL when the H3 was deleted |
| title_deleted | boolean NOT NULL DEFAULT false | distinguishes "no heading" from "empty heading" |
| order_index | integer NOT NULL | see section 5 |
| is_deletable | boolean NOT NULL DEFAULT true | flag 1 |
| is_hideable | boolean NOT NULL DEFAULT true | flag 2 |
| is_source_fed | boolean NOT NULL DEFAULT false | flag 3; true = read-only mirror |
| is_fixed_position | boolean NOT NULL DEFAULT false | flag 4 |
| is_visible | boolean NOT NULL DEFAULT true | soft-hide (replaces `methodology_subsections.is_visible`) |
| source_key | text | for source-fed cards: which mirror feeds it, e.g. `b31.effort_table` |
| origin | text NOT NULL DEFAULT 'manual' | CHECK in ('auto','manual'); drives restore position |
| deleted_at | timestamptz | NULL = live; non-NULL = in recycle bin |
| deleted_by | uuid | |
| created_at / updated_at | timestamptz NOT NULL DEFAULT now() | `update_updated_at_column` trigger |

Constraints and indexes:
- UNIQUE `(section_id, order_index)` DEFERRABLE INITIALLY DEFERRED (reorder writes in one transaction; keeps the negative-swap strategy unnecessary).
- Index `(proposal_id, section_id, deleted_at, order_index)`.
- Partial index `(proposal_id) WHERE deleted_at IS NOT NULL` for the bin.
- Validation trigger (not CHECK): a card with `is_fixed_position = true` must also have `is_deletable = false`; a source-fed card cannot have authored fields written to it.

### 2.2 `card_fields` (payload for `kind = 'text'`, and the narrative field of other kinds)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| card_id | uuid NOT NULL | FK `proposal_cards(id)` on delete cascade |
| proposal_id | uuid NOT NULL | denormalised for RLS speed |
| heading | text | H4 heading; NULL when deleted/none |
| heading_deleted | boolean NOT NULL DEFAULT false | |
| content_html | text | sanitised rich text |
| order_index | integer NOT NULL | |
| assigned_participant_id | uuid | FK `participants(id)` on delete set null (carries today's methodology assignment) |
| origin | text NOT NULL DEFAULT 'manual' | 'auto' \| 'manual' |
| deleted_at | timestamptz | |
| deleted_by | uuid | |
| deleted_with_card | boolean NOT NULL DEFAULT false | see recycle bin |
| created_at / updated_at | timestamptz | |

UNIQUE `(card_id, order_index)` deferrable; index `(card_id, deleted_at, order_index)`.

### 2.3 `card_field_versions`

| Column | Type |
|---|---|
| id | uuid PK |
| field_id | uuid NOT NULL FK `card_fields(id)` **ON DELETE RESTRICT** |
| proposal_id | uuid NOT NULL |
| version_number | integer NOT NULL |
| content_html | text |
| heading | text |
| is_auto_save | boolean NOT NULL DEFAULT true |
| created_by | uuid |
| created_at | timestamptz NOT NULL DEFAULT now() |

UNIQUE `(field_id, version_number)`. Update/delete blocked by triggers mirroring `prevent_section_version_update` / `prevent_section_version_delete`. Because deletion is soft (`deleted_at`), RESTRICT never fires in normal use; only purge deletes versions, and it does so explicitly first.

### 2.4 Table cards

- `card_table` — one row per table card: `card_id` PK, `caption text`, `caption_label_suffix char(1)` (derived, see 8), `header_repeat boolean default false`, `variant text default 'standard'` (`standard` \| `cases` \| `wp_description` for the two exceptions).
- `card_table_columns` — `id`, `card_id`, `order_index`, `label_html`, `width_px integer`, `align_h`, `align_v` (column defaults).
- `card_table_rows` — `id`, `card_id`, `order_index`, `row_type text` ('header' | 'body'), `part smallint default 1` (supports the two stacked parts of the B2.1 canvas replacement under one caption).
- `card_table_cells` — `id`, `row_id`, `column_id`, `content_html`, `align_h text`, `align_v text` (NULL = inherit default), `colspan`, `rowspan`.

Column widths persist here, replacing `table_column_widths.table_key` with `card_table_columns.card_id` + `order_index`. `table_column_widths` is retained read-only for legacy editor tables until those are migrated, then dropped.

### 2.5 Figure cards

`card_figure` — `card_id` PK, `figure_id uuid` FK `figures(id)`, `float text` ('none'|'left'|'right'), `max_width_cm numeric`, `caption text`. The existing `figures` table stays as the asset/store record; the card is the placement.

### 2.6 Outcome/impact cards (B2.1 list)

`card_outcome_entries` — `id`, `card_id`, `order_index`, `quote_html`, `label_a text`, `value_a_html`, `label_b text`, `value_b_html`, timestamps. Labels are per entry so the two sub-fields can be renamed.

### 2.7 Recycle bin ledger

`card_deletions` — `id`, `proposal_id`, `section_id`, `target_type text` ('card'|'field'), `target_id uuid`, `parent_card_id uuid` (fields only), `deleted_at`, `deleted_by`, `purge_after timestamptz` (NULL until submitted), `restored_at`, `restored_by`. Index `(proposal_id, restored_at, deleted_at)`, index `(purge_after) WHERE restored_at IS NULL`.

The ledger is the bin's read model; `deleted_at` on the row itself is the authoritative live/dead switch. Only ledger rows with `target_type='card'`, or `target_type='field'` where the field's `deleted_with_card = false`, are listed — that is how the bin distinguishes an individually deleted field from one that went down with its card.

### 2.8 Payload storage: child tables, not jsonb

Recommendation: **child tables**. Reasons:
1. Version history is per field. Versioning a jsonb blob means the whole card versions together, which conflicts with requirement G.
2. Cross-reference integrity: cells and fields are referenced by cross-ref chips and by figure/table renumbering; a jsonb path is not a stable FK target.
3. Table cells need per-cell alignment, colspan and resizable columns — relational shape is a direct fit and lets the mirror query only what it renders.
4. RLS and grants apply per table cleanly; jsonb would push authorisation into application code.
The cost is more tables; that is acceptable given the editors already query relationally.

## 3. Constraint flags

Four independent booleans: `is_deletable`, `is_hideable`, `is_source_fed`, `is_fixed_position`.

| Case | deletable | hideable | source_fed | fixed_position |
|---|---|---|---|---|
| B3.1 compulsory mirrored cards (effort, deliverables, milestones) | false | false | true | true |
| B3.1 undeletable-but-hideable free-text top card | false | true | false | true |
| B3.2 source-fed cards (consortium tables from participants) | false | true | true | true |
| Methodology narrative subsections (migrated) | false | true | false | false |
| User-added methodology item | true | true | false | false |

No fifth flag is needed. Two candidates were considered and rejected:
- "Editable heading" — expressible as `is_source_fed` (source-fed ⇒ heading is managed) plus the per-card `title_deleted`.
- "Required non-empty" — a validation concern belonging to the compliance checker, not to card structure.

## 4. Document scope

`proposal_cards.document` with CHECK `('part_b','fstp_annex')`. A card's document is fixed at creation and cannot be changed by drag (a move between documents is a delete + create). Section catalogues stay per document: FSTP annex sections live in `proposal_template_sections` with their own template rows, so `document` is technically derivable from the section — it is stored on the card anyway as a denormalised guard so the annex export can filter with one predicate and so a mis-parented card is detectable. The annex export (the buttons in `FstpTab.tsx`) selects `document = 'fstp_annex'` and skips page-limit accounting entirely.

## 5. Ordering with fixed cards

Invariant: within a section, all cards with `is_fixed_position = true` form one contiguous **fixed block** that always sits at the bottom of the section, in a fixed relative order set by the template.

- `order_index` is a plain integer, unique per section.
- Fixed cards are seeded at high indices (e.g. 1000, 1010, 1020…) with a 10-step gap.
- New cards append at `max(order_index of non-fixed) + 1`, always below the free cards and above the fixed block.
- Drag rules enforced both client-side and by a DB trigger: a free card's new index must be `< min(fixed.order_index)`; fixed cards may not be reordered at all; no free card may land strictly between two fixed cards.
- Reorder writes the full ordered id list in one transaction against the deferrable unique constraint, replacing today's negative-swap workaround.

## 6. Deletion and recycle bin

**Delete** sets `deleted_at`/`deleted_by` on the card (and cascades a soft delete to its fields with `deleted_with_card = true`), and inserts ledger rows. Nothing is physically removed, so all versions survive.

**Bin listing** (per section, behind a discrete recycle icon in the section chrome): cards, plus fields whose `deleted_with_card = false`.

**Restore**
- Card: clears `deleted_at` on the card and on every field where `deleted_with_card = true`; the card reappears with its most recent field content and full version history. Fields that had been deleted individually before the card went stay in the bin.
- Individually deleted field: clears `deleted_at`, re-parents into its original card.
- Field whose parent card is still deleted: the restore action restores the card first, as one operation, and warns the user ("Restoring this field will also restore its card *X*"). No orphan fields; no synthetic parent card.

**Restore position**
- Cards: `origin = 'auto'` restores to its original slot relative to survivors — reinsert at the stored `order_index`, then normalise indices; `origin = 'manual'` restores at the bottom of the free block for the user to drag.
- Fields: the same rule one level down. An auto field returns to its recorded `order_index` within the card; a manual field returns as the last field of the card.

**Retention and purge**
- "Submitted" is `proposals.status = 'submitted'` (existing `proposal_status` enum). A trigger on `proposals` sets `purge_after = now() + interval '30 days'` on all unrestored ledger rows for that proposal when status becomes 'submitted', and clears it if the status reverts.
- Purge itself runs as a scheduled edge function (same pattern as `deadline-reminders`), calling a security-definer function that hard-deletes ledger rows, versions, fields and cards where `purge_after < now() AND restored_at IS NULL`. Versions are deleted before fields so the RESTRICT FK is satisfied.
- Before submission, `purge_after IS NULL` means retained indefinitely.

**Who may act**
- Delete: `can_edit_proposal(auth.uid(), proposal_id)` — i.e. editors and above, matching today's edit rights. Cards with `is_deletable = false` are refusable by trigger regardless of role.
- Restore and purge-now: `is_proposal_admin(auth.uid(), proposal_id)` or `is_global_admin(auth.uid())` — coordinator-or-above only, since restoring changes document structure. `useProposalRole.ts`'s `roleTier === 'coordinator'` gates the UI.

## 7. Version history and `section_versions`

- New per-field history lives in `card_field_versions`, written by a `insert_card_field_version` security-definer function mirroring today's `insert_section_version` (auto-save debounce plus explicit save, same thinning policy — reuse the logic of `thin_section_versions` in a card-aware variant).
- `section_versions` is **retained for legacy content and not migrated**. It keys on free-text `section_id` strings and whole-section HTML, which has no per-field equivalent; rewriting historical snapshots into synthetic fields would fabricate history. The version-history UI reads new-model history for card-based sections and legacy history for sections still on `section_content`, choosing by whether any cards exist for the section.
- Because deletion is soft and purge deletes versions explicitly, history survives delete/restore of both fields and cards unconditionally.

## 8. Shared table style

**Location:** `src/lib/tableStyleSpec.ts` (tokens + class helpers) with a companion `src/styles/table-card.css` imported once, so both React consumers and the print renderer resolve the same values.

**API sketch**
```ts
export const TABLE_SPEC = {
  fontFamily: '"Times New Roman", serif', fontSizePt: 11, lineHeight: 1.0,
  cellPadding: { x: '0.3pt', y: '0pt' },
  headerBorderBottom: '1.5px solid #000', bodyBorderBottom: '1px solid #e5e7eb',
  layout: 'fixed', width: '100%', maxWidth: '18cm',
  align: { h: 'left', v: 'middle' }, repeatHeader: false,
} as const;
export function tableStyleCss(variant?: 'standard'|'cases'|'wp_description'): string;
export function tableClassNames(variant?): { table: string; th: string; td: string };
export function cellAlignStyle(h?: AlignH, v?: AlignV): CSSProperties;
```
Last-row rule implemented as `tbody tr:last-child td { border-bottom: 0 }`. Header repeat disabled via `thead { display: table-row-group }` in print CSS.

**Consumer switch-over**

| Existing duplicate | Action |
|---|---|
| `src/index.css` block 1 (editor tables) | replaced by `table-card.css` |
| `src/index.css` block 2 (mirror/preview tables) | replaced by `table-card.css` |
| `src/components/CasesTableNodeView.tsx` | keeps its own styling — declared exception, but reads spacing tokens from `TABLE_SPEC` so fonts stay consistent |
| `src/lib/printRenderer.tsx` | switches to `tableStyleCss()` for inline export CSS |
| WP description table (`B31WPDescriptionTables.tsx`) | keeps its own styling — declared exception |

**Alignment controls:** two new toolbar dropdowns (horizontal, vertical) in the formatting bar, rendered only when the selection is inside a table cell; they write `card_table_cells.align_h/align_v`, falling back to the column default and then the spec default.

**Captions:** `Table N.N.x.` bold-italic label + italic caption, letter suffix assigned per section in document order and recomputed on insert/reorder/restore by the same renumbering pass that already handles figures (`captionRenumbering.ts` extended to card tables).

**Cross-references:** cells are rich text sanitised with `CROSS_REF_RICH_TEXT_CONFIG` and hydrated with `hydrateRefBadges()`, exactly as the cases table and B3.1 mirror do today — chip rendering carries into table cards unchanged. Compulsory tables (e.g. milestone numbers) auto-insert badge markup into the designated column on reconcile.

## 9. Impact canvas replacement

Delete the canvas subsystem: tables `impact_canvas_columns`, `impact_canvas_rows`, `impact_canvas_elements` and `proposals.impact_canvas_enabled`; the canvas figure rows in `figures` with `figure_type = 'impact-canvas'`.

Replacement: one `kind = 'table'` card in B2.1, `variant = 'standard'`, flags `deletable=false, hideable=true, source_fed=false, fixed_position=true`, containing one logical table in two parts under one caption:
- part 1 columns: Target groups | Specific needs | Expected results
- part 2 columns: DEC measures | Expected outcomes | Expected impacts

`card_table_rows.part` separates the stacked halves; the renderer emits two `<table>` elements with one caption below the second. All six headings are editable (`card_table_columns.label_html`). Default content: one header row plus one empty body row per part; rows addable. No stakeholder grouping.

## 10. Migration of the methodologies model

1. Create the new tables (empty), with grants, RLS and triggers.
2. For each proposal, insert one `proposal_cards` row per `methodology_subsections` row into the B1.2 section: `kind='text'`, `title = subsections.title`, `order_index = order_index`, `is_visible = is_visible`, `origin='auto'`, `is_deletable=false`, `is_hideable=true`.
3. Insert one `card_fields` row per subsection carrying `content_html`, `order_index = 0`, `origin='auto'`.
4. `methodology_items` become `card_fields` of the single "Methodologies" card: `heading = items.heading`, `content_html = items.content_html`, `assigned_participant_id`, `origin='manual'`, preserving `order_index`. Case-placeholder items become fields with `origin='auto'` and a `source_key` on the field's card marking the placeholder position, so the B1.2 reconciler keeps placing the cases table after the right run.
5. `methodology_linked_activities` stays as its own relational table and backs a **source-fed table card** in B1.2 (`kind='table'`, `is_source_fed=true`, `source_key='b12.linked_activities'`) whose columns/rows are projected from it at render time rather than copied into `card_table_*`. It is genuinely a different data domain (activity records with year ranges), and keeping it avoids rewriting `LinkedActivitiesTable.tsx`'s editing model.
6. Leave the old tables in place, read-only, for one release; drop after verification.

## 11. Worked example — B3.1's card set

Section: the `proposal_template_sections` row for B3.1, `document = 'part_b'`.

| order_index | kind | title | deletable | hideable | source_fed | fixed | origin | source_key |
|---|---|---|---|---|---|---|---|---|
| 1 | text | (none, `title_deleted=true`) — free-text intro | false | true | false | false | auto | — |
| 2 | text | user-added narrative | true | true | false | false | manual | — |
| 1000 | table | Table 3.1.a Work package descriptions | false | false | true | true | auto | `b31.wp_descriptions` |
| 1010 | table | Table 3.1.b Summary of staff effort | false | false | true | true | auto | `b31.effort` |
| 1020 | table | Table 3.1.c Deliverables | false | false | true | true | auto | `b31.deliverables` |
| 1030 | table | Table 3.1.d Milestones | false | false | true | true | auto | `b31.milestones` |
| 1040 | table | Table 3.1.e Critical risks | false | false | true | true | auto | `b31.risks` |
| 1050 | table | Table 3.1.f Expertise matrix | false | false | true | true | auto | `b31.expertise_matrix` |

Rows 1000–1050 are the fixed block. New cards append at index 3 (bottom of the free block, above 1000) and may be dragged anywhere in 1..999.

## 12. RLS sketch

For each new table (`proposal_cards`, `card_fields`, `card_field_versions`, `card_table*`, `card_figure`, `card_outcome_entries`, `card_deletions`):

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<t> TO authenticated;
GRANT ALL ON public.<t> TO service_role;
ALTER TABLE public.<t> ENABLE ROW LEVEL SECURITY;

-- read: anyone with any role on the proposal
CREATE POLICY "<t>_select" ON public.<t> FOR SELECT TO authenticated
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));

-- write: editors and above
CREATE POLICY "<t>_write" ON public.<t> FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));
CREATE POLICY "<t>_update" ON public.<t> FOR UPDATE TO authenticated
  USING (public.can_edit_proposal(auth.uid(), proposal_id))
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));
```
- Hard `DELETE` is granted to no one but `service_role` (the purge job); user-facing deletion is an UPDATE that sets `deleted_at`.
- Restore is an UPDATE additionally gated by `public.is_proposal_admin(auth.uid(), proposal_id)` — expressed as a separate policy on the restore path, enforced by a security-definer `restore_card(...)` / `restore_card_field(...)` function rather than by raw UPDATE, so the flag checks live in one place.
- `card_field_versions`: SELECT as above; INSERT only via the security-definer writer; UPDATE/DELETE blocked by trigger.
- Child tables (`card_table_cells`, `card_outcome_entries`, …) carry `proposal_id` denormalised so every policy is a single function call with no joins.

## 13. Components to change or delete

**Must change**
- `src/components/MethodologiesPage.tsx`, `MethodologyItemsList.tsx`, `MethodologyRichEditor.tsx` — read from cards/fields.
- `src/hooks/useMethodologySubsections.ts`, `useMethodologyItems.ts` — replaced by `useSectionCards` / `useCardFields`.
- `src/hooks/useB12MethodologyMirrorsReconciler.ts`, `src/lib/b12MethodologyRuns.ts`, `B12MethodologiesSlotContent.tsx` — source cards instead of subsections.
- `src/components/B31TablesEditor.tsx`, `B31WPDescriptionTables.tsx`, `src/hooks/useB31SectionData.ts` — become source-fed table cards.
- `src/lib/printRenderer.tsx`, `src/hooks/useDocxExport.ts`, `usePdfExport.ts` — consume `tableStyleSpec` and card ordering; annex export filters `document='fstp_annex'`.
- `src/index.css` — table blocks removed in favour of `table-card.css`.
- `src/hooks/useColumnResize.ts` — writes `card_table_columns.width_px`.
- `src/lib/captionRenumbering.ts` / `renumberCaptionsInEditor.ts` — card-aware table suffixes.
- `src/components/FormattingToolbar.tsx` — new cell-alignment controls.
- `FstpTab.tsx` — annex export scoped by `document`.
- `src/components/FigureManager.tsx`, `FigureSizePicker.tsx`, `ResizableImage.tsx` — figure cards drop the canvas presets.
- `src/hooks/useSectionVisibility.ts`, `useSectionLocking.ts` — card-level visibility.

**Can be deleted**
- `ImpactCanvasSection.tsx`, `ImpactCanvasGraphic.tsx`, `ImpactCanvasFreeformEditor.tsx`, `ImpactCanvasCellEditor.tsx`, `ImpactCanvasTextBox.tsx`, `ImpactCanvasTextToolbar.tsx`, `OverviewCanvasSection.tsx`, `OverviewCanvasSlotNodeView.tsx`.
- `src/hooks/useImpactCanvas.ts`; `src/extensions/OverviewCanvasSlotNode.ts`, `CanvasFontSize.ts`, `CanvasHeader.ts`; `src/hooks/useOverviewCanvasSlotReconciler.ts`.
- `src/lib/impactCanvasLayout.ts`, `impactCanvasBoundStyle.ts`, `impactCanvasFocusedEditor.ts`, `impactCanvasTextSizing.ts`, `exportImpactCanvasToWord.ts`, `rasteriseCanvasFigure.tsx`, `canvasFigureSize.ts`, `canvasSize.tsx`, `canvasSelectionPreservation.ts`, `collapseStackedCanvasFontSize.ts`, `CanvasSizeContext.tsx`.
- `supabase/functions/generate-impact-pathway/index.ts`.
- After the legacy window: `methodology_subsections`, `methodology_items`, `table_column_widths`.

## 14. Open questions

1. **Legacy Part B sections** still on `section_content` free HTML — do they migrate to cards section-by-section, or stay on the old editor indefinitely? This decides whether `section_content` is also superseded.
2. **Cross-document move** — is a card ever needed in both Part B and the annex (shared table)? Current design says no; a shared table would need a reference card kind.
3. **FSTP annex section catalogue** — does the annex get its own template type in `template_types`, or synthetic sections under the Part B template?
4. **Source-fed card overrides** — may a coordinator hand-edit a mirrored table cell (an override layer), or is source-fed strictly read-only? Affects whether `card_table_cells` exists for source-fed cards at all.
5. **Version thinning across restore** — after a restore, does the retention counter restart, or does the pre-deletion history count against the cap?
6. **Purge scheduling** — is there an existing cron surface for `deadline-reminders`, or does the purge need its own schedule entry?
7. **Two-part B2.1 table export** — in Word, should the two parts be two tables with one caption paragraph, or one table with a repeated internal header row? Affects `useDocxExport`.
