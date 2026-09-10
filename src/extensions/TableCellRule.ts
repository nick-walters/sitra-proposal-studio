import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';

/**
 * Per-cell horizontal rule attribute for authored Part B tables.
 *
 * `ruleBottom` is the rule drawn UNDER the cell: 'thick' (the table's header
 * rule) or 'thin' (the body rule). A "top" rule in the UI is written as a
 * bottom rule on the row above, so there is deliberately no top attribute.
 */
const ruleAttribute = {
  ruleBottom: {
    default: null as 'thick' | 'thin' | null,
    parseHTML: (element: HTMLElement) => {
      const value = element.getAttribute('data-rule-bottom');
      return value === 'thick' || value === 'thin' ? value : null;
    },
    renderHTML: (attributes: Record<string, unknown>) =>
      attributes.ruleBottom ? { 'data-rule-bottom': attributes.ruleBottom } : {},
  },
};

export const TableCellWithRule = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...ruleAttribute,
    };
  },
});

export const TableHeaderWithRule = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...ruleAttribute,
    };
  },
});
