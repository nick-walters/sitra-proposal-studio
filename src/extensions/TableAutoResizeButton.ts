import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { computeAutoFitSmart } from '@/lib/autoFitColumns';

const tableAutoResizeKey = new PluginKey('tableAutoResizeButton');

const COLUMNS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>`;

/**
 * Adds an "Auto-resize columns" button above each table in the editor,
 * positioned above any caption paragraph that precedes the table.
 */
export const TableAutoResizeButton = Extension.create({
  name: 'tableAutoResizeButton',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: tableAutoResizeKey,
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            const doc = state.doc;

            doc.descendants((node, pos) => {
              if (node.type.name === 'table') {
                // Check if the node before this table is a caption paragraph
                let widgetPos = pos;
                const resolvedPos = doc.resolve(pos);
                const index = resolvedPos.index(resolvedPos.depth);
                if (index > 0) {
                  const parent = resolvedPos.parent;
                  const prevNode = parent.child(index - 1);
                  if (prevNode.type.name === 'paragraph') {
                    const text = prevNode.textContent || '';
                    if (/^(Table|Figure)\s+\d/i.test(text)) {
                      // Place widget before the caption paragraph
                      widgetPos = pos - prevNode.nodeSize;
                    }
                  }
                }

                const tablePos = pos; // keep original table pos for DOM lookup
                const widget = Decoration.widget(widgetPos, (view) => {
                  const container = document.createElement('div');
                  container.className = 'table-auto-resize-bar';
                  container.setAttribute('contenteditable', 'false');

                  const btn = document.createElement('button');
                  btn.type = 'button';
                  btn.className = 'table-auto-resize-btn';
                  btn.innerHTML = `${COLUMNS_ICON}<span>Auto-resize columns</span>`;
                  btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const tableDom = view.nodeDOM(tablePos);
                    if (tableDom instanceof HTMLTableElement) {
                      const widths = computeAutoFitSmart(tableDom);
                      if (widths) {
                        const colgroup = tableDom.querySelector('colgroup');
                        if (colgroup) {
                          const cols = colgroup.querySelectorAll('col');
                          cols.forEach((col, i) => {
                            if (i < widths.length) {
                              (col as HTMLElement).style.width = `${widths[i]}px`;
                              (col as HTMLElement).style.minWidth = `${widths[i]}px`;
                            }
                          });
                        }
                      }
                    }
                  });

                  container.appendChild(btn);
                  return container;
                }, { side: -1, ignoreSelection: true });

                decorations.push(widget);
                return false;
              }
            });

            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },
});
