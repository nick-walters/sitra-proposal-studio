import { Mark, mergeAttributes } from '@tiptap/core';
import { ptFont } from '@/lib/impactCanvasTextSizing';

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

export const CanvasFontSize = Mark.create({
  name: 'canvasFontSize',
  spanning: true,
  excludes: '',
  addAttributes() {
    return {
      pt: {
        default: null,
        parseHTML: (el) => {
          const raw = (el as HTMLElement).getAttribute('data-canvas-pt');
          if (raw) {
            const n = parseFloat(raw);
            return Number.isFinite(n) ? n : null;
          }
          // Fallback: parse inline font-size in pt or cqw and infer.
          const fs = (el as HTMLElement).style?.fontSize || '';
          const m = fs.match(/([0-9.]+)pt/);
          if (m) return parseFloat(m[1]);
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
    return [
      { tag: 'span[data-canvas-pt]' },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },
  addCommands() {
    return {
      setCanvasFontSize:
        (pt) =>
        ({ chain }) =>
          chain().setMark(this.name, { pt }).run(),
      unsetCanvasFontSize:
        () =>
        ({ chain }) =>
          chain().unsetMark(this.name).run(),
    };
  },
});
