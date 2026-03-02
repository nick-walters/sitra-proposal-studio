

## Deep Analysis: Track Changes Metadata Lost on Refresh

### Root Cause

After extensive analysis of the TipTap/ProseMirror rendering pipeline, the `mergeAttributes` fix in `renderHTML` is structurally correct — `HTMLAttributes` from `getRenderedAttributes` contains `data-*` prefixed keys, and `mergeAttributes` preserves them. ProseMirror's `renderSpec` sets all attributes where `value != null`. The HTML round-trip SHOULD work.

However, there are **two compounding issues** that explain the user's symptoms:

**1. Previously saved content has broken HTML (no data attributes).** Before the `mergeAttributes` fix, the old `renderHTML` accessed `HTMLAttributes.changeId` (camelCase), but `HTMLAttributes` contained `data-change-id` (kebab-case from per-attribute `renderHTML`). So `HTMLAttributes.changeId` was `undefined`, and ProseMirror skips `null`/`undefined` attributes. All saved content from before the fix has `<span data-track-insertion="" style="...">` with NO `data-change-id`, `data-author-id`, etc. On reload, all attributes default (`authorName → 'Anonymous'`, `timestamp → null`).

**2. The backfill effect only patches the current user's "Anonymous" marks — not other attributes, and not for other users.** It also dispatches with `preventUpdate` meta, which prevents TipTap's `onUpdate` from firing, so the fixed marks are never saved back to the database.

**3. Review panel retains time but tooltip doesn't** because `collectChangesFromDoc` falls back to `Date.now()` for null timestamps (`new Date(attrs.timestamp || Date.now())`), masking the data loss. The tooltip correctly shows nothing when timestamp is null.

### Comprehensive Fix Plan

#### A. Force re-save of existing content to capture correct HTML (TrackChanges.ts is already fixed)

In `RichTextEditor.tsx`, after the marks scan effect (line 1280), add a **one-time re-serialization pass**: if any marks are found with default/missing attributes BUT the editor's in-memory marks have correct attributes (from per-attribute `renderHTML` now working), trigger a save by calling `onChange(editor.getHTML())`. This ensures the database gets updated HTML with all `data-*` attributes.

#### B. Expand the backfill effect to patch ALL missing attributes, not just authorName

In `DocumentEditor.tsx` (lines 375-410), the backfill should:
- Fix marks from ANY author that have missing `authorName` (not just current user)
- For the current user: also fix missing `authorId` and `timestamp`
- After patching, dispatch WITHOUT `preventUpdate` so `onUpdate` fires and the corrected HTML is saved to the database

#### C. Ensure `onChange` fires after backfill to persist corrections

Remove `preventUpdate` meta from the backfill transaction dispatch. Instead, use only `trackChangesInternal` to prevent the track changes plugin from treating the fix as new content, while still allowing TipTap to call `onUpdate` → `onChange` → DB save.

#### D. Fix review panel date format (TrackChangesToolbar.tsx)

The popover panel in `TrackChangesToolbar.tsx` already has `formatPanelDate` using ordinal suffixes. Verify it's being used in the rendered JSX for each change card (line ~230 area). The inline changes list in `DocumentEditor.tsx` (line 1666) already uses the ordinal format inline — confirm both locations are consistent.

#### E. Ensure profile name resolution works for both locations

Both `TrackChangesToolbar` (popover) and `DocumentEditor` (inline list) independently resolve author names from the profiles table. Ensure both correctly handle the case where `authorId` is empty string (no lookup possible) — show "Anonymous" gracefully.

### Files to Edit

1. **`src/components/DocumentEditor.tsx`** — Expand backfill effect to fix all missing attributes; remove `preventUpdate` from backfill dispatch so corrections are saved
2. **`src/components/RichTextEditor.tsx`** — After marks scan, trigger a re-save if the HTML changed (to flush corrected attributes to DB)
3. **`src/components/TrackChangesToolbar.tsx`** — Verify date format in popover panel uses `formatPanelDate`

