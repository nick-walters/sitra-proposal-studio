

## Diagnosis: Why Track Changes Are Lost on Refresh

### Root Cause

When the editor loads content (on mount or refresh), the flow is:

1. Content with track change HTML spans (`data-track-insertion`, `data-track-deletion`) is fetched from the database
2. `useRichTextEditor` calls `editor.commands.setContent(content)` with tracking temporarily disabled (`storage.enabled = false`)
3. Tiptap's `setContent` generates a transaction that replaces the entire document — this transaction has `docChanged = true`
4. The TrackChanges extension's `appendTransaction` fires, sees `!extension.storage.enabled`, and enters the **mark-stripping branch** (lines 498-526 of `TrackChanges.ts`)
5. This branch removes ALL `trackInsertion` and `trackDeletion` marks from the document
6. The track change marks that were correctly parsed from the saved HTML are immediately stripped out

The stripping code was designed to clean inherited marks from new typing when tracking is off, but it also fires on `setContent` because Tiptap does NOT tag `setContent` transactions with any metadata that the plugin checks — the `tr.getMeta('setContent')` check at line 486 never matches because Tiptap never sets that meta.

### Fix Plan

**File: `src/components/RichTextEditor.tsx` (line ~1250)**

When calling `setContent` during external content sync, tag the transaction so the TrackChanges plugin can skip it. Change from:

```typescript
editor.commands.setContent(content, { emitUpdate: false });
```

To dispatching a transaction with `setContent` metadata manually, OR simpler: wrap the `setContent` call so the generated transaction carries the `setContent` meta that the plugin already checks for.

The simplest approach: instead of disabling `storage.enabled`, use the editor's `chain` to set a meta flag before calling `setContent`. However, since `setContent` is a single command that dispatches internally, the cleanest fix is:

**Wrap the `setContent` call to dispatch with correct metadata:**

In the `useEffect` at line 1242, replace the current approach of toggling `storage.enabled` with registering a temporary transaction filter or dispatching `setContent` manually with `setContent` metadata. Concretely:

```typescript
// Before setContent, temporarily set a flag the plugin can check
const storage = (editor.storage as any)?.trackChanges;
if (storage) storage._skipNextTransaction = true;
editor.commands.setContent(content, { emitUpdate: false });
```

And in `TrackChanges.ts` `appendTransaction`, check for this flag at the top of the mark-stripping branch.

**Actually, the simplest fix that requires minimal changes:**

**File: `src/extensions/TrackChanges.ts` (lines 480-492)**

Add a check: when tracking is disabled AND a transaction replaces the entire document (position 0 to doc end), skip stripping. Or better, check for the `preventUpdate` meta that Tiptap's `setContent` does set:

In the `appendTransaction` function, add at the top before the `hasUserChange` loop:

```typescript
// Skip setContent transactions (they already set preventUpdate meta)
for (const tr of transactions) {
  if (tr.getMeta('preventUpdate') !== undefined) return null;
}
```

This is the safest single-line fix because Tiptap's `setContent` always sets `preventUpdate` meta, and no user typing ever sets it.

### Summary

| File | Change | Purpose |
|------|--------|---------|
| `src/extensions/TrackChanges.ts` | Skip `appendTransaction` when transaction has `preventUpdate` meta (set by Tiptap's `setContent`) | Prevent track change marks from being stripped when content is loaded from DB |

One surgical change, one file. The track change marks are already correctly serialized to HTML and parsed back — they just get stripped immediately after parsing.

