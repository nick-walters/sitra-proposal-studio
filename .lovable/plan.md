

# Code Audit: Bugs, Issues, and Cleanup Plan

## A. Bugs and Issues

### 1. XSS: Unsanitized `dangerouslySetInnerHTML` in footnotes (DocumentEditor, TopicRichTextArea)
**DocumentEditor.tsx line 1389**: After DOMPurify sanitizes the citation, the acronym replacement re-injects unsanitized HTML (`coloredAcronym` built from `acronymSegments` which come from DB data). The `citationHtml` after replacement bypasses the earlier sanitization.

**TopicRichTextArea.tsx lines 175, 186, 231, 238**: Footnote `fn.text` and the readonly `html` prop are rendered via `dangerouslySetInnerHTML` without DOMPurify. The editable area (line 175) and the readonly component (lines 231, 238) both skip sanitization.

**Fix**: Sanitize `citationHtml` *after* acronym replacement. Wrap all footnote `fn.text` and the readonly `html` in DOMPurify.

### 2. Notification polling every 5 seconds is wasteful
**useNotifications.ts line 242-244**: A `setInterval` polls `fetchNotifications()` every 5 seconds, even though realtime subscriptions already handle INSERT, UPDATE, and DELETE events. The comment says "to catch deletions that realtime may miss" — but the realtime listener already handles DELETEs. This creates unnecessary network load.

**Fix**: Remove the 5-second polling interval entirely. The realtime subscription is sufficient.

### 3. `useSectionContent` — `getAuthToken` parses wrong structure from localStorage
**useSectionContent.ts line 57-58**: `parsed?.access_token` reads from the root of the parsed JSON. But Supabase stores the session under the storage key as `{ currentSession: { access_token: ... } }` or similar nested structure depending on version. If the token isn't found, sync XHR saves silently fail with auth errors.

**Fix**: Parse the correct nested path: `parsed?.currentSession?.access_token` or iterate to find the token. Better: use `parsed` structure that matches what `@supabase/supabase-js` actually stores (`parsed` is typically the full session object for v2, so `parsed?.access_token` may be correct for the latest SDK — but worth verifying against actual localStorage in the running app).

### 4. `useProposalSections` — `useMemo` has unnecessary dependencies
**useProposalSections.ts line 500**: The `allSections` useMemo includes `useWpThemes` and `themesData` in its deps, but these are already indirectly used through `wpDraftSections` (which depends on both). This causes extra recomputation.

**Fix**: Remove `useWpThemes` and `themesData` from the dependency array of `allSections`.

### 5. Race condition in `usePinnedProposals.persistToDb`
**usePinnedProposals.ts line 33**: The `savingRef` guard silently drops concurrent saves. If a user rapidly toggles pins, intermediate states may be lost — the delete-all + insert pattern isn't atomic.

**Fix**: Use upsert or wrap in a transaction. At minimum, queue the latest state and re-persist after the current save completes (same pattern as the save pipeline fix).

### 6. `useProfileCompletion` — missing `useCallback` wrapper for `checkProfile`
**useProfileCompletion.ts line 16**: `checkProfile` is a plain `async function` — it's recreated on every render. The `useEffect` on line 66 depends on `user?.id` but calls `checkProfile` which has an unstable reference. Not a crash bug, but causes unnecessary re-runs.

**Fix**: Wrap `checkProfile` in `useCallback` with `[user]` dep.

---

## B. Redundant Code Cleanup

### 1. Dead sample data in Dashboard (~185 lines)
**Dashboard.tsx lines 47-229**: The `sampleProposals` array contains 9 hardcoded proposal objects that are never used — the dashboard fetches real data from the database. The `topicIcons` map (lines 35-44) maps hardcoded acronyms like 'GreenTech' to icons, but these only match the unused sample data.

**Fix**: Remove `sampleProposals` (lines 47-229) and `topicIcons` (lines 35-44). Remove `topicIcons` props from `ProposalTableView`, `ProposalKanbanView`, and `ProposalCard`. Also remove `src/lib/sampleProposals.ts` if `ProposalMultiSelect` can be updated to start with an empty array (it already fetches from DB).

### 2. Dead file: `src/lib/sampleProposals.ts`
Only used by `ProposalMultiSelect` as a fallback default. Since the component fetches real data on mount, the fallback is unnecessary.

**Fix**: Delete `src/lib/sampleProposals.ts`. Update `ProposalMultiSelect` to initialize with `[]` instead.

### 3. Duplicate profile-checking logic
Profile completeness is checked in two separate places with **different field lists**:
- `useProfileCompletion.ts` checks 9 fields (first_name, last_name, organisation, etc.)  
- `useNotifications.ts` line 39 only checks `full_name` containing a space

These can produce contradictory results. 

**Fix**: Consolidate into `useProfileCompletion` as the single source of truth. Have `useNotifications` import and use that hook's result instead of its own inline check.

### 4. Unused Lucide icon imports in Dashboard
**Dashboard.tsx line 12**: Imports `GripVertical`, `Trophy`, `XCircle`, `AlertTriangle`, `Clock`, `CheckCircle2`, `Send` — verify which are actually used. Several appear to be leftover from when sample data was rendered with status icons.

**Fix**: Audit and remove unused imports.

---

## Summary of changes

| File | Type | Change |
|------|------|--------|
| `src/components/DocumentEditor.tsx` | Bug | Re-sanitize `citationHtml` after acronym replacement |
| `src/components/TopicRichTextArea.tsx` | Bug | Sanitize footnote `fn.text` and readonly `html` with DOMPurify |
| `src/hooks/useNotifications.ts` | Bug | Remove 5-second polling interval |
| `src/hooks/useProposalSections.ts` | Bug | Remove redundant deps from `allSections` useMemo |
| `src/hooks/useProfileCompletion.ts` | Bug | Wrap `checkProfile` in `useCallback` |
| `src/pages/Dashboard.tsx` | Cleanup | Remove ~185 lines of dead sample data + unused icon imports |
| `src/lib/sampleProposals.ts` | Cleanup | Delete file |
| `src/components/ProposalMultiSelect.tsx` | Cleanup | Replace sample data fallback with empty array |
| `src/hooks/useNotifications.ts` | Cleanup | Remove duplicate profile-check logic; use `useProfileCompletion` |
| `src/components/ProposalTableView.tsx` | Cleanup | Remove `topicIcons` prop |
| `src/components/ProposalKanbanView.tsx` | Cleanup | Remove `topicIcons` prop |
| `src/components/ProposalCard.tsx` | Cleanup | Remove `topicIcon` prop |

