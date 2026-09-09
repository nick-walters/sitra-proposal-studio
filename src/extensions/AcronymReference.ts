import { Node, mergeAttributes } from '@tiptap/core';
import {
  getRefDisplayEntry,
  subscribeRefDisplay,
  ACRONYM_DISPLAY_KEY,
} from '@/lib/refDisplay';

export interface AcronymSegment {
  text: string;
  color: string;
}

export interface AcronymReferenceOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    acronymReference: {
      insertAcronymReference: (attributes: { segments: AcronymSegment[] }) => ReturnType;
    };
  }
}

export const AcronymReference = Node.create<AcronymReferenceOptions>({
  name: 'acronymReference',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      segments: {
        default: [],
        parseHTML: (element: HTMLElement) => {
          try {
            return JSON.parse(element.getAttribute('data-acronym-segments') || '[]');
          } catch {
            return [];
          }
        },
        renderHTML: (attributes: Record<string, any>) => {
          return {
            'data-acronym-segments': JSON.stringify(attributes.segments),
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-acronym-reference]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const segments: AcronymSegment[] = node.attrs.segments || [];

    const baseStyle = `
      display: inline;
      font-family: 'Arial Black', Arial, sans-serif;
      font-weight: 900;
      font-size: inherit;
      white-space: nowrap;
      cursor: pointer;
    `.replace(/\s+/g, ' ').trim();

    const children = segments.map((seg: AcronymSegment) => [
      'span',
      { style: `color: ${seg.color};` },
      seg.text,
    ]);

    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-acronym-reference': '',
        'contenteditable': 'false',
        'style': baseStyle,
      }),
      ...children,
    ];
  },

  /**
   * On screen the acronym is drawn from the proposal's CURRENT
   * `acronym_segments`, so renaming the project or recolouring its letters
   * updates every badge already in the document. Nothing is written back —
   * `renderHTML` still serialises the segments stored at insertion. With no
   * live entry the stored segments are drawn, so the badge is never blank.
   */
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span');
      let lastKey: string | null = null;

      const render = () => {
        const stored: AcronymSegment[] = (node.attrs.segments as AcronymSegment[]) || [];
        const live = getRefDisplayEntry('acronym', ACRONYM_DISPLAY_KEY);
        const segments: AcronymSegment[] =
          live && live.segments && live.segments.length
            ? live.segments.map((text, i) => ({
                text,
                color: live.segmentColors?.[i] || stored[i]?.color || '#000000',
              }))
            : stored;

        const key = segments.map((s) => `${s.text}~${s.color}`).join('|');
        if (key === lastKey) return;
        lastKey = key;

        dom.setAttribute('data-acronym-reference', '');
        dom.setAttribute('contenteditable', 'false');
        dom.setAttribute('data-acronym-segments', JSON.stringify(stored));
        dom.setAttribute(
          'style',
          "display: inline; font-family: 'Arial Black', Arial, sans-serif; font-weight: 900; font-size: inherit; white-space: nowrap; cursor: pointer;",
        );
        dom.textContent = '';
        for (const seg of segments) {
          const part = document.createElement('span');
          part.setAttribute('style', `color: ${seg.color};`);
          part.textContent = seg.text;
          dom.appendChild(part);
        }
      };

      render();
      const unsubscribe = subscribeRefDisplay('acronym', render);

      return {
        dom,
        update(updatedNode) {
          if (updatedNode.type.name !== 'acronymReference') return false;
          node = updatedNode;
          render();
          return true;
        },
        destroy() {
          unsubscribe();
        },
        ignoreMutation() {
          return true;
        },
      };
    };
  },

  addCommands() {
    return {
      insertAcronymReference:
        (attributes) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            const node = this.type.create(attributes);
            tr.replaceSelectionWith(node);
          }
          return true;
        },
    };
  },
});

export default AcronymReference;
