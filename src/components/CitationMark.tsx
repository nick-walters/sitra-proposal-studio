import { Mark, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import DOMPurify from 'dompurify';

export interface CitationMarkOptions {
  getReference: (citationNumber: number) => { citation: string } | undefined;
}

export const CitationMark = Mark.create<CitationMarkOptions>({
  name: 'citationMark',

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
          const text = (element as HTMLElement).textContent || '';
          const match = text.match(/^\[(\d+)\]$/);
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

    tooltip.innerHTML = DOMPurify.sanitize(formattedContent, { ALLOWED_TAGS: ['em', 'strong'] });
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
            const text = target.textContent || '';
            const match = text.match(/^\[(\d+)\]$/);
            
            if (match) {
              if (hideTimeout) {
                clearTimeout(hideTimeout);
                hideTimeout = null;
              }

              const citationNumber = parseInt(match[1], 10);
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
