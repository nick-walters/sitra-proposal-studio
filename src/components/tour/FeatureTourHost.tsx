import { useMatch } from "react-router-dom";
import { FeatureTour } from "@/components/tour/FeatureTour";
import { useFeatureTour } from "@/hooks/useFeatureTour";

/**
 * Mounts the feature tour once for every authenticated route.
 *
 * The proposal id is derived from the route, so it is non-null only on
 * /proposal/:id. That keeps the automatic first-open check limited to
 * proposals, while "Show me around" works anywhere.
 */
export function FeatureTourHost() {
  const match = useMatch("/proposal/:id");
  const proposalId = match?.params.id ?? null;
  const { open, close } = useFeatureTour(proposalId);

  return <FeatureTour open={open} onClose={close} />;
}
