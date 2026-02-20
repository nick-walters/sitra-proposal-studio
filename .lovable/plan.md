

# Feature Improvement Suggestions for Sitra Proposal Studio

After a thorough review of the codebase, here are actionable improvements grouped by area.

---

## 1. Notification Center -- Delete button never visible

**Problem:** In `NotificationCenter.tsx`, the delete button (Trash icon) has class `opacity-0 group-hover:opacity-100`, but the parent `<div>` on line 34 lacks the `group` class. The button is permanently invisible.

**Fix:** Add `group` to the notification item wrapper div's className.

---

## 2. Search & Replace -- Stale decorations after replace

**Problem:** In `SearchReplaceDialog.tsx`, after `replaceCurrent()` or `replaceAll()`, the match list refreshes via `setTimeout(findMatches, 50)`, but the decoration plugin still holds the old positions until the effect re-runs. This can cause decorations to highlight wrong text briefly.

**Fix:** Clear `matches` state immediately before the timeout, so stale decorations are removed instantly.

---

## 3. Search & Replace -- replaceAll uses individual chain calls

**Problem:** `replaceAll()` loops through matches calling `editor.chain()...run()` once per match. This fires N separate transactions, which is slow on large documents and can cause undo-history bloat.

**Fix:** Wrap all replacements in a single chained transaction by accumulating all operations.

---

## 4. Notification hook -- unreadCount can desync on realtime DELETE

**Problem:** In `useNotifications.ts`, the DELETE handler removes the notification from state but never decrements `unreadCount` if the deleted notification was unread.

**Fix:** In the DELETE realtime handler, check if the removed notification was unread and decrement the count.

---

## 5. SaveIndicator -- no "saving" spinner state

**Problem:** `SaveIndicator.tsx` treats `saving=true` and `hasUnsavedChanges=true` identically (just shows "Autosaves after 5 sec"). There's no visual feedback while an active save is in progress vs content simply being dirty.

**Fix:** Add a third visual state with a spinner/pulsing icon when `saving` is true, distinct from the idle "Autosaves after 5 sec" state.

---

## 6. useSectionContent -- beforeunload handler doesn't save version

**Problem:** The `beforeunload` handler saves content via sync XHR but does NOT save a version snapshot. The unmount cleanup does both, but `beforeunload` (tab close) skips the version. This means the last edits before closing the tab may not appear in version history.

**Fix:** Also call `syncSaveVersion` in the `beforeunload` handler when content has changed from the last version.

---

## 7. useAuth -- sessionStorage caching stores full User object

**Problem:** The entire Supabase `User` object (which can be large with metadata) is stored in `sessionStorage`. This is used only to prevent a loading flash, so only `id` and `email` are needed.

**Fix:** Cache only `{ id, email }` in sessionStorage for the hydration check, and let the real session restore the full object.

---

## Technical Implementation Details

| # | File | Change Type | Complexity |
|---|------|-------------|------------|
| 1 | `NotificationCenter.tsx` | Add `group` class | Trivial |
| 2 | `SearchReplaceDialog.tsx` | Clear matches before timeout | Small |
| 3 | `SearchReplaceDialog.tsx` | Single-transaction replaceAll | Medium |
| 4 | `useNotifications.ts` | Fix DELETE handler unread count | Small |
| 5 | `SaveIndicator.tsx` | Add spinner for saving state | Small |
| 6 | `useSectionContent.ts` | Add syncSaveVersion to beforeunload | Small |
| 7 | `useAuth.tsx` | Slim sessionStorage cache | Small |

All changes are backwards-compatible and require no database migrations.

