

## Fix: Editors unable to see participants (frontend data fetching issue)

### Analysis

The database security functions are confirmed correct -- `has_any_proposal_role` and `can_edit_proposal` both return TRUE for editors. The RLS policies are properly configured. The issue is on the **frontend**: the `useProposalData` hook may fetch participant data before the auth session is fully restored, and Supabase silently returns empty arrays (not errors) when RLS blocks unauthenticated requests.

### Root Cause

In `useProposalData.ts`, the `fetchParticipants` callback only depends on `proposalId`, not on `user`. So when `user` changes (auth session restored), the `fetchParticipants` callback reference stays the same, and if it ran during the brief window before auth was ready, the empty result persists.

Additionally, after a role change (admin to editor), the cached data in the component state is never invalidated -- the user must manually reload the page.

### Solution

1. **Add `user` as a dependency to `fetchParticipants`** (and other fetch callbacks) so they re-run when the auth session is restored or changes
2. **Add a session-ready guard** to prevent fetching before the Supabase session is available
3. **Add console logging** for empty participant results to aid debugging

### Technical Details

**File: `src/hooks/useProposalData.ts`**

- Add `user` to the dependency array of `fetchParticipants`, `fetchParticipantMembers`, and `fetchEthics` callbacks so they automatically re-run when auth state changes
- Add a guard: if `!user`, skip the fetch (return early) -- this prevents unauthenticated queries that silently return empty
- This ensures that when the auth session loads or when a role change causes a re-login, participants are properly refetched

```typescript
// Before (broken):
const fetchParticipants = useCallback(async () => {
  if (!proposalId) return;
  // ... query runs potentially without auth
}, [proposalId]);

// After (fixed):
const fetchParticipants = useCallback(async () => {
  if (!proposalId || !user) return;
  // ... query runs only when authenticated
}, [proposalId, user]);
```

Apply the same pattern to `fetchParticipantMembers` and `fetchEthics`.

### Summary of Changes

| File | Change |
|------|--------|
| `src/hooks/useProposalData.ts` | Add `user` dependency and guard to `fetchParticipants`, `fetchParticipantMembers`, `fetchEthics` |

