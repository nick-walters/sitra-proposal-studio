# Figures as modules inside a block

## Part 1 — How figures work today

**Storage.** A figure block is a row in `proposal_cards` with `kind = 'figure'`. The figure it shows, plus its caption and all its layout settings, live in a separate table `card_figure`, one row per block, keyed by `card_id`: `figure_id`, `caption`, `width_mode`, `custom_width_pct`, `position_mode`, `page_break_mode`, `group_with_above/below`. The image asset itself is a row in `figures` (`content.imageUrl` points into the private files bucket).

**Reading and saving.** `CardFigureBlock` reads its row through `useCardFigure(cardId)` and writes every change (figure chosen, caption, width, position, page breaks) through one database function, `save_card_figure`. The figure picker is the full figures manager, so upload / AI image / canvas / Gantt / PERT all come for free.

**Numbering.** No figure stores its number. `computeFigureNumbers` derives it: group the placements by the section of their block, order by the block's position, letter them a, b, c. Cross-reference chips, the board caption, and the Typst export all read that one derived map.

## Part 2 — Proposed change (differs from the suggestion, deliberately)

The prompt suggests `card_fields.figure_id`. I recommend instead: **keep `card_figure` as the one home for a figure's placement, and let a row point at a module as well as a block.**

- `card_fields.field_role` gains `'figure'` (a figure module row; its text columns stay empty).
- `card_figure` gains a nullable `field_id`. A block figure keeps `field_id = null` (unchanged); a module figure has both `card_id` and `field_id`.
- `save_card_figure` takes an optional field id.

Why this rather than `card_fields.figure_id`: caption, width, position, page-break behaviour and the "this figure is already placed" state all already live in `card_figure`. A `figure_id` column on `card_fields` would need a second caption store, a second layout store and a second "placed" rule — that is the duplicated implementation item 10 forbids. With this shape, `CardFigureBlock` is reused as-is, given a field id instead of only a card id.

**Numbering** is the one piece that genuinely changes: the sort key becomes (block position, then module position within the block), so a figure module takes its correct place in the section's a/b/c sequence alongside figure blocks. This is in the shared numbering module used by both the app and the backup function, so both stay consistent.

## Everything that must change

| Area | Change |
| --- | --- |
| Database | `field_role` check to allow `figure`; `card_figure.field_id` + uniqueness; `save_card_figure` / `soft_delete_card_field` / restore / figure-placement guards updated |
| Numbering | shared `figureNumbering` sort key gains module order; browser + backup callers pass it |
| Board | `MethodologyCardsBoard` renders a figure module via `CardFigureBlock`; the "add module" control offers text vs figure, mirroring `AddBlockDialog` |
| Typst | `authoredFigures` keys by module as well as block; `sectionToTypst` emits a figure where the module sits in the field loop |
| Word / print | `printRenderer` gains the same module branch |
| Export dialog | figure modules listed as excludable items |
| Recycle bin | figure modules appear in the bin, restore returns the figure, deleting the parent block takes them along |
| Snapshots | confirm the new column is inside snapshot/restore scope (the `table_column_headers` miss must not repeat) |

## Unsure before editing

- Whether figure modules should get the layout controls (width, wrap, page breaks) or inherit a fixed full-width behaviour inside a block. Default assumption: same controls as a block.
- Whether a figure module should be allowed in B3.1, where every figure is forced full width.

## Verification

Throwaway proposal only; SUSIE-Q read-only. Compile a real Typst preview and read the numbers off the PDF, check Word and print output, check cross-references resolve, check delete/bin behaviour, and compile a section with an existing figure block before and after to prove blocks are untouched.
