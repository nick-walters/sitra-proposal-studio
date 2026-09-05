import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { TOUR_STEPS } from "./tourSteps";

interface FeatureTourProps {
  open: boolean;
  /** Called whenever the tour is dismissed or finished — marks it as seen. */
  onClose: () => void;
}

/**
 * The five-step introduction shown over an open proposal. Centred, uses the
 * project's dialog primitive, and closes on Escape or "Get started".
 */
export function FeatureTour({ open, onClose }: FeatureTourProps) {
  const [index, setIndex] = useState(0);
  const last = index === TOUR_STEPS.length - 1;

  // Always start from the beginning when reopened.
  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  // Arrow keys move between steps. Escape is handled by the dialog itself.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setIndex((i) => Math.min(i + 1, TOUR_STEPS.length - 1));
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex((i) => Math.max(i - 1, 0));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const step = TOUR_STEPS[index];

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-2xl p-6 gap-0">
        <div className="flex items-start justify-between gap-4">
          <span className="text-xs font-medium text-muted-foreground">
            {index + 1} of {TOUR_STEPS.length}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 -mt-1 -mr-1 gap-1 text-muted-foreground font-normal"
            onClick={onClose}
          >
            <X className="w-3.5 h-3.5" />
            Skip tour
          </Button>
        </div>

        <h2 className="mt-2 text-lg font-semibold text-foreground">{step.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>

        <div className="mt-4 h-[310px] w-full">{step.illustration}</div>

        <div className="mt-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            {TOUR_STEPS.map((s, i) => (
              <button
                key={s.title}
                type="button"
                aria-label={`Go to step ${i + 1}`}
                aria-current={i === index}
                onClick={() => setIndex(i)}
                className={`h-2 w-2 rounded-full transition-colors ${
                  i === index ? "bg-primary" : "bg-muted-foreground/30 hover:bg-muted-foreground/60"
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(i - 1, 0))}
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </Button>
            <Button
              size="sm"
              className="gap-1"
              onClick={() => (last ? onClose() : setIndex((i) => i + 1))}
            >
              {last ? "Get started" : "Next"}
              {!last && <ChevronRight className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
