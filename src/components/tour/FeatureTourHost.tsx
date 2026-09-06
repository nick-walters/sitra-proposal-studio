import { useMatch } from "react-router-dom";
import { FeatureTour } from "./FeatureTour";
import { useFeatureTour } from "@/hooks/useFeatureTour";

/**
 * Single, app-wide mount for the feature tour.
 *
 * Mounted once inside the router so "Show me around" works on every route a
 * signed-in user can reach (dashboard, proposal, admin). The AUTOMATIC
 * first-time appearance stays tied to opening a proposal: the proposal id is
 * only non-null on /proposal/:id, and the hook's automatic check does nothing
 * without one.
 */
export function FeatureTourHost() {
  const match = useMatch("/proposal/:id");
  const proposalId = match?.params.id ?? null;
  const { open, close } = useFeatureTour(proposalId);
  return <FeatureTour open={open} onClose={close} />;
}
