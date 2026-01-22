import { useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export function useAuth() {
  // Initialize from sessionStorage for instant hydration on refresh
  const [user, setUser] = useState<User | null>(() => {
    try {
      const cached = sessionStorage.getItem('auth-user');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const updateAuthState = useCallback((newSession: Session | null) => {
    setSession(newSession);
    setUser(newSession?.user ?? null);
    // Cache user for instant hydration on page refresh
    if (newSession?.user) {
      try {
        sessionStorage.setItem('auth-user', JSON.stringify(newSession.user));
      } catch {
        // Ignore storage errors
      }
    } else {
      sessionStorage.removeItem('auth-user');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        updateAuthState(session);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      updateAuthState(session);
    });

    return () => subscription.unsubscribe();
  }, [updateAuthState]);

  const signOut = async () => {
    sessionStorage.removeItem('auth-user');
    await supabase.auth.signOut();
  };

  return {
    user,
    session,
    loading,
    signOut,
    isAuthenticated: !!user,
  };
}
