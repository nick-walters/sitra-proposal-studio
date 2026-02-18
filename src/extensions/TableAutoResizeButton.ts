import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { computeAutoFitSmart } from '@/lib/autoFitColumns';

const tableAutoResizeKey = new PluginKey('tableAutoResizeButton');

/**
 * Adds an "Auto-resize columns" button above each table in the editor.
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
                const widget = Decoration.widget(pos, (view) => {
                  const container = document.createElement('div');
                  container.className = 'table-auto-resize-bar';
                  container.setAttribute('contenteditable', 'false');

                  const btn = document.createElement('button');
                  btn.type = 'button';
                  btn.className = 'table-auto-resize-btn';
                  btn.textContent = 'Auto-resize columns';
                  btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // Find the table DOM node
                    const tableDom = view.nodeDOM(pos);
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
                return false; // don't recurse into table
              }
            });

            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },
});
