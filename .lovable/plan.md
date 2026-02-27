
Goal: make comment anchors reliably bind to selected text and remain navigable.

1) Current failure analysis (what is breaking now)
- Data check confirms anchors are not being saved at all for recent comments in this proposal (latest rows have `selected_text`, `selection_start`, `selection_end` all null), so click-to-jump has nothing to resolve.
- `handleCommentFieldPointerDown` currently reads only TipTap selection (`editor.state.selection`). That works only for rich-text selections, not B3.1 DOM/contentEditable selections.
- B3.1 capture currently depends on a `mouseup` listener inside `.document-page`; when users select text then click the sidebar input, selection collapses before a stable anchor is captured.
- B3.1 capture also exits early when `document.activeElement.isContentEditable` is true; this prevents anchor capture for task-title selections (exact area user is commenting on).
- Jump handler currently ignores negative/synthetic anchors (`if start < 0 || end < 0 return`), so even saved B3.1 synthetic anchors cannot navigate.

2) Anchor model to implement (durable and explicit)
- Replace overloaded numeric/synthetic range model with a typed anchor object per comment:
  - `anchor_type`: `editor_text` | `b31_dom`
  - `anchor_payload` (JSON):
    - For `editor_text`: `{ from, to, quote, contextBefore, contextAfter }`
    - For `b31_dom`: `{ commentableKey, quote, startOffset, endOffset }`
- Keep existing columns for backward compatibility during migration, but switch runtime to prefer `anchor_type + anchor_payload`.
- Why this fixes root cause: selection origin is explicit, and resolution logic can be specialized per origin instead of forcing both into one integer range.

3) Selection capture redesign (before focus leaves source)
- Introduce a unified `capturePendingAnchor()` used by:
  - TipTap selection updates
  - B3.1 selection events
  - Comment field `pointerdown` capture
- On comment field pointer-down:
  - First try TipTap selection if non-collapsed.
  - Otherwise read `window.getSelection()` and detect nearest `[data-commentable]`.
  - Compute text offsets within that element for `b31_dom` anchor.
  - Store a `pendingAnchorRef` + UI preview in sidebar.
- Do not clear pending selection on editor blur if capture was initiated by comment-field pointer interaction.
- Remove fragile timeout-based latch as primary mechanism; keep only as safety fallback.

4) Jump-to-anchor resolution logic
- In comment click handler:
  - If `editor_text`: try exact `{from,to}`; if stale, fallback to quote/context search near prior range; then global quote search.
  - If `b31_dom`: find element by `data-commentable=commentableKey`, reconstruct DOM Range from offsets, scroll and temporary highlight.
- Add resilient fallback order:
  1) exact anchor
  2) quote+context match
  3) quote-only match
  4) scroll to section top + warning toast (“Anchor moved; closest match not found”).

5) B3.1-specific hardening
- Ensure all commentable B3.1 targets have stable `data-commentable` keys (task title, metadata, description where needed).
- Stop blocking anchor capture solely because active element is contentEditable; instead guard against interfering with live typing by checking actual selection validity.
- Add visual anchor affordance in sidebar cards:
  - entire card clickable
  - blue hover border
  - small “linked” indicator only when anchor is resolvable.

6) Data migration / compatibility
- Backfill strategy:
  - Existing comments with numeric `selection_start/end` become `editor_text` payload.
  - Existing comments with null anchors remain unanchored (no guessing).
- Runtime read order:
  1) new `anchor_type/anchor_payload`
  2) legacy numeric range fallback
- Runtime write: new comments always write typed anchor payload.

7) File-level implementation plan
- `src/components/DocumentEditor.tsx`
  - add unified capture + pending anchor state
  - replace current `handleCommentFieldPointerDown` and B3.1 `mouseup` behavior
  - implement typed jump resolver with fallback search
- `src/components/CommentsSidebar.tsx`
  - submit typed anchor payload with comment
  - render anchor status + keep full-card click behavior
- `src/hooks/useSectionComments.ts`
  - extend insert/select mapping to include new anchor fields
  - keep legacy read compatibility
- `src/components/B31WPDescriptionTables.tsx`
  - verify/normalize `data-commentable` coverage and key stability
- `supabase/migrations/*`
  - add `anchor_type text` + `anchor_payload jsonb` to `section_comments`
  - index as needed for lookups (proposal/section still primary)

8) Validation checklist (must pass)
- Rich-text: select text -> click comment field -> submit -> reopen page -> comment still jumps to selected text.
- B3.1 task title (contentEditable): select text -> click comment field -> submit -> click card -> jumps/highlights same field text.
- B3.1 metadata row: same flow as above.
- Editing after comment creation: jump still resolves via fallback quote/context.
- Legacy comments (old numeric anchors) still jump.
- Unanchored comments show no false “linked” affordance.

```text
Selection source
   ├─ TipTap range ──────> anchor_type=editor_text ──> exact/fuzzy resolve in editor
   └─ B3.1 DOM range ────> anchor_type=b31_dom ─────> resolve via data-commentable + offsets
```
