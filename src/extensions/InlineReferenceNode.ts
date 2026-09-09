import { Node, mergeAttributes } from '@tiptap/core';
import {
  formatTaskLabel,
  formatDeliverableLabel,
  formatMilestoneLabel,
} from '@/lib/referenceLabels';
import {
  getRefDisplayEntry,
  hasPublishedRefDisplay,
  subscribeRefDisplay,
  type RefDisplayType,
} from '@/lib/refDisplay';



export interface InlineReferenceOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    inlineReference: {
      /**
       * Insert a Task reference inline atom node.
       * Signature preserved from the legacy InlineReferenceMark.
       */
      insertTaskReference: (attributes: {
        wpNumber: number;
        taskNumber: number;
        taskId?: string;
        wpColor?: string;
      }) => ReturnType;
      insertDeliverableReference: (attributes: {
        deliverableNumber: string;
        deliverableId?: string;
        wpColor?: string;
      }) => ReturnType;
      insertMilestoneReference: (attributes: {
        milestoneNumber: number;
        milestoneId?: string;
      }) => ReturnType;
    };
  }
}

/**
 * Compute the displayed label for the given refType + attrs, mirroring
 * the legacy InlineReferenceMark exactly:
 *   task        -> `T${wpNumber}.${taskNumber}`
 *   deliverable -> `${deliverableNumber}`  (already pre-formatted, e.g. "D1.2")
 *   milestone   -> `MS${milestoneNumber}`
 */
function computeLabel(attrs: Record<string, any>): string {
  switch (attrs.refType) {

    case 'task':
      return formatTaskLabel({ wp_number: attrs.wpNumber, number: attrs.taskNumber });
    case 'deliverable':
      return formatDeliverableLabel({ number: attrs.deliverableNumber });
    case 'milestone':
      return formatMilestoneLabel({ number: attrs.milestoneNumber });
    case 'deleted': {
      const kindMap: Record<string, string> = {
        task: 'task',
        deliverable: 'deliverable',
        milestone: 'milestone',
        wp: 'WP',
        case: 'case',
        participant: 'participant',
        figure: 'figure/table',
      };
      const kind = kindMap[attrs.deletedKind] || 'item';
      return `[cross-reference to a deleted ${kind}]`;
    }
    default:
      return '';
  }
}

/**
 * The broken-reference marker.
 *
 * A tag whose target row no longer exists keeps rendering its stored label —
 * "D3.4" for a deliverable that was deleted months ago — which is
 * indistinguishable from a healthy badge and prints plausibly into the
 * submitted PDF. On screen it is instead replaced by loud inline text so the
 * author cannot miss it.
 *
 * DERIVED ONLY: this lives in the node view. `renderHTML` is untouched, so the
 * saved document still holds the original tag and the marker disappears by
 * itself if the item is ever restored.
 */
export const BROKEN_REF_STYLE =
  'background-color: #fff59d; color: #c00000; font-weight: 700; font-style: normal; ' +
  'font-family: inherit; font-size: inherit; line-height: inherit; padding: 0 2px; ' +
  'border-radius: 2px; border: 0; display: inline;';

/** "cross-reference broken: formerly D3.4", or the type name when unlabelled. */
export function brokenRefText(storedLabel: string | null | undefined, typeName: string): string {
  const shown = (storedLabel || '').trim();
  return `cross-reference broken: formerly ${shown || `a deleted ${typeName}`}`;
}



/**
 * InlineReferenceNode (Stage 3 migration)
 *
 * Single inline atomic node replacing the legacy InlineReferenceMark.
 * One node, three variants discriminated by the `refType` attribute:
 *   - 'task'         (wpNumber, taskNumber, taskId, wpColor)
 *   - 'deliverable'  (deliverableNumber, deliverableId, wpColor)
 *   - 'milestone'    (milestoneNumber, milestoneId)
 *
 * Backward compatibility: parseHTML matches the SAME
 * `span[data-inline-reference]` shape the legacy mark produced, reading
 * data-ref-type and ALL variant data-attributes so existing saved
 * task/deliverable/milestone badges load straight into this node with the
 * right refType. (The pre-parse migration in RichTextEditor.tsx that turns
 * legacy `<strong>MS</strong>` siblings into in-span MS-prefixed text still
 * runs, so legacy milestone documents are already normalised before parse.)
 *
 * toDOM uses the proven inner-wrapper fix: OUTER span carries only pill
 * geometry + data attrs + classes (`inline-ref inline-ref-<refType>`) +
 * contenteditable=false, with text-affecting CSS *neutralised to inherit*
 * so any stray text the browser might park inside the outer span is not
 * styled by the badge. ALL text-affecting styles (color, font-family,
 * font-size, font-weight, line-height) live on an INNER wrapper span
 * around the label.
 */
export const InlineReferenceNode = Node.create<InlineReferenceOptions>({
  name: 'inlineReference',

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
      refType: {
        default: 'task',
        // Legacy contentEditable badges have no `data-ref-type`; infer the
        // variant from the identity attribute the badge does carry.
        parseHTML: (el) => {
          const explicit = el.getAttribute('data-ref-type');
          if (explicit) return explicit;
          if (el.hasAttribute('data-deliverable-id') || el.hasAttribute('data-deliverable-reference')) {
            return 'deliverable';
          }
          if (el.hasAttribute('data-milestone-id') || el.hasAttribute('data-milestone-reference')) {
            return 'milestone';
          }
          return 'task';
        },
        renderHTML: (attrs) => ({ 'data-ref-type': attrs.refType }),
      },
      wpNumber: {
        default: null,
        parseHTML: (el) => {
          const raw =
            el.getAttribute('data-wp-number') ??
            ((el.textContent || '').trim().match(/T\s*(\d+)\.\d+/i)?.[1] ?? null);
          if (raw === null || raw === '') return null;
          const n = Number(raw);
          return Number.isFinite(n) ? n : raw;
        },
        renderHTML: (attrs) =>
          attrs.wpNumber !== null && attrs.wpNumber !== undefined
            ? { 'data-wp-number': attrs.wpNumber }
            : {},
      },
      taskNumber: {
        default: null,
        parseHTML: (el) => {
          const raw =
            el.getAttribute('data-task-number') ??
            ((el.textContent || '').trim().match(/T\s*\d+\.(\d+)/i)?.[1] ?? null);
          if (raw === null || raw === '') return null;
          const n = Number(raw);
          return Number.isFinite(n) ? n : raw;
        },
        renderHTML: (attrs) =>
          attrs.taskNumber !== null && attrs.taskNumber !== undefined
            ? { 'data-task-number': attrs.taskNumber }
            : {},
      },
      taskId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-task-id'),
        renderHTML: (attrs) =>
          attrs.taskId ? { 'data-task-id': attrs.taskId } : {},
      },
      deliverableNumber: {
        default: null,
        // Generation 1 badges bake the label into a nested span; generation 2
        // keeps it in `data-deliverable-label`.
        parseHTML: (el) =>
          el.getAttribute('data-deliverable-number') ||
          el.getAttribute('data-deliverable-label') ||
          ((el.hasAttribute('data-deliverable-id') || el.hasAttribute('data-deliverable-reference'))
            ? (el.textContent || '').trim() || null
            : null),
        renderHTML: (attrs) =>
          attrs.deliverableNumber
            ? { 'data-deliverable-number': attrs.deliverableNumber }
            : {},
      },
      deliverableId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-deliverable-id'),
        renderHTML: (attrs) =>
          attrs.deliverableId ? { 'data-deliverable-id': attrs.deliverableId } : {},
      },
      milestoneNumber: {
        default: null,
        parseHTML: (el) => {
          const raw =
            el.getAttribute('data-milestone-number') ??
            ((el.textContent || '').trim().match(/MS\s*(\d+)/i)?.[1] ?? null);
          if (raw === null || raw === '') return null;
          const n = Number(raw);
          return Number.isFinite(n) ? n : raw;
        },
        renderHTML: (attrs) =>
          attrs.milestoneNumber !== null && attrs.milestoneNumber !== undefined
            ? { 'data-milestone-number': attrs.milestoneNumber }
            : {},
      },
      milestoneId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-milestone-id'),
        renderHTML: (attrs) =>
          attrs.milestoneId ? { 'data-milestone-id': attrs.milestoneId } : {},
      },
      wpColor: {
        default: null,
        // Legacy contentEditable chips carry no colour data-attribute at all:
        // generation 1 painted an SVG pentagon (`[stroke]`), generation 2 put
        // the colour in the outer span's inline `color` / in the nested
        // clip-path layer's `background-color`. Read all of them so the badge
        // keeps its work-package colour even before live data resolves.
        parseHTML: (el) => {
          const direct =
            el.getAttribute('data-wp-color') ||
            el.getAttribute('data-deliverable-color') ||
            el.querySelector('[stroke]')?.getAttribute('stroke');
          if (direct) return direct;
          const inline = (el as HTMLElement).style?.color;
          if (inline && inline !== 'inherit') return inline;
          const layer = el.querySelector<HTMLElement>('span[style*="background-color"]');
          const bg = layer?.style?.backgroundColor;
          if (bg && bg !== 'transparent' && !/^(#fff(fff)?|rgb\(255,\s*255,\s*255\))$/i.test(bg)) {
            return bg;
          }
          return null;
        },
        renderHTML: (attrs) =>
          attrs.wpColor ? { 'data-wp-color': attrs.wpColor } : {},
      },

      deletedKind: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-deleted-kind'),
        renderHTML: (attrs) =>
          attrs.deletedKind ? { 'data-deleted-kind': attrs.deletedKind } : {},
      },
    };
  },

  parseHTML() {
    // Legacy contentEditable badges (WP drafts, case drafts, A2 fields) carry
    // only their identity attribute and bake the label into text / nested
    // presentation layers. Because this node is `atom: true`, ProseMirror
    // discards those children and re-renders from attributes, so the SVG,
    // the nested spans and the stale baked label all disappear on parse.
    return [
      {
        tag: 'span[data-inline-reference]',
        priority: 60,
      },
      // --- Task -------------------------------------------------------
      {
        tag: 'span[data-task-reference], span[data-task-id]',
        priority: 60,
        getAttrs: (el) => {
          const node = el as HTMLElement;
          if (node.hasAttribute('data-inline-reference')) return false;
          const text = (node.textContent || '').trim();
          const m = text.match(/T\s*(\d+)\.(\d+)/i);
          const attrs: Record<string, any> = { refType: 'task' };
          if (m) {
            if (!node.getAttribute('data-wp-number')) attrs.wpNumber = Number(m[1]);
            if (!node.getAttribute('data-task-number')) attrs.taskNumber = Number(m[2]);
          }
          return attrs;
        },
      },
      // --- Deliverable (generation 1: SVG pentagon; generation 2: nested
      //     border/fill/label spans) -------------------------------------
      {
        tag: 'span[data-deliverable-reference], span[data-deliverable-id]',
        priority: 60,
        getAttrs: (el) => {
          const node = el as HTMLElement;
          if (node.hasAttribute('data-inline-reference')) return false;
          const attrs: Record<string, any> = { refType: 'deliverable' };
          const label =
            node.getAttribute('data-deliverable-label') ||
            node.getAttribute('data-deliverable-number') ||
            (node.textContent || '').trim();
          if (label) attrs.deliverableNumber = label;
          const colour =
            node.getAttribute('data-wp-color') ||
            node.getAttribute('data-deliverable-color') ||
            node.querySelector('[stroke]')?.getAttribute('stroke') ||
            null;
          if (colour) attrs.wpColor = colour;
          return attrs;
        },
      },
      // --- Milestone ---------------------------------------------------
      {
        tag: 'span[data-milestone-reference], span[data-milestone-id]',
        priority: 60,
        getAttrs: (el) => {
          const node = el as HTMLElement;
          if (node.hasAttribute('data-inline-reference')) return false;
          const attrs: Record<string, any> = { refType: 'milestone' };
          if (!node.getAttribute('data-milestone-number')) {
            const m = (node.textContent || '').trim().match(/MS\s*(\d+)/i);
            if (m) attrs.milestoneNumber = Number(m[1]);
          }
          return attrs;
        },
      },
    ];
  },


  renderHTML({ node, HTMLAttributes }) {
    const refType = (node.attrs.refType as string) || 'task';
    const wpColor = node.attrs.wpColor as string | null;
    const label = computeLabel(node.attrs);

    // Deleted-reference placeholder: plain yellow-highlighted text, no pill
    // geometry. Inherits paragraph typography so it sits naturally in the
    // body text and is easy to select and delete manually.
    if (refType === 'deleted') {
      return [
        'span',
        mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
          'data-inline-reference': '',
          'class': 'inline-ref inline-ref-deleted',
          'contenteditable': 'false',
          'style':
            'background-color: #fff59d; color: #000; padding: 0 2px; border-radius: 2px; font-style: italic;',
        }),
        label,
      ];
    }

    // Pill-geometry styles live on the outer span (carried mainly by the
    // .inline-ref / .inline-ref-<refType> class CSS in index.css). We
    // additionally neutralise text-affecting properties so any stray text
    // the browser might park inside the outer span inherits the paragraph's
    // styles instead of the badge's.
    const outerStyleParts: string[] = [
      // Neutralise text styles set by the .inline-ref class so adjacent /
      // stray text inside the outer span cannot inherit them.
      'color: inherit',
      'font-family: inherit',
      'font-size: inherit',
      'font-weight: inherit',
      'line-height: inherit',
    ];
    if (wpColor && (refType === 'task' || refType === 'deliverable')) {
      outerStyleParts.push(`border-color: ${wpColor}`);
      outerStyleParts.push(`--wp-color: ${wpColor}`);
    }
    const outerStyle = outerStyleParts.join('; ');

    // Inner wrapper carries the actual visible text styling. Color is
    // sourced from the wp-color CSS var (set on the outer span) for task
    // and deliverable variants — matching the legacy class CSS — and is
    // fixed white for milestone (drawn on its black chevron pill).
    let innerStyle: string;
    if (refType === 'milestone') {
      innerStyle =
        "color: #ffffff; font-family: 'Times New Roman', Times, serif; font-size: 11pt; font-weight: 700; line-height: 1";
    } else {
      // task or deliverable
      innerStyle =
        "color: var(--wp-color, #000); font-family: 'Times New Roman', Times, serif; font-size: 11pt; font-weight: 700; line-height: 1";
    }

    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-inline-reference': '',
        'class': `inline-ref inline-ref-${refType}`,
        'contenteditable': 'false',
        'style': outerStyle,
      }),
      ['span', { style: innerStyle }, label],
    ];
  },

  /**
   * On screen the badge is drawn from LIVE data when it is available, so a
   * task, deliverable or milestone that has since been renumbered, reordered
   * or moved to another work package shows its current label — matching the
   * read-only mirrors and the PDF. Nothing is written back: `renderHTML`
   * above still serialises the stored attributes, so saved content is
   * untouched. When no live entry exists (map not yet loaded, or a binned
   * row) the stored attributes are used exactly as before, so a badge is
   * never blank.
   */
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span');
      const inner = document.createElement('span');
      dom.appendChild(inner);

      let lastKey: string | null = null;

      const liveTypeOf = (refType: string): RefDisplayType | null =>
        refType === 'task' || refType === 'deliverable' || refType === 'milestone'
          ? refType
          : null;

      const render = () => {
        const a = node.attrs as Record<string, any>;
        const refType = (a.refType as string) || 'task';
        const idAttr =
          refType === 'task'
            ? a.taskId
            : refType === 'deliverable'
              ? a.deliverableId
              : refType === 'milestone'
                ? a.milestoneId
                : null;
        const liveType = liveTypeOf(refType);
        const live = liveType ? getRefDisplayEntry(liveType, idAttr) : undefined;

        const label = live ? live.label : computeLabel(a);
        const wpColor: string | null =
          (live && live.color) || (a.wpColor as string | null) || null;

        // Broken only when the data HAS arrived, the tag names a target, and
        // that target is not in the live map. A tag with no id can never be
        // resolved and is left alone.
        const broken =
          !!liveType && !!idAttr && !live && hasPublishedRefDisplay(liveType);

        const key = `${refType}|${label}|${wpColor ?? ''}|${broken ? 'broken' : ''}`;
        if (key === lastKey) return;
        lastKey = key;

        dom.setAttribute('data-inline-reference', '');
        dom.setAttribute('contenteditable', 'false');
        dom.setAttribute('data-ref-type', refType);

        if (a.wpNumber !== null && a.wpNumber !== undefined) {
          dom.setAttribute('data-wp-number', String(a.wpNumber));
        }
        if (a.taskNumber !== null && a.taskNumber !== undefined) {
          dom.setAttribute('data-task-number', String(a.taskNumber));
        }
        if (a.taskId) dom.setAttribute('data-task-id', a.taskId);
        if (a.deliverableNumber) {
          dom.setAttribute('data-deliverable-number', String(a.deliverableNumber));
        }
        if (a.deliverableId) dom.setAttribute('data-deliverable-id', a.deliverableId);
        if (a.milestoneNumber !== null && a.milestoneNumber !== undefined) {
          dom.setAttribute('data-milestone-number', String(a.milestoneNumber));
        }
        if (a.milestoneId) dom.setAttribute('data-milestone-id', a.milestoneId);
        if (a.wpColor) dom.setAttribute('data-wp-color', a.wpColor);
        if (a.deletedKind) dom.setAttribute('data-deleted-kind', a.deletedKind);

        if (refType === 'deleted') {
          dom.setAttribute('class', 'inline-ref inline-ref-deleted');
          dom.setAttribute(
            'style',
            'background-color: #fff59d; color: #000; padding: 0 2px; border-radius: 2px; font-style: italic;',
          );
          inner.removeAttribute('style');
          inner.textContent = label;
          return;
        }

        const outerStyleParts: string[] = [
          'color: inherit',
          'font-family: inherit',
          'font-size: inherit',
          'font-weight: inherit',
          'line-height: inherit',
        ];
        if (wpColor && (refType === 'task' || refType === 'deliverable')) {
          outerStyleParts.push(`border-color: ${wpColor}`);
          outerStyleParts.push(`--wp-color: ${wpColor}`);
        }

        dom.setAttribute('class', `inline-ref inline-ref-${refType}`);
        dom.setAttribute('style', outerStyleParts.join('; '));
        inner.setAttribute(
          'style',
          refType === 'milestone'
            ? "color: #ffffff; font-family: 'Times New Roman', Times, serif; font-size: 11pt; font-weight: 700; line-height: 1"
            : "color: var(--wp-color, #000); font-family: 'Times New Roman', Times, serif; font-size: 11pt; font-weight: 700; line-height: 1",
        );
        inner.textContent = label;
      };

      let subscribedType = liveTypeOf((node.attrs.refType as string) || 'task');
      let unsubscribe = subscribedType
        ? subscribeRefDisplay(subscribedType, render)
        : () => {};

      render();

      return {
        dom,
        update(updatedNode) {
          if (updatedNode.type.name !== 'inlineReference') return false;
          node = updatedNode;
          const nextType = liveTypeOf((node.attrs.refType as string) || 'task');
          if (nextType !== subscribedType) {
            unsubscribe();
            subscribedType = nextType;
            unsubscribe = nextType ? subscribeRefDisplay(nextType, render) : () => {};
          }
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
      insertTaskReference:
        (attrs) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            const node = this.type.create({
              refType: 'task',
              wpNumber: attrs.wpNumber,
              taskNumber: attrs.taskNumber,
              taskId: attrs.taskId || null,
              wpColor: attrs.wpColor || null,
            });
            tr.replaceSelectionWith(node);
          }
          return true;
        },
      insertDeliverableReference:
        (attrs) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            const node = this.type.create({
              refType: 'deliverable',
              deliverableNumber: attrs.deliverableNumber,
              deliverableId: attrs.deliverableId || null,
              wpColor: attrs.wpColor || null,
            });
            tr.replaceSelectionWith(node);
          }
          return true;
        },
      insertMilestoneReference:
        (attrs) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            const node = this.type.create({
              refType: 'milestone',
              milestoneNumber: attrs.milestoneNumber,
              milestoneId: attrs.milestoneId || null,
            });
            tr.replaceSelectionWith(node);
          }
          return true;
        },
    };
  },
});

export default InlineReferenceNode;
