import { useEffect, useState, type ReactNode } from "react";

/**
 * Shared scaffolding for the feature-tour illustrations.
 *
 * The illustrations are drawn in code — never screenshots — so they follow the
 * interface as it changes. Where a real component exists (the pills in
 * B31Pill.tsx) it is used directly; where it is impractical to mount a live
 * surface, the appearance is reproduced exactly.
 */

/** True when the reader has asked for reduced motion. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/**
 * Steps a loop through `length` phases every `ms`. When reduced motion is
 * requested the loop never runs and the illustration sits on its end state.
 */
export function useLoop(length: number, ms: number, endPhase = length - 1): number {
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState(reduced ? endPhase : 0);

  useEffect(() => {
    if (reduced) {
      setPhase(endPhase);
      return;
    }
    const timer = window.setInterval(() => setPhase((p) => (p + 1) % length), ms);
    return () => window.clearInterval(timer);
  }, [reduced, length, ms, endPhase]);

  return phase;
}

/** The frame every illustration sits in: fills the fixed slot in the modal. */
export function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="h-full w-full overflow-hidden rounded-md border border-border bg-card p-4">
      {children}
    </div>
  );
}

/** A small caption used to label the panels inside an illustration. */
export function PanelLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

/** The deliverable pentagon, reproduced from applyDeliverablePentagon(). */
export function DeliverablePentagon({ label, colour }: { label: string; colour: string }) {
  const outer = "polygon(0% 0%, calc(100% - 8px) 0%, 100% 50%, calc(100% - 8px) 100%, 0% 100%)";
  const inner = "polygon(0% 0%, calc(100% - 7px) 0%, 100% 50%, calc(100% - 7px) 100%, 0% 100%)";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        height: "17px",
        padding: "0 10px 0 5px",
        fontFamily: "'Times New Roman', Times, serif",
        fontSize: "11pt",
        fontWeight: 700,
        lineHeight: 1,
        color: colour,
        whiteSpace: "nowrap",
        verticalAlign: "baseline",
        userSelect: "none",
      }}
    >
      <span
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: colour,
          clipPath: outer,
        }}
      />
      <span
        style={{
          position: "absolute",
          top: "1.5px",
          bottom: "1.5px",
          left: "1.5px",
          right: "2.5px",
          backgroundColor: "#ffffff",
          clipPath: inner,
        }}
      />
      <span style={{ position: "relative", zIndex: 1 }}>{label}</span>
    </span>
  );
}

/** Work-package colours as they come out of wp_drafts.color. */
export const WP_COLOURS = {
  wp1: "#2563eb",
  wp2: "#0d9488",
  wp3: "#c2410c",
} as const;

/** Currency in the house style: thousand separators, two decimals. */
export function money(value: number): string {
  return value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
