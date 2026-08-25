# Migrating contentEditable fields to TipTap — scope report

Investigation only. Nothing implemented.

## 1. Inventory of contentEditable / execCommand fields

Three shared contentEditable components carry almost everything. All three sanitise on load, run `normalizeRefBadges` + `hydrateRefBadges`, and take formatting from an external toolbar via `document.execCommand`.

| Component | Used by | Field / purpose | DB column | Cross-refs | Other formatting |
|---|---|---|---|---|---|
| `WPSimpleEditor.tsx` | `WPTableSection.tsx` | WP objectives | `wp_drafts.objectives` | yes | B/I/U, bullets, numbered, sub/sup, colour, tables |
| `WPSimpleEditor.tsx` | `WPTableSection.tsx` | Optional text before tasks | `wp_drafts.description_before_tasks` | yes | same |
| `WPSimpleEditor.tsx` | `WPTableSection.tsx` | Task description | `wp_draft_tasks.description` | yes | same |
| `WPSimpleEditor.tsx` | `WPPlanningQuestions.tsx` | Inputs / Outputs / Bottlenecks | `wp_drafts` planning columns | yes | same |
| `WPSimpleEditor.tsx` | `CaseDraftEditor.tsx` | Case narrative fields (background, solutions, outcomes, replicability, stakeholders, custom subsections) | `case_drafts.*` + `subsection_content` jsonb | yes | same + table insert, `execCommand('undo'/'redo')` |
| `InlineRichEditor.tsx` | `WPDeliverablesTable.tsx` | Deliverable title & short description | `wp_draft_deliverables.title` | yes | B/I/U only |
| `InlineRichEditor.tsx` | `ProposalMilestonesRisksManager.tsx` | Milestone means of verification, risk mitigation, titles | `proposal_milestones.*`, `proposal_risks.*` | yes | B/I/U |
| `InlineRichEditor.tsx` | `GeneralInfoForm.tsx` | A1 free-text field(s) | `part_a1.*` | yes | B/I/U |
| `PrefixedInlineEditor.tsx` | `ParticipantDescriptionsSection.tsx` | A2 participant descriptions (mirrored into B3.2) | `participant_descriptions.*` | yes | B/I/U |

Additional bespoke contentEditable surfaces found beyond the listed set:

- `TopicRichTextArea.tsx` + `TopicFormattingToolbar.tsx` — topic metadata text (A1). B/I/U, no cross-refs.
- `ProposalBanner.tsx` — inline banner title editing, `insertLineBreak` only, no cross-refs.
- `EditableCaption.tsx` — figure/table captions rendered outside TipTap.
- `ImpactCanvasFreeformRenderer.tsx` — impact canvas free text boxes.
- `AiStatementMirror.tsx`, `B31IntroText.tsx`, `B31TablesEditor.tsx`, `B31WPDescriptionTables.tsx`, `B32MirrorParagraphSlot.tsx`, `B11ParticipantsTable.tsx` — read-only or mirror surfaces that consume the same hydration helpers.

## 2. Fields that must stay plain inputs

Rule applied: **if the value is a single scalar the system reasons about — parsed, sorted, validated, compared, exported into a typed cell — it stays a plain `<input>`/`<textarea>`/`<Select>`. If the value is prose the user formats and can reference other objects from, it becomes TipTap.**

Stays plain: WP short name and title, task title, deliverable number/type/dissemination/due month, milestone number/due month, risk likelihood/severity, case short name and number, participant short name/PIC/country, all dates, all dropdowns, all numeric budget cells, acronym field.

Genuinely ambiguous, flagged for a decision:

- **Deliverable "title & short description"** (`wp_draft_deliverables.title`) — a scalar-looking column that already holds rich HTML and cross-refs. It is prose in practice; recommend TipTap single-line.
- **Milestone / risk titles** — short, exported into typed table cells, but currently rich. Recommend downgrading to plain input unless cross-refs in titles are wanted.
- **Case draft `title`** — same tension as above.

## 3. Legacy markup tolerance — viable, no migration needed

Every reference node is already an inline atom whose `parseHTML` matches a single tag selector:

- `wpReference` → `span[data-wp-reference]`
- `caseReference` → `span[data-case-reference]`
- `participantReference` → `span[data-participant-reference]`
- `inlineReference` (task / deliverable / milestone) → `span[data-inline-reference]`
- `acronymReference` → `span[data-acronym-reference]`
- `figureTableReference` (mark) → `span[data-fig-table-ref]`

The attribute-level `parseHTML` callbacks already read `data-task-id`, `data-deliverable-id`, `data-deliverable-number`, `data-deliverable-label`, `data-milestone-id`, `data-wp-id`, `data-wp-color` directly from the element. So the only gap is the **tag selectors**, which do not match the legacy contentEditable shapes emitted by `contentEditableRefBadges.ts`.

Legacy shapes that must be added as extra `parseHTML` rules:

1. `span[data-task-reference]` with `data-task-id` — pill, label as plain text.
2. `span[data-deliverable-reference]` / bare `span[data-deliverable-id]`, **generation 1**: `contenteditable="false"` wrapper containing an SVG pentagon.
3. Same, **generation 2**: wrapper with three nested `span` layers (border layer, white fill layer, label layer) from `applyDeliverablePentagon`, in some rows without `contenteditable="false"` — this is the shape that causes the caret-absorption bug.
4. `span[data-milestone-reference]` and `span[data-inline-reference][data-ref-type="milestone"]` with the chevron clip-path styling.
5. Bare `span[data-wp-id]`, `span[data-case-id]`, `span[data-participant-id]` without the `*-reference` marker attribute.

Because the nodes are `atom: true`, ProseMirror discards all nested children on parse and re-renders from attributes — the SVG layer, the nested spans and the baked-in label text all disappear automatically. Parse rules need `priority` above the default and, for the bare-id variants, `getAttrs` guards so a deliverable span is not also claimed by the WP rule (the same `:not()` discipline `hydrateRefBadges` already uses).

**Conclusion: self-converting on first edit. No data migration required.** For reference, current legacy volume is small: 20 `wp_draft_tasks` rows with `data-*` badges (4 with deliverable badges, 2 still carrying the SVG generation), 1 `wp_drafts` row, 3 `proposal_milestones` rows, 0 in case drafts, deliverables, risks. A backfill pass, if ever wanted, would be trivial — but it is not needed.

## 4. Editor instance count and lazy mounting

Worst case is a WP draft page: objectives + pre-task text + 3 planning questions = 5, plus 1 per task description (10–15 tasks realistic) and 1 per deliverable title (10–20). **Roughly 30–40 editable fields, worst case ~45.** A case draft page is next heaviest (5 fixed narrative fields + custom subsections). A2 participant descriptions run ~8–10.

Mounting 40 TipTap instances at once is the main risk. The cards board does **not** currently do static-until-focus — `MethodologyRichEditor.tsx` mounts a live `useEditor` per field and only flips `setEditable` reactively; the board tops out at far fewer fields. So the deferred-mount pattern has to be built, not reused. The pieces that do exist and should be reused:

- `src/components/MethodologyRichEditor.tsx` — per-instance `useId`, reactive `setEditable`, focus registration.
- `src/components/MethodologyEditorFocusContext.tsx` — one shared toolbar acting on the last-focused editor, which is exactly the model the WP/case toolbars already use with `execCommand`.
- `src/components/RichTextEditor.tsx` (`useRichTextEditor`) — the shared extension set.

Proposed shape: a `LazyRichField` wrapper that renders sanitised + node-rendered static HTML until `mousedown`/`focus`, then mounts a real `MethodologyRichEditor` and restores the caret. Static rendering can use TipTap's `generateHTML` from the same schema, which removes `hydrateRefBadges` from the read path as well.

## 5. What becomes deletable

Fully redundant once all four consumers move:

- `src/lib/contentEditableRefBadges.ts` (all builders + selection memory)
- `src/lib/refBadgeMarkup.ts`
- `src/lib/normalizeRefBadges.ts`
- `src/lib/hydrateRefBadges.ts`
- `src/components/WPSimpleEditor.tsx`, `src/components/InlineRichEditor.tsx`, `src/components/participant/PrefixedInlineEditor.tsx`
- `src/lib/pasteWordHtmlHandler.ts` (execCommand paste path; TipTap uses `tiptapPasteProps`)
- The three duplicate inserter blocks: `WPDraftEditor.tsx` lines ~358–640, the equivalent block in `CaseDraftEditor.tsx`, and `participant/ParticipantCrossRefDropdown.tsx` / `ImpactCanvasCrossRefDropdown.tsx`
- `src/lib/extractHexTextColors.ts` execCommand branch, `DraftFormattingToolbar.tsx` execCommand plumbing
- Tests: `wpDraftRefBadgeHydration.test.ts`, `inlineRichBadgeInsert.test.tsx`, parts of `b31RefBadgeMirror.test.ts`

**Cannot be deleted until their own consumers move** (all still call `hydrateRefBadges`):

- `B31TablesEditor.tsx`, `B31WPDescriptionTables.tsx` — B3.1 read-only mirrors
- `CasesTableNodeView.tsx` — B1.2 cases table
- `B32MirrorParagraphSlot.tsx` / `B32MirrorSlotNodeView.tsx` — A2→B3.2 mirror
- DOCX/PDF export paths (`exportWordBadgeConverter.ts`, `printRenderer.tsx`) read the rendered badge DOM

`hydrateRefBadges` is therefore the **last** thing removed, after the mirrors switch to schema-based `generateHTML`.

## 6. Sanitisation

Configs in play today:

- `INLINE_RICH_SANITIZE_CONFIG` (`InlineRichEditor.tsx`) and the near-identical config in `PrefixedInlineEditor.tsx` — `ALLOW_DATA_ATTR: true`, allows `contenteditable`, permits arbitrary inline `style`. Permissive; these disappear with the components.
- `CROSS_REF_RICH_TEXT_CONFIG` (`sanitizePresets.ts`) — enumerates every reference data-attr; used by the read-only mirrors.
- `sanitizeEditorHtml` (`supabase/functions/_shared/`) — the canonical save-time sanitiser. `STYLE_ALLOWLIST` deliberately omits `background-color`, `border`, `padding`, `border-radius`, `font-family`, `clip-path`, which is precisely why stored badges lose their pill and `hydrateRefBadges` exists.

What must change: nothing needs loosening. Once badges are TipTap nodes, presentation is regenerated by `renderHTML` from attributes on every load, so the narrow `STYLE_ALLOWLIST` is correct and should stay. The only additions required are the reference `data-*` attributes in `ALLOWED_DATA_ATTRS` that are not yet there (verify `data-task-reference`, `data-deliverable-label`, `data-deliverable-color`, `data-case-color`, `data-acronym-segments`) so a legacy span survives the first load long enough to be parsed into a node. After that first save the attributes it emits are the node's own canonical set. No style or tag allowlist widening.

## 7. What this unblocks

- **Track changes** — yes. `src/extensions/TrackChanges.ts` is a ProseMirror plugin keyed to transactions; contentEditable fields can never participate. After migration, WP objectives, task descriptions, case narratives and A2 descriptions all gain insertion/deletion tracking with no per-field work.
- **Live reference renumbering** — `syncCrossReferences` walks `editor.state.doc` and only sees TipTap instances; these fields become covered automatically, which is the original bug.
- Also unblocked: comment anchoring, collaborative locking + streaming (the cards board mechanism is editor-instance based), version history diffing, caption renumbering, smart-quote enforcement via the shared input rules, consistent Word paste cleaning, and undo/redo scoped to the field instead of `document.execCommand('undo')`.

## 8. Proposed sequence

1. **Stop the active corruption first.** `applyDeliverablePentagon` and `applyMilestoneBadge` in `refBadgeMarkup.ts` re-assert `contenteditable="false"` on the wrapper and on each nested layer; `hydrateRefBadges` does the same for every badge it touches. One file pair, no schema, immediately halts the degrade-and-save loop that produces caret-absorbing deliverable tags. Ship this alone.
2. **Legacy parse rules.** Extend the six reference nodes' `parseHTML` with the shapes in §3, plus the `ALLOWED_DATA_ATTRS` additions in §6. Test with fixtures for both deliverable generations. No UI change yet — verified purely by unit test.
3. **`LazyRichField` wrapper.** Build static-until-focus on top of `MethodologyRichEditor` and the focus context. Prove it on the lightest surface first: A2 participant descriptions (single component, ~10 fields, existing B3.2 mirror as a regression canary).
4. **Migrate case drafts.** Replaces the second inserter implementation and the `execCommand('undo')` path.
5. **Migrate WP drafts** — objectives, pre-task text, planning questions, task descriptions, deliverable titles. Heaviest page; validates the instance-count work. Retire `WPSimpleEditor` and `InlineRichEditor` after this.
6. **Migrate the remaining `InlineRichEditor` callers** — milestones/risks manager, A1 general info.
7. **Move the mirrors and exports** off `hydrateRefBadges` to schema-based `generateHTML`.
8. **Delete** everything in §5, remove the execCommand toolbars, and drop the superseded tests.

Steps 1 and 2 are safe on live content and carry no visible change. From step 3 onward each surface converts its own stored markup on first edit; a per-step read-only smoke check on the corresponding mirror and DOCX export is the acceptance gate.
