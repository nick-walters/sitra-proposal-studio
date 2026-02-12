

# Fix: Auth Session Validation and Dashboard Error Recovery

## Problem

When a user's access is revoked and re-granted, their browser may hold a stale JWT session. The current `useAuth` hook trusts the locally-cached session without server-side validation. This causes:

- The user appears logged in but all database queries return empty results
- The dashboard shows "no proposals" instead of prompting re-authentication
- No error feedback tells the user what is wrong

## Solution

### 1. Add server-side session validation in `useAuth`

After calling `getSession()`, also call `getUser()` to verify the JWT is actually valid with the auth server. If `getUser()` fails, force a sign-out and clear cached state.

**File: `src/hooks/useAuth.tsx`**

- After `getSession()` returns a session, call `supabase.auth.getUser()` to validate server-side
- If `getUser()` returns an error (e.g., `user_not_found`), call `signOut()` to clear all cached state
- This ensures stale sessions are detected immediately on page load

### 2. Add error detection in Dashboard proposal fetch

**File: `src/pages/Dashboard.tsx`**

- After the proposals query returns, check if an empty result might indicate an auth problem
- Call `supabase.auth.getUser()` as a health check when proposals come back empty
- If the health check fails, force sign-out and redirect to login with a toast message explaining the session expired
- This acts as a safety net if the `useAuth` validation hasn't completed yet

### 3. Handle `onAuthStateChange` token refresh failures

**File: `src/hooks/useAuth.tsx`**

- Listen for the `TOKEN_REFRESHED` event -- if refresh fails and fires `SIGNED_OUT`, the existing code already handles this
- Add handling for the `USER_UPDATED` event to re-validate

## Technical Details

### useAuth.tsx changes

```typescript
useEffect(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
      updateAuthState(session);
    }
  );

  // Check for existing session, then validate server-side
  supabase.auth.getSession().then(async ({ data: { session } }) => {
    if (session) {
      // Validate the session is actually valid server-side
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        // Session is stale/invalid -- force sign out
        console.warn('Session invalid, signing out:', error?.message);
        sessionStorage.removeItem('auth-user');
        await supabase.auth.signOut();
        updateAuthState(null);
        return;
      }
    }
    updateAuthState(session);
  });

  return () => subscription.unsubscribe();
}, [updateAuthState]);
```

### Dashboard.tsx changes

```typescript
// Inside fetchProposals, after receiving empty results:
if ((data || []).length === 0) {
  // Verify auth is still valid -- empty results could mean stale session
  const { error: authError } = await supabase.auth.getUser();
  if (authError) {
    sessionStorage.removeItem('auth-user');
    toast.error('Your session has expired. Please log in again.');
    await supabase.auth.signOut();
    return;
  }
}
```

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/useAuth.tsx` | Add server-side session validation after `getSession()` |
| `src/pages/Dashboard.tsx` | Add auth health check when proposals query returns empty |

## Risk Assessment

- **Low risk**: The `getUser()` call adds one extra network request on page load, but only when a session exists
- The sign-out fallback is safe -- worst case, a user with a genuinely valid session but zero proposals gets an unnecessary sign-out (mitigated by only checking when results are empty AND `getUser()` fails)

