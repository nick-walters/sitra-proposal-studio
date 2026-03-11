import { OrderedList } from '@tiptap/extension-ordered-list';

/**
 * Extends the default OrderedList node to support a `listStyleType` attribute
 * that controls the marker style (decimal, lower-alpha, lower-roman).
 */
export const OrderedListStyled = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      listStyleType: {
        default: 'decimal',
        parseHTML: (element: HTMLElement) => {
          return element.style.listStyleType || element.getAttribute('data-list-style') || 'decimal';
        },
        renderHTML: (attributes: Record<string, any>) => {
          return {
            style: `list-style-type: ${attributes.listStyleType}`,
            'data-list-style': attributes.listStyleType,
          };
        },
      },
    };
  },
});
