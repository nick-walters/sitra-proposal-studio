import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { FigureCaptionNodeView } from '@/components/FigureCaptionNodeView';

/**
 * figureCaption — read-only atom node rendering "Figure X. <caption>" live
 * from the figures table. Editing happens on the figure's editor page; the
 * inline caption in Part B is display-only.
 *
 * Persisted DOM shape:
 *   <p class="figure-caption" data-figure-id="…" data-figure-number="…"
 *      data-caption-text="…"><em><strong>Figure X. </strong>caption text</em></p>
 *
 * The caption text is stamped into the HTML on every render so exports and
 * autonumbering (which operate on raw HTML) keep working with no JS.
 */
export const FigureCaptionNode = Node.create({
  name: 'figureCaption',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      figureId: {
        default: null as string | null,
        parseHTML: (el) => el.getAttribute('data-figure-id'),
        renderHTML: (attrs) =>
          attrs.figureId ? { 'data-figure-id': attrs.figureId } : {},
      },
      figureNumber: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-figure-number') || '',
        renderHTML: (attrs) =>
          attrs.figureNumber ? { 'data-figure-number': attrs.figureNumber } : {},
      },
      captionText: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-caption-text') || '',
        renderHTML: (attrs) =>
          attrs.captionText ? { 'data-caption-text': attrs.captionText } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'p.figure-caption[data-figure-id]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { figureNumber, captionText } = node.attrs as {
      figureNumber: string;
      captionText: string;
    };
    return [
      'p',
      mergeAttributes(HTMLAttributes, { class: 'figure-caption' }),
      [
        'em',
        {},
        ['strong', {}, `Figure ${figureNumber}. `],
        captionText || '',
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FigureCaptionNodeView);
  },
});

export default FigureCaptionNode;
