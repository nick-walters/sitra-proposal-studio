import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Event used by the profile menu in the top bar to reopen the tour on demand.
 * A plain window event keeps the menu independent of where the tour is mounted.
 */
export const OPEN_FEATURE_TOUR_EVENT = "sps:open-feature-tour";

export function requestFeatureTour() {
  window.dispatchEvent(new CustomEvent(OPEN_FEATURE_TOUR_EVENT));
}

/**
 * Shows the feature tour once per user, on the first proposal they open.
 *
 * The "seen" state lives on `profiles.feature_tour_seen_at`, so it follows the
 * user between machines. Skipping counts as seen; the profile menu can always
 * reopen it.
 */
export function useFeatureTour(proposalId?: string | null) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const checkedRef = useRef(false);

  // Automatic first-open check. Only runs on a proposal, never the dashboard.
  useEffect(() => {
    if (!user?.id || !proposalId || checkedRef.current) return;
    checkedRef.current = true;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("feature_tour_seen_at")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Feature tour: could not read profile", error);
        return;
      }
      if (!cancelled && data && !data.feature_tour_seen_at) setOpen(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, proposalId]);

  // Manual reopen from the profile menu.
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(OPEN_FEATURE_TOUR_EVENT, handler);
    return () => window.removeEventListener(OPEN_FEATURE_TOUR_EVENT, handler);
  }, []);

  const markSeen = useCallback(async () => {
    if (!user?.id) return;
    const { error } = await supabase
      .from("profiles")
      .update({ feature_tour_seen_at: new Date().toISOString() })
      .eq("id", user.id);
    if (error) console.error("Feature tour: could not record that it was seen", error);
  }, [user?.id]);

  const close = useCallback(() => {
    setOpen(false);
    void markSeen();
  }, [markSeen]);

  return { open, close, setOpen };
}
