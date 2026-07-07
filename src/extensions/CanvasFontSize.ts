import { Mark, mergeAttributes } from '@tiptap/core';
import { ptFont, CANVAS_WIDTH_CM } from '@/lib/impactCanvasTextSizing';

/**
 * Canvas font-size mark — stores a POINT size (e.g. 11) and renders it
 * as a proportion of the physical canvas width via `ptFont(pt)` (cqw).
 * Applied per-run inside canvas text editors (bound cells, shapes, free
 * text) so different runs within one element can differ in size.
 *
 * The stored pt value is preserved verbatim so the value round-trips
 * through save/reload; on render, `ptFont` converts to cqw so on-screen
 * sizing stays synchronous across editor / B2.1 / PDF / PNG.
 */
export interface CanvasFontSizeAttrs {
  pt: number | null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    canvasFontSize: {
      setCanvasFontSize: (pt: number) => ReturnType;
      unsetCanvasFontSize: () => ReturnType;
    };
  }
}

const PT_PER_CM = 72 / 2.54;
const CANVAS_WIDTH_PT = CANVAS_WIDTH_CM * PT_PER_CM;

/** Reverse `ptFont`: given a cqw value produced by ptFont, recover pt. */
function cqwToPt(cqw: number): number {
  return (cqw * CANVAS_WIDTH_PT) / 100;
}

export const CanvasFontSize = Mark.create({
  name: 'canvasFontSize',
  spanning: true,
  excludes: '',
  addAttributes() {
    return {
      pt: {
        default: null,
        parseHTML: (el) => {
          const node = el as HTMLElement;
          const raw = node.getAttribute('data-canvas-pt');
          if (raw) {
            const n = parseFloat(raw);
            if (Number.isFinite(n)) return n;
          }
          // Fallback: parse inline font-size in pt OR cqw (renderHTML
          // emits cqw; if data-canvas-pt is stripped, recover pt from cqw).
          const fs = node.style?.fontSize || '';
          const mPt = fs.match(/([0-9.]+)pt/);
          if (mPt) return parseFloat(mPt[1]);
          const mCqw = fs.match(/([0-9.]+)cqw/);
          if (mCqw) {
            const pt = cqwToPt(parseFloat(mCqw[1]));
            // Snap to nearest whole pt so the dropdown value matches an option.
            return Math.round(pt);
          }
          return null;
        },
        renderHTML: (attrs) => {
          if (attrs.pt == null) return {};
          return {
            'data-canvas-pt': String(attrs.pt),
            style: `font-size: ${ptFont(attrs.pt)}`,
          };
        },
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-canvas-pt]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },
  addCommands() {
    return {
      // CRITICAL: use the OUTER chain (from command props) and DO NOT call
      // `.run()` inside — that would fork the transaction and drop any
      // steps queued upstream (e.g. the `setTextSelection(preservedRange)`
      // that useCanvasSelectionPreservation.apply() puts on the chain
      // before this command). Using the outer chain keeps the mark
      // application on the same tr as the selection restoration.
      setCanvasFontSize:
        (pt) =>
        ({ chain }) => {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.debug('[CanvasFontSize] setCanvasFontSize', { pt });
          }
          return chain()
            .extendMarkRange('canvasFontSize')
            .setMark('canvasFontSize', { pt })
            .run();
        },
      unsetCanvasFontSize:
        () =>
        ({ chain }) =>
          chain().extendMarkRange('canvasFontSize').unsetMark('canvasFontSize').run(),
    };
  },
});
