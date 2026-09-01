/**
 * THE capture host for the Gantt raster.
 *
 * Exactly one element in the whole application ever carries
 * `data-figure-capture="gantt"`: the wrapper mounted here. The chart component
 * itself and the on-board B3.1 block deliberately carry NO capture marker —
 * they are laid out inside width-constrained, `overflow: hidden` containers
 * that clip the work-package banner tips, so a capture taken from them is
 * wrong. `typstFigures.captureOne` selects on this marker alone: if the host
 * is not mounted the figure is reported missing rather than substituted.
 *
 * The host is positioned off-canvas (not `display: none`) so it has a real
 * measured size, and it reports readiness only once it has actually painted.
 */

import { useEffect, useRef } from 'react';
import { GanttChartFigure } from '@/components/GanttChartFigure';

interface Props {
  proposalId: string;
  figure: { id: string; figure_number: string; content: unknown };
  /** Called once the chart has painted with a non-zero box. */
  onReady?: () => void;
  /** Called if it never painted (~30s). */
  onStalled?: () => void;
}

export function GanttCaptureHost({ proposalId, figure, onReady, onStalled }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const readyRef = useRef(onReady);
  const stalledRef = useRef(onStalled);
  readyRef.current = onReady;
  stalledRef.current = onStalled;

  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    let tries = 0;
    const check = () => {
      if (cancelled) return;
      const el = hostRef.current;
      if (el && el.offsetHeight > 0 && el.offsetWidth > 0) {
        readyRef.current?.();
        return;
      }
      if (tries++ > 1800) {
        stalledRef.current?.();
        return;
      }
      frame = requestAnimationFrame(check);
    };
    frame = requestAnimationFrame(check);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [figure.id]);

  return (
    <div
      aria-hidden
      style={{ position: 'fixed', left: -20000, top: 0, width: 1400, pointerEvents: 'none' }}
    >
      {/* `fit-content` so the raster is the chart and nothing else: a block
          wrapper would take the 1400px host width and pad the capture with
          white, which Typst then scales down inside the column. */}
      <div ref={hostRef} data-figure-capture="gantt" style={{ width: 'fit-content' }}>
        <GanttChartFigure
          figureId={figure.id}
          proposalId={proposalId}
          figureNumber={figure.figure_number}
          content={figure.content as never}
          onContentChange={() => {}}
          canEdit={false}
        />
      </div>
    </div>
  );
}
