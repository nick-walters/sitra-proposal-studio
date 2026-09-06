import { ParticipantBubble, WPBubble } from "@/components/B31Pill";
import { ArrowDown } from "lucide-react";
import { Frame, PanelLabel, WP_COLOURS, money, usePrefersReducedMotion } from "./shared";

const WPS = [
  { number: 1, name: "Coordination", colour: WP_COLOURS.wp1, start: 0, months: 36 },
  { number: 2, name: "Foresight", colour: WP_COLOURS.wp2, start: 3, months: 18 },
  { number: 3, name: "Piloting", colour: WP_COLOURS.wp3, start: 12, months: 21 },
];

/** Step 4 — Part A cost justifications and work packages feeding Part B3.1. */
export function FlowIllustration() {
  const reduced = usePrefersReducedMotion();

  return (
    <Frame>
      <div className="grid h-full grid-cols-[1fr_auto_1fr] items-center gap-3">
        {/* Part A */}
        <div className="space-y-2">
          <PanelLabel>Part A — costs &amp; work packages</PanelLabel>
          <table className="w-full border-collapse text-[10px]">
            <tbody>
              <tr className="border-b border-border/60">
                <td className="py-[3px] pr-2 text-foreground">Personnel — 12 PM</td>
                <td className="py-[3px] text-right tabular-nums text-foreground">{money(96000)}</td>
              </tr>
              <tr>
                <td className="py-[3px] pr-2 text-foreground">Travel — 4 meetings</td>
                <td className="py-[3px] text-right tabular-nums text-foreground">{money(8000)}</td>
              </tr>
            </tbody>
          </table>
          <div className="space-y-1 pt-1">
            {WPS.map((wp) => (
              <div key={wp.number} className="flex items-center gap-2">
                <WPBubble wpNumber={wp.number} wpColor={wp.colour} size="caption" />
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  M{wp.start + 1}–M{wp.start + wp.months}
                </span>
              </div>
            ))}
          </div>
        </div>

        <ArrowDown className="h-5 w-5 -rotate-90 text-primary" aria-hidden="true" />

        {/* Part B3.1 */}
        <div className="space-y-2">
          <PanelLabel>Part B3.1</PanelLabel>
          <div className="rounded-md border border-border bg-background p-2">
            <div className="mb-1 text-[9px] uppercase tracking-wide text-muted-foreground">
              Table 3.1.h
            </div>
            <div className="flex items-center gap-1.5">
              <ParticipantBubble number={1} shortName="Sitra" size="caption" />
              <WPBubble wpNumber={2} wpColor={WP_COLOURS.wp2} size="caption" />
              <WPBubble wpNumber={3} wpColor={WP_COLOURS.wp3} size="caption" />
              <span className="ml-auto text-[10px] tabular-nums text-foreground">{money(104000)}</span>
            </div>
          </div>

          <div className="rounded-md border border-border bg-background p-2">
            <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-wide text-muted-foreground">
              <span>Gantt</span>
              <span>M1–M36</span>
            </div>
            <div className="space-y-[6px]">
              {WPS.map((wp, i) => (
                <div key={wp.number} className="flex items-center gap-1.5">
                  <span className="w-7 text-[9px] tabular-nums text-muted-foreground">WP{wp.number}</span>
                  <div className="relative h-[9px] flex-1 rounded-sm bg-muted">
                    <div
                      className="absolute top-0 h-[9px] rounded-sm"
                      style={{
                        left: `${(wp.start / 36) * 100}%`,
                        width: `${(wp.months / 36) * 100}%`,
                        backgroundColor: wp.colour,
                        transformOrigin: "left center",
                        animation: reduced
                          ? undefined
                          : `tour-draw 4.5s ease-in-out ${i * 0.35}s infinite`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes tour-draw {
        0% { transform: scaleX(0); }
        25%, 85% { transform: scaleX(1); }
        100% { transform: scaleX(1); }
      }`}</style>
    </Frame>
  );
}
