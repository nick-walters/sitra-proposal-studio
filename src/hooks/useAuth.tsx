import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * AuthProvider — single, shared source of truth for the auth session.
 *
 * Previously `useAuth` was a plain hook called independently in 26+
 * components. Each call spun up its own `onAuthStateChange` listener
 * and its own `getSession()` + `getUser()` validation pair, producing
 * staggered setStates on a cold load. That caused the visible
 * flash / re-mount and the dead-click window between renders.
 *
 * Now everything mounts inside this provider, which runs a single
 * subscription + validation flight. `App` gates the initial render on
 * `loading`, so the tree paints exactly once.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const updateAuthState = useCallback((newSession: Session | null) => {
    setSession(newSession);
    const newUser = newSession?.user ?? null;
    setUser((prev) => {
      // Preserve reference when the id is unchanged to avoid
      // downstream effect cascades that key off `user`.
      if (prev?.id === newUser?.id && prev && newUser) return prev;
      return newUser;
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    // 1. Subscribe FIRST so we don't miss events between setup and getSession.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (cancelled) return;
      if (event === 'TOKEN_REFRESHED') {
        // Silent refresh on tab focus — refresh session ref but no user flip.
        setSession(nextSession);
        return;
      }
      updateAuthState(nextSession);
    });

    // 2. Then resolve the existing session. Validate server-side, but
    // tolerate transient network errors so a flaky refresh doesn't sign
    // the user out.
    void supabase.auth.getSession().then(async ({ data: { session: existing } }) => {
      if (cancelled) return;
      if (existing) {
        const { error } = await supabase.auth.getUser();
        if (cancelled) return;
        if (error) {
          const msg = (error.message || '').toLowerCase();
          const isNetworkError =
            msg.includes('failed to fetch') ||
            msg.includes('networkerror') ||
            msg.includes('aborterror') ||
            msg.includes('load failed') ||
            msg.includes('network') ||
            msg.includes('timeout');
          if (!isNetworkError) {
            console.warn('Session invalid, signing out:', error.message);
            await supabase.auth.signOut();
            if (!cancelled) updateAuthState(null);
            return;
          }
          console.warn('Network error during session validation, keeping session:', error.message);
        }
      }
      updateAuthState(existing);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [updateAuthState]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      signOut,
      isAuthenticated: !!user,
    }),
    [user, session, loading, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return ctx;
}
