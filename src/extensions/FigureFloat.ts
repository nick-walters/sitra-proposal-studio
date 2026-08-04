import { Extension } from '@tiptap/core';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { ImageFloat } from '@/components/ResizableImage';

/**
 * Figure Float
 *
 * A narrow figure floats as a *pair*: the image floats on one side, and its
 * caption paragraph floats on the SAME side with `clear: <side>` so it drops
 * directly below the image. Same side + same width + clear = one floated
 * column that body text wraps around, without introducing a wrapper node
 * (captions stay top-level siblings, so renumbering and the CaptionLabel lock
 * are untouched).
 *
 * `setFigureFloat` mutates the image node AND its paired caption in ONE
 * transaction so the two can never diverge through the UI.
 */

/** Same pairing rule BlockReordering/findBlockRange uses: the paragraph right
 *  after an image that reads like a figure caption. */
export function isFigureCaptionParagraph(node: ProseMirrorNode | null | undefined): boolean {
  if (!node || node.type.name !== 'paragraph') return false;
  const cls: string = node.attrs?.class || '';
  if (cls.includes('figure-caption')) return true;
  return node.textContent.toLowerCase().startsWith('figure ');
}

/** Position of the caption paragraph paired with the image at `imagePos`. */
export function findPairedCaptionPos(
  doc: ProseMirrorNode,
  imagePos: number,
  imageNode: ProseMirrorNode,
): number | null {
  const afterPos = imagePos + imageNode.nodeSize;
  if (afterPos >= doc.content.size) return null;
  const afterNode = doc.resolve(afterPos).nodeAfter;
  return isFigureCaptionParagraph(afterNode) ? afterPos : null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    figureFloat: {
      /** Float the selected (or given) image + its paired caption together. */
      setFigureFloat: (side: ImageFloat, imagePos?: number) => ReturnType;
    };
  }
}

export const FigureFloat = Extension.create({
  name: 'figureFloat',

  addCommands() {
    return {
      setFigureFloat:
        (side: ImageFloat, imagePos?: number) =>
        ({ state, tr, dispatch }) => {
          const { doc, selection } = state;

          let pos = typeof imagePos === 'number' ? imagePos : null;
          if (pos == null) {
            const nodeAtSelection = (selection as any).node as ProseMirrorNode | undefined;
            if (nodeAtSelection?.type.name === 'image') {
              pos = selection.from;
            }
          }
          if (pos == null) return false;

          const imageNode = doc.nodeAt(pos);
          if (!imageNode || imageNode.type.name !== 'image') return false;

          const nextSide: ImageFloat = side === 'left' || side === 'right' ? side : 'none';
          const captionPos = findPairedCaptionPos(doc, pos, imageNode);

          if (!dispatch) return true;

          tr.setNodeMarkup(pos, undefined, { ...imageNode.attrs, float: nextSide });

          if (captionPos != null) {
            const captionNode = tr.doc.nodeAt(captionPos);
            if (captionNode) {
              tr.setNodeMarkup(captionPos, undefined, {
                ...captionNode.attrs,
                'data-float': nextSide === 'none' ? null : nextSide,
              });
            }
          }

          dispatch(tr);
          return true;
        },
    };
  },
});
