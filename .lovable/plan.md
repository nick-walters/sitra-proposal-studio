

# Comprehensive Fix for Content Loss in Part B Editors

## Root Cause Analysis

After a deep inspection of the save pipeline (`useSectionContent.ts`, `DocumentEditor.tsx`, `RichTextEditor.tsx`, `ProposalEditor.tsx`), I identified **six distinct failure modes** that can cause content loss:

### 1. Race condition: `isSavingRef` guard silently drops saves (CRITICAL)
**Line 169**: `if (isSavingRef.current) return false;`  
If a save is in progress and the debounce timer fires, the new content is **silently discarded** — `pendingContentRef` remains non-null but the save never runs. No retry is scheduled. The `SaveIndicator` shows "Autosaved" from the *previous* save, misleading the user.

### 2. Section switching destroys pending saves (CRITICAL)
**ProposalEditor.tsx line 1229**: `key={activeSection?.id || 'none'}` causes a full unmount of `DocumentEditor` (and `useSectionContent`) on section change. The unmount cleanup (line 436) uses **synchronous XHR** to save, but:
- It saves the raw `pendingContentRef.current` **without caption renumbering** — so the saved content differs from what was displayed.
- `syncSaveContent` has no error handling beyond a `console.error` — failures are invisible.
- The synchronous XHR can be blocked or fail silently in modern browsers that are deprecating sync XHR.

### 3. Debounced save captures stale content via closure
**Line 361-363**: The debounce timer captures `newContent` at the time of the keystroke, but `saveContent` is recreated via `useCallback` with `[saveContentImmediately]` in its deps. If `saveContentImmediately` changes between the keystroke and the timer firing (e.g. due to `user` or `sectionNumber` changing), the timer calls the **old** closure which may have stale refs or fail the guard checks.

### 4. Real-time subscription overwrites local unsaved content
**Line 328-333**: When another user saves, the realtime subscription calls `setContentState(newData.content)`. This overwrites the current user's in-memory content. If the local user has unsaved pending changes (within the 5-second debounce window), those changes are **lost** — the editor re-renders with the remote content, and `pendingContentRef` still points to the old local content which gets overwritten by the editor's `onUpdate`.

### 5. `flushPendingChanges` isn't called on section switch
The `saveNow` function is exposed but **never called** anywhere in the codebase. When the user clicks a different section, the component unmounts without awaiting the async save path — it falls through to the sync XHR fallback which is unreliable.

### 6. Save indicator shows success before DB confirmation
The `SaveIndicator` transitions to "Autosaved" when `lastSaved` updates (line 225 of useSectionContent), which happens after the Supabase `.update()` succeeds. This part is correct. However, when `isSavingRef` blocks a save (issue #1), the indicator still shows the *previous* save's success — the user sees "Autosaved" while their latest content was never persisted.

---

## Implementation Plan

### A. Eliminate the silent-drop race condition
**File: `src/hooks/useSectionContent.ts`**
- Replace the `isSavingRef` early-return with a **save queue**: when a save is already in progress, store the latest content in `pendingContentRef` and schedule a follow-up save after the current one completes.
- After `saveContentImmediately` finishes, check if `pendingContentRef` has been updated during the save and immediately re-trigger.
- This guarantees the **last** content is always persisted.

### B. Flush pending saves before section switch
**File: `src/pages/ProposalEditor.tsx`**
- Remove the `key={activeSection?.id || 'none'}` on the `<main>` wrapper (this causes full unmount/remount).
- Instead, pass `activeSection` as a prop and use `key` on `DocumentEditor` itself.
- **More importantly**: before changing the active section, call `saveNow()` on the current editor via a ref, and `await` completion. This uses the reliable async path instead of sync XHR.

**File: `src/hooks/useSectionContent.ts`**
- Make `flushPendingChanges` return a `Promise<boolean>` so callers can await it.
- Expose a `isDirty` boolean (derived from `pendingContentRef.current !== null`).

### C. Protect against realtime overwrites of local changes
**File: `src/hooks/useSectionContent.ts`**
- In the realtime subscription handler (line 328), check `pendingContentRef.current !== null` before applying remote content. If the user has unsaved local changes, **skip** the remote update (the local save will reconcile when it writes to DB).
- After local save completes, the next remote event will be the user's own save (filtered by `last_edited_by !== user?.id`), so no content is lost.

### D. Add a manual "Save now" button
**File: `src/components/SaveIndicator.tsx`**
- When `hasUnsavedChanges` is true, show a clickable "Save now" button next to the autosave indicator.
- Wire it to `saveNow()` from the section content hook.

**File: `src/components/DocumentEditor.tsx`**
- Expose `saveNow` from `useSectionContent` and pass it to `SaveIndicator`.
- Add keyboard shortcut `Ctrl+S` / `Cmd+S` to trigger `saveNow()`.

### E. Add a "dirty" warning on navigation away
**File: `src/hooks/useSectionContent.ts`**
- Track `isDirty` state: `true` when `pendingContentRef.current !== null`, `false` after save.
- Expose `isDirty` in the return value.

**File: `src/pages/ProposalEditor.tsx`**
- Before switching sections, if current editor `isDirty`, flush and await. If flush fails, show a confirmation dialog warning the user.

### F. Harden sync XHR fallback and add save failure visibility
**File: `src/hooks/useSectionContent.ts`**
- In `syncSaveContent`, check `xhr.status` after `send()` — if non-2xx, store the failed content in `localStorage` as a recovery buffer with a key like `content-recovery:${proposalId}:${sectionId}`.
- On next mount of the same section, check for recovery data and prompt the user to restore it.
- Add a persistent error banner (not just a toast) when saves fail, so the user knows to copy their work.

### G. Fix stale closure in debounced save
**File: `src/hooks/useSectionContent.ts`**
- Instead of capturing `newContent` in the setTimeout closure, always read from `pendingContentRef.current` when the timer fires. This ensures the save always uses the **latest** content, even if the user typed more during the debounce window.

```text
Current flow:
  keystroke → setContent(v1) → setTimeout(save v1, 5s)
  keystroke → setContent(v2) → clearTimeout → setTimeout(save v2, 5s)
  [if save v2 fires while save v1 in progress → DROPPED]

Proposed flow:
  keystroke → setContent(v) → pendingRef = v → resetTimer(5s)
  timer fires → save(pendingRef.current) [always latest]
  if already saving → queue flag = true
  save completes → if queue flag → save(pendingRef.current) again
```

### H. Improve logging and diagnostics
- Add structured console logs at key points: save queued, save started, save succeeded, save dropped (should never happen after fix), sync XHR used, recovery buffer written.
- Tag all logs with `[AutoSave]` prefix and include sectionId for filtering.

---

## Summary of files to modify

| File | Changes |
|------|---------|
| `src/hooks/useSectionContent.ts` | Save queue, stale closure fix, realtime guard, dirty tracking, recovery buffer, logging |
| `src/components/SaveIndicator.tsx` | "Save now" button when dirty |
| `src/components/DocumentEditor.tsx` | Wire saveNow, Ctrl+S shortcut, pass dirty state |
| `src/pages/ProposalEditor.tsx` | Flush before section switch, remove destructive `key` |

