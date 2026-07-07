import { Mark, mergeAttributes } from '@tiptap/core';
import { FONT_FAMILY_HEADER } from '@/lib/impactCanvasTextSizing';

/**
 * Canvas header-style mark — renders the run in "Arial Black" (header
 * font). Independent of size: a run can be header-style at any pt.
 * Applied per-run inside canvas text editors.
 */
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    canvasHeader: {
      toggleCanvasHeader: () => ReturnType;
      setCanvasHeader: () => ReturnType;
      unsetCanvasHeader: () => ReturnType;
    };
  }
}

export const CanvasHeader = Mark.create({
  name: 'canvasHeader',
  spanning: true,
  parseHTML() {
    return [
      { tag: 'span[data-canvas-header]' },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-canvas-header': 'true',
        style: `font-family: ${FONT_FAMILY_HEADER}; font-weight: 900`,
      }),
      0,
    ];
  },
  addCommands() {
    return {
      toggleCanvasHeader:
        () =>
        ({ chain }) =>
          chain().toggleMark(this.name).run(),
      setCanvasHeader:
        () =>
        ({ chain }) =>
          chain().setMark(this.name).run(),
      unsetCanvasHeader:
        () =>
        ({ chain }) =>
          chain().unsetMark(this.name).run(),
    };
  },
});
