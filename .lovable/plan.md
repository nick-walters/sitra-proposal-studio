

## Fix: Global roles not detected for proposal access

### Problem
The `fetchUserRole` function in `src/hooks/useProposalData.ts` (line 121-126) only queries for roles matching the specific `proposal_id`. Global roles (owner, admin) are stored with `proposal_id = NULL`, so they are never found. This means a global owner who is also a proposal editor gets no role detected (or only the editor role if it exists), and the "Add Participant" button stays hidden.

### Solution
Update `fetchUserRole` to query both proposal-specific and global roles, then use the highest-privilege one.

### Technical Details

**File: `src/hooks/useProposalData.ts` (lines 117-131)**

Replace the single query with two parallel queries:

```typescript
const fetchUserRole = useCallback(async () => {
  if (!proposalId || !user) return;

  // Fetch proposal-specific and global roles in parallel
  const [proposalResult, globalResult] = await Promise.all([
    supabase
      .from('user_roles')
      .select('role')
      .eq('proposal_id', proposalId)
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('user_roles')
      .select('role')
      .is('proposal_id', null)
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  const rolePriority: Record<string, number> = {
    owner: 4, admin: 3, editor: 2, viewer: 1
  };

  const roles = [
    proposalResult.data?.role,
    globalResult.data?.role
  ].filter(Boolean) as string[];

  if (roles.length > 0) {
    const bestRole = roles.sort(
      (a, b) => (rolePriority[b] || 0) - (rolePriority[a] || 0)
    )[0];
    setUserRole(bestRole as 'owner' | 'admin' | 'editor' | 'viewer');
  }
}, [proposalId, user]);
```

This is a single-file, single-function change. It ensures that:
- A global owner sees full permissions on every proposal
- A proposal-level editor also gets edit rights (including adding participants)
- If both exist, the higher role wins

