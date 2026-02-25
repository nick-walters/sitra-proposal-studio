

## Revised Plan: Fix Tab-Switch Refresh Issue

After a thorough re-review, the original 3-fix plan is **correct and complete**. Here is the confirmed assessment:

### Architecture Analysis

The app has two data-fetching patterns:
1. **TanStack React Query** (`useQuery`) — used in `ProposalEditor.tsx` for WP/Case leadership data. Default `refetchOnWindowFocus: true` causes refetch on tab return.
2. **Manual `useState`/`useEffect`** — used in `useProposalData`, `Dashboard.tsx`. These depend on `useAuth`'s `user` state. If `user` state object changes reference on token refresh, these hooks re-run their effects and re-fetch everything.

Both patterns are triggered on tab switch, and both need fixing.

### Confirmed Changes (No Additions Needed)

**1. `src/App.tsx` — Disable `refetchOnWindowFocus` globally**

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});
```

Prevents the `useQuery` calls in `ProposalEditor.tsx` (and any future ones) from auto-refetching.

**2. `src/hooks/useAuth.tsx` — Stabilize state on token refresh**

Two sub-changes:
- In `onAuthStateChange`: skip full state update for `TOKEN_REFRESHED` (just update session silently)
- In `updateAuthState`: use functional `setUser` to return the previous reference if the user ID hasn't changed

This prevents `useProposalData` and other hooks that depend on `user` from seeing a new object reference and re-running their effects.

**3. `src/hooks/useUserRole.ts` — Filter auth events**

Only call `checkRoles()` on `SIGNED_IN` or `SIGNED_OUT`, not on every auth event including token refreshes.

**4. `src/hooks/useTemplates.ts` — Filter auth events**

Same pattern: only call `checkOwner()` on meaningful auth events.

### Why No Additional Changes Are Needed

- **Scroll position**: `ProposalEditor.tsx` already has scroll preservation code (lines 303-339) that saves/restores scroll on visibility change and blur/focus. This will work correctly once the re-render cascade is stopped.
- **`useSectionContent`**: Already handles visibility changes by flushing pending saves — no destructive behavior.
- **`useWindowFocus`**: Already prevents dialogs/popovers from closing on tab switch — no changes needed.
- **Dashboard**: Uses manual fetch triggered by `user` dependency — fixed by the auth stabilization in change 2.
- **`Auth.tsx`**: Its `onAuthStateChange` listener only acts on `PASSWORD_RECOVERY` and `SIGNED_IN` — already filtered, no fix needed.

### Risk Assessment

These changes are low-risk:
- Disabling `refetchOnWindowFocus` is a standard production configuration. Data still refreshes on navigation and after mutations.
- The auth state guard only prevents redundant re-renders — actual sign-in/sign-out flows are unaffected.
- The role/template hooks still check on meaningful auth events.

### Summary

| File | Change | Purpose |
|------|--------|---------|
| `src/App.tsx` | `refetchOnWindowFocus: false` | Stop React Query refetches on tab return |
| `src/hooks/useAuth.tsx` | Guard `TOKEN_REFRESHED` + stable user reference | Stop re-render cascade through all auth-dependent hooks |
| `src/hooks/useUserRole.ts` | Filter to `SIGNED_IN`/`SIGNED_OUT` only | Stop unnecessary role re-checks |
| `src/hooks/useTemplates.ts` | Filter to `SIGNED_IN`/`SIGNED_OUT` only | Stop unnecessary owner re-checks |

4 files, 4 surgical changes. The plan is robust and complete.

