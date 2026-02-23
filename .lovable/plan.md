

## Plan: Fix Track Changes Toggle + Anchor Comments to Selected Text

### Issue 1: Track Changes Stays Active After Toggle Off

**Root Cause Analysis**

The track changes extension uses `appendTransaction` in ProseMirror to intercept all document changes and apply insertion/deletion marks. The enabled state flows through multiple paths that can conflict:

1. `TrackChanges.configure({ enabled: ... })` sets the initial `options.enabled`
2. `addStorage()` copies it to `storage.enabled` once at creation
3. `appendTransaction` reads `extension.storage.enabled` on every transaction
4. Two separate `useEffect` hooks (one in `DocumentEditor`, one in `useRichTextEditor`) both try to sync the React state to `storage.enabled`

The critical bug: when `editor.commands.setContent()` is called (e.g., from real-time sync or initial DB load), it creates a ProseMirror transaction with `docChanged = true` and NO `trackChangesInternal` meta. The `appendTransaction` treats this as a user edit and applies insertion marks to ALL the newly-set content. This means every time content syncs from the database while tracking is on, the entire document gets re-marked as insertions -- explaining why text appears green even after toggling off (the marks were already baked in by a previous `setContent` cycle).

Additionally, there's a race between two competing `useEffect` hooks syncing the same value, and the empty-transaction dispatch can trigger unnecessary re-processing.

**Fix**

- In `useRichTextEditor`: wrap `editor.commands.setContent(...)` calls with a `trackChangesInternal` meta so `appendTransaction` skips them. This is done by dispatching the setContent transaction manually with the meta flag, or by temporarily disabling storage before setContent and restoring after.
- Remove the duplicate `useEffect` in `DocumentEditor` (lines 329-337) since `useRichTextEditor` already has a sync effect (lines 1249-1268). Having two effects fighting over the same value creates subtle timing issues.
- In `appendTransaction`, add an additional guard: check if the transaction was dispatched by Tiptap's internal `setContent` command (checking for a `setContent` meta or full-document replacement pattern).

**Files to change:**
- `src/components/RichTextEditor.tsx` -- fix `setContent` to mark transactions as internal; keep the single authoritative sync effect
- `src/components/DocumentEditor.tsx` -- remove the duplicate storage sync `useEffect`
- `src/extensions/TrackChanges.ts` -- add a guard in `appendTransaction` to skip full-document replacements (setContent)

---

### Issue 2: Comments Not Anchored to Selected Text

**Root Cause Analysis**

The current flow:
1. User selects text in the editor
2. `selectionUpdate` fires, setting `selectedText` and `selectionRange` state in `DocumentEditor`
3. User clicks "Review panel" to open the sidebar, or the sidebar is already open
4. User clicks into the comment textarea to type
5. This moves focus away from the editor, clearing the editor selection
6. `selectionUpdate` fires again with `from === to`, clearing `selectedText` and `selectionRange`

The comment is saved with `selected_text` and position info, but by the time the user submits, those values have been cleared. Even if they persist, the comment just shows a quote block in the sidebar -- there's no visual highlight in the editor showing where the comment is anchored.

**Fix**

- Preserve the selected text and range when the user explicitly intends to comment: latch the values when the sidebar gains focus (or when the user starts typing in the comment box), so that subsequent editor blur doesn't clear them.
- Only clear `selectedText`/`selectionRange` when the comment is submitted or explicitly dismissed -- not on every selection change.
- Add a visual highlight (e.g., a yellow background mark or CSS-based decoration) on the editor text that has been selected for commenting, so users can see what text the pending comment refers to.
- When rendering existing comments with `selection_start`/`selection_end`, optionally scroll to and briefly highlight the referenced text when a comment is clicked.

**Files to change:**
- `src/components/DocumentEditor.tsx` -- change `handleTextSelection` to latch selection state; don't clear it on blur; add a ProseMirror decoration for the pending comment range
- `src/components/CommentsSidebar.tsx` -- display the selected text quote prominently when composing; support click-to-highlight for existing comments

---

### Technical Summary

| File | Change | Complexity |
|------|--------|------------|
| `src/extensions/TrackChanges.ts` | Guard `appendTransaction` against `setContent` transactions | Low |
| `src/components/RichTextEditor.tsx` | Mark `setContent` calls with internal meta; keep single sync effect | Medium |
| `src/components/DocumentEditor.tsx` | Remove duplicate sync effect; latch comment selection state; add pending-comment decoration | Medium |
| `src/components/CommentsSidebar.tsx` | Show anchored text quote; support click-to-highlight | Low |

