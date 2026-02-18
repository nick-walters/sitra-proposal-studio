import { Node, mergeAttributes } from '@tiptap/core';

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

  renderHTML({ node }) {
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
      mergeAttributes(this.options.HTMLAttributes, {
        'data-acronym-reference': '',
        'contenteditable': 'false',
        'style': baseStyle,
      }),
      ...children,
    ];
  },

  addCommands() {
    return {
      insertAcronymReference:
        (attributes) =>
        ({ tr, dispatch }) => {
          const node = this.type.create(attributes);
          if (dispatch) {
            tr.replaceSelectionWith(node);
          }
          return true;
        },
    };
  },
});

export default AcronymReference;
