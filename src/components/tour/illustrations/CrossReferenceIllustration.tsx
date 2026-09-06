import { WPBubble } from "@/components/B31Pill";
import { GripVertical } from "lucide-react";
import { DeliverablePentagon, Frame, WP_COLOURS, useLoop } from "./shared";

/**
 * Step 3 — a sentence carrying a WP badge and a deliverable badge. Two
 * deliverable cards swap places and the badge in the sentence renumbers itself.
 */
export function CrossReferenceIllustration() {
  const phase = useLoop(2, 2800, 1);
  const swapped = phase === 1;

  const foresight = { title: "Foresight synthesis report", month: "M12" };
  const toolkit = { title: "Practitioner toolkit", month: "M18" };

  // Deliverable numbers follow position, so the swap renumbers both cards
  // and the badge in the text above.
  const first = swapped ? toolkit : foresight;
  const second = swapped ? foresight : toolkit;
  const toolkitNumber = swapped ? "D2.1" : "D2.2";

  return (
    <Frame>
      <div className="rounded-md border border-border bg-background p-3">
        <p
          className="text-[12pt] leading-relaxed text-foreground"
          style={{ fontFamily: "'Times New Roman', Times, serif" }}
        >
          The synthesis produced in{" "}
          <WPBubble wpNumber={2} wpColor={WP_COLOURS.wp2} shortName="Foresight" size="caption" /> is
          published as{" "}
          <span className="inline-block transition-opacity duration-500">
            <DeliverablePentagon label={toolkitNumber} colour={WP_COLOURS.wp2} />
          </span>{" "}
          and shared with every partner.
        </p>
      </div>

      <div className="mt-3 space-y-2">
        {[first, second].map((d, index) => {
          const number = `D2.${index + 1}`;
          const isToolkit = d.title === toolkit.title;
          return (
            <div
              key={d.title}
              className={[
                "flex items-center gap-2 rounded-md border border-border bg-background px-2 py-[7px] transition-all duration-500",
                isToolkit ? "ring-1 ring-primary/40" : "",
              ].join(" ")}
            >
              <GripVertical className="h-3.5 w-3.5 text-blue-600" />
              <DeliverablePentagon label={number} colour={WP_COLOURS.wp2} />
              <span className="flex-1 truncate text-[11px] text-foreground">{d.title}</span>
              <span className="text-[10px] tabular-nums text-muted-foreground">{d.month}</span>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-[10px] text-muted-foreground">
        Reorder the deliverables and every mention of them in the text renumbers itself.
      </p>
    </Frame>
  );
}
