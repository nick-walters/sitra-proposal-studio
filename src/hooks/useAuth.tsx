import { useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export function useAuth() {
  // Initialize from sessionStorage for instant hydration on refresh
  const [user, setUser] = useState<User | null>(() => {
    try {
      const cached = sessionStorage.getItem('auth-user');
      // Cached value is slim {id, email} — enough to prevent loading flash
      return cached ? JSON.parse(cached) as User : null;
    } catch {
      return null;
    }
  });
  const [session, setSession] = useState<Session | null>(null);
  // If we have a cached user, don't show loading state - prevents redirect flash
  const [loading, setLoading] = useState(() => {
    try {
      return !sessionStorage.getItem('auth-user');
    } catch {
      return true;
    }
  });

  const updateAuthState = useCallback((newSession: Session | null) => {
    setSession(newSession);
    setUser(newSession?.user ?? null);
    // Cache user for instant hydration on page refresh
    if (newSession?.user) {
      try {
        // Only cache minimal fields needed to prevent loading flash
        const { id, email } = newSession.user;
        sessionStorage.setItem('auth-user', JSON.stringify({ id, email }));
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

    // THEN check for existing session and validate server-side
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        // Validate the session is actually valid server-side
        const { error } = await supabase.auth.getUser();
        if (error) {
          console.warn('Session invalid, signing out:', error.message);
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
