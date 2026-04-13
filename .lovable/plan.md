

# Comprehensive Platform Audit: Performance, Bugs, and Cleanup

## Summary

After analyzing the full codebase (~160 components, ~40 hooks, 16,000+ lines in key files), this plan covers three categories: bugs/code smells, performance improvements, and structural cleanup. The platform is feature-rich but has accumulated technical debt across several key areas.

---

## A. Bugs and Code Smells

### 1. `useProposalData.ts` — Pervasive `(data as any)` casts (41 instances)
The Supabase-generated types don't include many proposal columns (e.g., `submission_stage`, `topic_description`, `cases_enabled`). Every access is cast with `(data as any)`, which suppresses type errors and can hide real bugs. This suggests the database types file is out of sync with the actual schema.

**Fix**: Regenerate Supabase types so all columns are typed. Remove all `as any` casts.

### 2. `ProposalEditor.tsx` — `isUserMemberOfParticipant` computed but never used (lines 651-652, 727-728)
Two identical blocks compute `userParticipantMembers` and `isUserMemberOfParticipant` but the variable is never referenced — `canEditThisParticipant` just uses `canEdit`.

**Fix**: Remove the dead variables or implement the intended member-based permission check.

### 3. `ProposalEditor.tsx` — `window.location.reload()` on toggle cases (line 917)
The cases toggle handler does a full page reload instead of refetching data. This destroys all client state (scroll position, active section, presence channels).

**Fix**: Replace with `refreshProposal()` call (already available in scope).

### 4. Duplicate role-fetching hooks
Three overlapping hooks query `user_roles`:
- `useUserRole()` — global roles (owner/admin)
- `useProposalRole(proposalId)` — proposal-specific tier
- `useProposalData(proposalId)` — also fetches role and computes `canEdit`/`isCoordinator`

Each fires independent Supabase queries on mount. Components like `DocumentEditor` call both `useProposalRole` AND receive `canEdit` from parent.

**Fix**: Consolidate into a single hook or ensure `useProposalData` is the authority and pass its results down.

### 5. Manual camelCase/snakeCase mapping in `useProposalData`
The `updateProposal` function has ~40 manual `if (updates.X !== undefined) dbUpdates.x_y = updates.X` lines, and `fetchProposal` has ~40 manual reverse mappings. This is fragile and error-prone.

**Fix**: Use a generic `camelToSnake` mapper (one already exists in the file) to transform keys automatically.

---

## B. Performance Improvements

### 1. `useProposalData` — Waterfall fetches on every mount
Every proposal load fires 5 parallel queries (proposal, role, participants, members, ethics). These use raw `useState`/`useEffect` instead of React Query, so there's no caching, deduplication, or stale-while-revalidate behavior.

**Fix**: Migrate to `useQuery` hooks for each entity. This gives free caching, background refetch, and loading states per entity instead of a single `loading` boolean.

### 2. `ProposalEditor.tsx` — Re-renders from collaborator cursor updates
`useCollaborativeCursors` fires at 50ms throttle, updating `collaborators` state on every presence sync. This triggers re-renders of the entire 1,300-line `ProposalEditor` component, including all its `useMemo` computations.

**Fix**: Memoize `renderContent()` or split the collaborator avatars into a separate component that subscribes independently.

### 3. `RichTextEditor.tsx` (1,865 lines) — Monolithic component
The toolbar, editor, and all dialog logic are in one file. Every toolbar state change re-renders everything.

**Fix**: Extract `FormattingToolbar` into its own file. Extract dialog components. Use `React.memo` on the toolbar.

### 4. Supabase Realtime channel proliferation
Each `DocumentEditor` subscribes to:
- Block locking channel (`useBlockLocking`)
- Collaborative cursors channel (`useCollaborativeCursors`)
- Section comments channel (`useSectionComments`)
- Section assignments channel (`useSectionAssignments`)

That's 4 channels per section view. When switching sections rapidly, channels may not clean up fast enough.

**Fix**: Audit channel cleanup in all hooks. Consider consolidating presence into a single proposal-level channel.

### 5. `reorderParticipants` — N sequential database updates
Lines 577-581 in `useProposalData` fire one `UPDATE` per participant, then `Promise.all`. For 15+ participants, this is 15 network round-trips.

**Fix**: Use a single RPC function or batch update.

---

## C. Structural Cleanup

### 1. `ProposalEditor.tsx` (1,312 lines) — God component
This single file handles routing between 15+ section types, status management, export, duplication, sidebar, collaborator display, and the entire layout. The `renderContent()` function alone is 500+ lines of if/else chains.

**Fix**: Extract section routing into a `SectionRouter` component. Extract the top bar into `ProposalTopBar`. Extract status logic into a helper.

### 2. `DocumentEditor.tsx` (2,141 lines) — Second god component
Similar issue: toolbar, dialogs, locking, comments, track changes, and the editor itself are all in one file.

**Fix**: Extract toolbar into `DocumentEditorToolbar`. Extract dialog management into a custom hook. Move B12/B31 special-case rendering into separate components.

### 3. Excessive `console.error` calls (1,344 matches across 78 files)
Almost every Supabase error is logged with `console.error` AND shown via `toast.error`. In production, this creates noise. Many are in hot paths (autosave, presence).

**Fix**: Create a central `logError(context, error)` utility that logs in development only. Keep toast notifications for user-facing errors.

### 4. `useProposalData.ts` — Manual field mapping (736 lines)
The entire hook is manual ORM-like code: mapping snake_case DB fields to camelCase JS, and back. This is the largest source of bugs and maintenance burden.

**Fix**: Create a `proposalMapper` utility with `fromDb()` and `toDb()` functions. Define the field mapping once as a configuration object.

### 5. Print/export CSS duplication
`index.css` has `.print-export-container` styles, and `useDocxExport.ts` has ~120 lines of nearly identical CSS in `wrapInWordHtml()`. As noted in the code comment, this is intentional for the standalone `.doc` file, but changes to one must be manually mirrored.

**Fix**: Extract the shared CSS rules into a constants file that both `index.css` and `wrapInWordHtml` reference, or add a build step to inject them.

---

## Implementation Priority

| Priority | Item | Impact | Effort |
|----------|------|--------|--------|
| 1 | Fix `window.location.reload()` | High (UX) | 5 min |
| 2 | Remove dead `isUserMemberOfParticipant` vars | Low (cleanliness) | 5 min |
| 3 | Regenerate Supabase types to eliminate `as any` | High (type safety) | 30 min |
| 4 | Migrate `useProposalData` to React Query | High (perf) | 2 hr |
| 5 | Extract `ProposalEditor` sub-components | Med (maintainability) | 1.5 hr |
| 6 | Consolidate role hooks | Med (perf + clarity) | 1 hr |
| 7 | Extract `RichTextEditor` toolbar | Med (perf) | 1 hr |
| 8 | Batch participant reorder RPC | Low (perf edge case) | 30 min |
| 9 | Auto-map camelCase/snakeCase in `useProposalData` | Med (maintainability) | 1 hr |
| 10 | Central error logging utility | Low (cleanliness) | 30 min |

Items 1-3 are quick wins. Items 4-7 are the highest-impact refactors. Items 8-10 are good housekeeping for when time permits.

