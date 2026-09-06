import type { ReactNode } from "react";
import { OrganisationIllustration } from "./illustrations/OrganisationIllustration";
import { BudgetIllustration } from "./illustrations/BudgetIllustration";
import { CrossReferenceIllustration } from "./illustrations/CrossReferenceIllustration";
import { FlowIllustration } from "./illustrations/FlowIllustration";
import { ReviewIllustration } from "./illustrations/ReviewIllustration";

/**
 * The content of the first-open feature tour, held as data so the wording can
 * be edited without touching the modal itself.
 *
 * `illustration` is the swap point: replace the placeholder element for a step
 * with a real illustration component and nothing else has to change.
 */
export interface TourStep {
  /** Heading shown above the body text. */
  title: string;
  /** One short paragraph. */
  body: string;
  /** What the finished illustration will show — used by the placeholder. */
  illustrationNote: string;
  /** Rendered inside the fixed ~310px illustration area. */
  illustration: ReactNode;
}

/**
 * One illustration per step, in order. Swapping an illustration is a one-line
 * change here — the components live in ./illustrations/.
 */
const ILLUSTRATIONS: ReactNode[] = [
  <OrganisationIllustration />,
  <BudgetIllustration />,
  <CrossReferenceIllustration />,
  <FlowIllustration />,
  <ReviewIllustration />,
];

const CONTENT: Omit<TourStep, "illustration">[] = [
  {
    title: "Everything about your organisation, in one place",
    body:
      "Collect participant details, contacts, expertise and past projects here first. Sitra copies them into the portal for you — you only need to check them there. And if the portal isn’t open yet, nothing is lost.",
    illustrationNote: "Participant details, contacts and expertise gathered on one page",
  },
  {
    title: "A budget that does the arithmetic for you",
    body:
      "Costs per participant per work package, with indirect costs, totals and the requested contribution all calculated as you type. No spreadsheet formulas to break.",
    illustrationNote: "A budget table totalling itself as figures are typed",
  },
  {
    title: "Tag once. Renumber as often as you like",
    body:
      "Reference a work package, task, deliverable, milestone or case study anywhere in the text. Reorder them later and every mention updates itself.",
    illustrationNote: "Cross-reference badges in text updating after a reorder",
  },
  {
    title: "Write it once. It appears where it’s needed",
    body:
      "Staff effort and cost justifications entered in Part A flow straight into the Part B3.1 tables. Your work packages and tasks draw their own Gantt chart, so the timing is visible from the first draft.",
    illustrationNote: "Part A effort feeding the B3.1 tables and a Gantt chart",
  },
  {
    title: "See who changed what, and why",
    body:
      "Turn on track changes, leave comments, and work through everything in the review panel. Every version is kept, so nothing is ever really lost.",
    illustrationNote: "Tracked changes and comments in the review panel",
  },
];

export const TOUR_STEPS: TourStep[] = CONTENT.map((step, index) => ({
  ...step,
  illustration: ILLUSTRATIONS[index],
}));
