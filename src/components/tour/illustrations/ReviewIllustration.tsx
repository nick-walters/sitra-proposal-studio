import { Check, X, MessageSquare } from "lucide-react";
import { Frame, PanelLabel, useLoop } from "./shared";

/**
 * Step 5 — a tracked deletion and insertion in the real track-changes styling,
 * with the review panel alongside. The comment arrives after a moment.
 */
export function ReviewIllustration() {
  const phase = useLoop(2, 2600, 1);
  const commentVisible = phase === 1;

  return (
    <Frame>
      <div className="grid h-full grid-cols-[1.25fr_1fr] gap-3">
        {/* The paragraph */}
        <div className="rounded-md border border-border bg-background p-3">
          <p
            className="text-[11pt] leading-relaxed text-foreground"
            style={{ fontFamily: "'Times New Roman', Times, serif", textAlign: "justify" }}
          >
            The consortium will deliver a foresight synthesis{" "}
            <span data-track-deletion>within twelve months</span>{" "}
            <span data-track-insertion>by the end of month 18</span>, drawing on the pilot findings
            gathered by every partner and reviewed at the consortium meeting.
          </p>
        </div>

        {/* Review panel */}
        <div className="space-y-2">
          <PanelLabel>Review</PanelLabel>

          <div className="rounded-md border border-border bg-background p-2">
            <div className="mb-1 flex items-center gap-1.5">
              <span className="h-4 w-4 shrink-0 rounded-full bg-primary/20 text-center text-[9px] font-semibold leading-4 text-primary">
                AV
              </span>
              <span className="text-[10px] font-medium text-foreground">Aino Virtanen</span>
              <span className="ml-auto text-[9px] text-muted-foreground">2 min ago</span>
            </div>
            <p className="text-[10px] leading-snug text-muted-foreground">
              Replaced <span data-track-deletion>within twelve months</span> with{" "}
              <span data-track-insertion>by the end of month 18</span>
            </p>
            <div className="mt-1.5 flex gap-1.5">
              <button
                type="button"
                tabIndex={-1}
                className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-[2px] text-[10px] text-foreground"
              >
                <Check className="h-3 w-3" /> Accept
              </button>
              <button
                type="button"
                tabIndex={-1}
                className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-[2px] text-[10px] text-foreground"
              >
                <X className="h-3 w-3 text-destructive" /> Reject
              </button>
            </div>
          </div>

          <div
            className="rounded-md border border-border bg-muted/40 p-2 transition-all duration-500"
            style={{
              opacity: commentVisible ? 1 : 0,
              transform: commentVisible ? "translateY(0)" : "translateY(6px)",
            }}
          >
            <div className="mb-1 flex items-center gap-1.5">
              <MessageSquare className="h-3 w-3 text-primary" />
              <span className="text-[10px] font-medium text-foreground">Sitra — comment</span>
            </div>
            <p className="text-[10px] leading-snug text-muted-foreground">
              Agreed — M18 matches the pilot timetable in WP3.
            </p>
          </div>
        </div>
      </div>
    </Frame>
  );
}
