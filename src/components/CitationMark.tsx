import { Mark, Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import DOMPurify from 'dompurify';
import { INLINE_EMPHASIS_CONFIG } from '@/lib/sanitizePresets';

export interface CitationMarkOptions {
  getReference: (citationNumber: number) => { citation: string } | undefined;
}

export const CitationNode = Node.create({
  name: 'citation',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  isolating: true,
  priority: 1200,

  addAttributes() {
    return {
      citationNumber: {
        default: null,
        parseHTML: (element) => {
          const el = element as HTMLElement;
          const v = el.getAttribute('data-citation');
          if (v && /^\d+$/.test(v)) return parseInt(v, 10);
          const text = (el.textContent || '').trim();
          const match = text.match(/^\[?(\d+)\]?$/);
          return match ? parseInt(match[1], 10) : null;
        },
        renderHTML: (attrs) =>
          attrs.citationNumber != null ? { 'data-citation': String(attrs.citationNumber) } : {},
      },
    };
  },

  parseHTML() {
    const getCitationAttrs = (element: HTMLElement) => {
      const v = element.getAttribute('data-citation');
      if (v && /^\d+$/.test(v)) return { citationNumber: parseInt(v, 10) };
      const text = (element.textContent || '').trim();
      const match = text.match(/^\[?(\d+)\]?$/);
      return match ? { citationNumber: parseInt(match[1], 10) } : false;
    };

    return [
      {
        tag: 'sup[data-citation]',
        getAttrs: (element) => getCitationAttrs(element as HTMLElement),
      },
      {
        tag: 'sup',
        getAttrs: (element) => getCitationAttrs(element as HTMLElement),
      },
      {
        tag: 'span[data-citation]',
        getAttrs: (element) => getCitationAttrs(element as HTMLElement),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const n = HTMLAttributes.citationNumber ?? HTMLAttributes['data-citation'] ?? '';
    return ['sup', mergeAttributes(HTMLAttributes), String(n)];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('sup');

      const render = () => {
        const n = node.attrs.citationNumber;
        const value = n != null ? String(n) : '';
        dom.setAttribute('data-citation', value);
        dom.setAttribute('contenteditable', 'false');
        dom.textContent = value;
      };

      render();

      return {
        dom,
        update(updatedNode) {
          if (updatedNode.type.name !== 'citation') return false;
          node = updatedNode;
          render();
          return true;
        },
        ignoreMutation() {
          return true;
        },
        stopEvent(event) {
          return event.type === 'beforeinput' || event.type === 'input';
        },
      };
    };
  },

  addProseMirrorPlugins() {
    return [createAdjacentCitationCommaPlugin()];
  },
});

// Inserts a non-editable superscript comma between two citations that sit
// immediately next to each other in the document (no characters between).
function createAdjacentCitationCommaPlugin() {
  const isCitationChild = (child: any) =>
    child.type.name === 'citation' ||
    (child.isText && child.marks.some((m: any) => m.type.name === 'citationMark'));

  const build = (doc: any) => {
    const decos: Decoration[] = [];
    doc.descendants((node: any, pos: number) => {
      if (!node.isTextblock) return;
      let prevEnd: number | null = null;
      node.forEach((child: any, offset: number) => {
        const childStart = pos + 1 + offset;
        if (isCitationChild(child)) {
          if (prevEnd === childStart) {
            decos.push(
              Decoration.widget(
                childStart,
                () => {
                  const sup = document.createElement('sup');
                  sup.textContent = ',';
                  sup.setAttribute('data-citation-comma', '');
                  sup.setAttribute('contenteditable', 'false');
                  (sup.style as any).userSelect = 'none';
                  return sup;
                },
                { side: -1, ignoreSelection: true, key: `cc-${childStart}` }
              )
            );
          }
          prevEnd = childStart + child.nodeSize;
        } else {
          prevEnd = null;
        }
      });
    });
    return DecorationSet.create(doc, decos);
  };

  return new Plugin({
    key: new PluginKey('adjacentCitationComma'),
    state: {
      init: (_, state) => build(state.doc),
      apply: (tr, old) => (tr.docChanged ? build(tr.doc) : old),
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
}

export const CitationMark = Mark.create<CitationMarkOptions>({
  name: 'citationMark',
  // Higher priority than Superscript so <sup> elements with a numeric body
  // (citations) are claimed by this mark and keep their data-citation attr.
  priority: 1100,
  inclusive: false,

  addOptions() {
    return {
      getReference: () => undefined,
    };
  },

  parseHTML() {
    return [
      {
        tag: 'sup',
        getAttrs: (element) => {
          const el = element as HTMLElement;
          const dataAttr = el.getAttribute('data-citation');
          if (dataAttr && /^\d+$/.test(dataAttr)) {
            return { citationNumber: parseInt(dataAttr, 10) };
          }
          const text = (el.textContent || '').trim();
          const match = text.match(/^\[?(\d+)\]?$/);
          if (match) {
            return { citationNumber: parseInt(match[1], 10) };
          }
          return false;
        },
      },
    ];
  },

  addAttributes() {
    return {
      citationNumber: {
        default: null,
        parseHTML: (element) => {
          const el = element as HTMLElement;
          const v = el.getAttribute('data-citation');
          if (v && /^\d+$/.test(v)) return parseInt(v, 10);
          const text = (el.textContent || '').trim();
          const match = text.match(/^\[?(\d+)\]?$/);
          return match ? parseInt(match[1], 10) : null;
        },
        renderHTML: (attrs) =>
          attrs.citationNumber != null ? { 'data-citation': String(attrs.citationNumber) } : {},
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return ['sup', mergeAttributes(HTMLAttributes), 0];
  },
});

// Tooltip plugin for citation hover
export function createCitationTooltipPlugin(
  getReference: (num: number) => { citation: string } | undefined
) {
  let tooltip: HTMLDivElement | null = null;
  let hideTimeout: ReturnType<typeof setTimeout> | null = null;

  const showTooltip = (view: any, pos: { top: number; left: number }, content: string) => {
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.className = 'citation-tooltip';
      tooltip.style.cssText = `
        position: fixed;
        z-index: 9999;
        max-width: 400px;
        padding: 8px 12px;
        background: hsl(var(--popover));
        color: hsl(var(--popover-foreground));
        border: 1px solid hsl(var(--border));
        border-radius: 6px;
        font-size: 12px;
        line-height: 1.4;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        pointer-events: none;
        font-family: "Times New Roman", Times, serif;
      `;
      document.body.appendChild(tooltip);
    }

    // Format the citation - convert markdown-style formatting to HTML
    const formattedContent = content
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');

    tooltip.innerHTML = DOMPurify.sanitize(formattedContent, INLINE_EMPHASIS_CONFIG);
    tooltip.style.display = 'block';
    
    // Position tooltip above the citation
    const tooltipRect = tooltip.getBoundingClientRect();
    let left = pos.left - tooltipRect.width / 2;
    let top = pos.top - tooltipRect.height - 8;

    // Keep within viewport
    if (left < 10) left = 10;
    if (left + tooltipRect.width > window.innerWidth - 10) {
      left = window.innerWidth - tooltipRect.width - 10;
    }
    if (top < 10) {
      top = pos.top + 20; // Show below instead
    }

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };

  const hideTooltip = () => {
    if (tooltip) {
      tooltip.style.display = 'none';
    }
  };

  return new Plugin({
    key: new PluginKey('citationTooltip'),
    props: {
      handleDOMEvents: {
        mouseover(view, event) {
          const target = event.target as HTMLElement;

          // Check if hovering over a citation superscript
          if (target.tagName === 'SUP') {
            const dataAttr = target.getAttribute('data-citation');
            const text = (target.textContent || '').trim();
            const numStr =
              (dataAttr && /^\d+$/.test(dataAttr) && dataAttr) ||
              text.match(/^\[?(\d+)\]?$/)?.[1];

            if (numStr) {
              if (hideTimeout) {
                clearTimeout(hideTimeout);
                hideTimeout = null;
              }

              const citationNumber = parseInt(numStr, 10);
              const reference = getReference(citationNumber);

              if (reference) {
                const rect = target.getBoundingClientRect();
                showTooltip(view, {
                  top: rect.top,
                  left: rect.left + rect.width / 2
                }, reference.citation);
              }
            }
          }
          
          return false;
        },
        mouseout(view, event) {
          const target = event.target as HTMLElement;
          
          if (target.tagName === 'SUP') {
            // Delay hiding to prevent flicker
            hideTimeout = setTimeout(() => {
              hideTooltip();
            }, 100);
          }
          
          return false;
        },
      },
    },
    view() {
      return {
        destroy() {
          if (tooltip && tooltip.parentNode) {
            tooltip.parentNode.removeChild(tooltip);
            tooltip = null;
          }
          if (hideTimeout) {
            clearTimeout(hideTimeout);
          }
        },
      };
    },
  });
}
