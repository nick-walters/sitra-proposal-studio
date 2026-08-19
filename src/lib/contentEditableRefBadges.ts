/**
 * Builders for cross-reference badge elements inserted into plain
 * contentEditable editors (i.e. NOT TipTap). Used by the A2 participant
 * description fields, whose content is mirrored into Part B3.2.
 *
 * All badges are pure <span> markup (no <svg>) so they survive the
 * DOMPurify allow-lists used by PrefixedInlineEditor and the B3.2 mirror.
 */

import {
  applyDeliverablePentagon,
  applyMilestoneBadge,
  markBadgeElement,
  markBadgeTree,
  BADGE_SERIF,
} from '@/lib/refBadgeMarkup';

const SERIF = BADGE_SERIF;

/** Fired on the editor element right after a badge is inserted, so the
 *  owning contentEditable component can flush its pending save at once. */
export const REF_BADGE_INSERTED_EVENT = 'ref-badge-inserted';

let activeEditor: HTMLElement | null = null;
let activeRange: Range | null = null;

/**
 * Persist the last valid selection owned by a plain contentEditable editor.
 * Dialogs move DOM focus into a portal, so window.getSelection() cannot be
 * used later when the user chooses a reference.
 */
export function rememberContentEditableSelection(editor: HTMLElement): void {
  activeEditor = editor;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return;
  activeRange = range.cloneRange();
}

/** Insert into the last focused plain contentEditable and emit its input event. */
export function insertIntoRememberedContentEditable(node: HTMLElement): boolean {
  const editor = activeEditor;
  if (!editor || !document.body.contains(editor)) return false;

  editor.focus({ preventScroll: true });
  const selection = window.getSelection();
  if (!selection) return false;

  selection.removeAllRanges();
  if (activeRange && document.body.contains(activeRange.startContainer)) {
    selection.addRange(activeRange);
  } else {
    const fallback = document.createRange();
    fallback.selectNodeContents(editor);
    fallback.collapse(false);
    selection.addRange(fallback);
  }

  const range = selection.getRangeAt(0);
  range.deleteContents();
  range.insertNode(node);
  const spacer = document.createTextNode('\u00a0');
  node.after(spacer);

  const after = document.createRange();
  after.setStart(spacer, 1);
  after.collapse(true);
  selection.removeAllRanges();
  selection.addRange(after);
  activeRange = after.cloneRange();
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  // Badge insertions happen while focus is bouncing between a dialog and the
  // editor, so the debounced React input path can be cut short. Ask the owning
  // editor to persist its current HTML immediately.
  editor.dispatchEvent(new CustomEvent(REF_BADGE_INSERTED_EVENT, { bubbles: true }));
  return true;
}

function baseBubble(el: HTMLSpanElement, kind: string) {
  markBadgeElement(el, kind);
  Object.assign(el.style, {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0 5px',
    borderRadius: '9999px',
    fontFamily: SERIF,
    fontSize: '11pt',
    fontWeight: '700',
    fontStyle: 'normal',
    lineHeight: '1',
    whiteSpace: 'nowrap',
    verticalAlign: 'baseline',
    userSelect: 'none',
  } as Partial<CSSStyleDeclaration>);
}

export function buildWPBadge(wp: {
  id: string;
  number: number;
  short_name?: string | null;
  color: string;
}): HTMLSpanElement {
  const span = document.createElement('span');
  span.textContent = `WP${wp.number}${wp.short_name ? `: ${wp.short_name}` : ''}`;
  span.setAttribute('data-wp-reference', '');
  span.setAttribute('data-wp-id', wp.id);
  span.setAttribute('data-wp-number', String(wp.number));
  span.setAttribute('data-wp-short-name', wp.short_name || '');
  span.setAttribute('data-wp-color', wp.color);
  baseBubble(span, 'wp');
  span.style.backgroundColor = wp.color;
  span.style.color = '#ffffff';
  span.style.border = `1.5px solid ${wp.color}`;
  return span;
}

export function buildTaskBadge(task: {
  id: string;
  wp_number: number;
  number: number;
  wp_color?: string;
}): HTMLSpanElement {
  const color = task.wp_color || '#73C92D';
  const span = document.createElement('span');
  span.textContent = `T${task.wp_number}.${task.number}`;
  span.setAttribute('data-task-reference', '');
  span.setAttribute('data-task-id', task.id);
  baseBubble(span, 'task');
  span.style.backgroundColor = '#ffffff';
  span.style.color = color;
  span.style.border = `1.5px solid ${color}`;
  return span;
}

/** Pentagon deliverable badge, identical in geometry to Table 3.1.c. */
export function buildDeliverableBadge(del: {
  id: string;
  number: string;
  wp_color?: string;
}): HTMLSpanElement {
  const outer = document.createElement('span');
  outer.setAttribute('data-deliverable-reference', '');
  outer.setAttribute('data-deliverable-id', del.id);
  outer.setAttribute('data-deliverable-label', del.number);
  markBadgeElement(outer, 'deliverable');
  applyDeliverablePentagon(outer, del.number, del.wp_color || '#73C92D');
  return outer;
}

export function buildCaseBadge(c: {
  id: string;
  number: number;
  short_name?: string | null;
  case_type: string;
  color?: string;
  label: string;
}): HTMLSpanElement {
  const color = c.color || '#000000';
  const span = document.createElement('span');
  span.textContent = c.label;
  span.setAttribute('data-case-reference', '');
  span.setAttribute('data-case-id', c.id);
  span.setAttribute('data-case-number', String(c.number));
  span.setAttribute('data-case-type', c.case_type);
  if (c.short_name) span.setAttribute('data-case-short-name', c.short_name);
  baseBubble(span, 'case');
  span.style.backgroundColor = '#ffffff';
  span.style.color = color;
  span.style.border = `1.5px solid ${color}`;
  return span;
}

export function buildParticipantBadge(p: {
  id: string;
  participantNumber: number;
  shortName: string;
}): HTMLSpanElement {
  const span = document.createElement('span');
  span.textContent = p.shortName || 'Partner';
  span.setAttribute('data-participant-reference', '');
  span.setAttribute('data-participant-id', p.id);
  span.setAttribute('data-participant-number', String(p.participantNumber));
  span.setAttribute('data-participant-short-name', p.shortName || '');
  baseBubble(span, 'participant');
  span.style.backgroundColor = '#000000';
  span.style.color = '#ffffff';
  span.style.border = '1.5px solid #000000';
  return span;
}

export interface AcronymSegment {
  text: string;
  color: string;
}

export function buildAcronymBadge(segments: AcronymSegment[]): HTMLSpanElement {
  const wrapper = document.createElement('span');
  wrapper.setAttribute('data-acronym-reference', '');
  wrapper.setAttribute('data-acronym-segments', JSON.stringify(segments));
  markBadgeElement(wrapper, 'acronym');
  Object.assign(wrapper.style, {
    display: 'inline',
    fontFamily: "'Arial Black', Arial, sans-serif",
    fontWeight: '900',
    fontSize: 'inherit',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    userSelect: 'none',
    verticalAlign: 'baseline',
  } as Partial<CSSStyleDeclaration>);
  segments.forEach((seg) => {
    const s = document.createElement('span');
    s.style.color = seg.color;
    s.textContent = seg.text;
    wrapper.appendChild(s);
  });
  markBadgeTree(wrapper, 'acronym');
  return wrapper;
}

export function buildMilestoneBadge(ms: {
  id: string;
  number: number;
  name?: string | null;
}): HTMLSpanElement {
  const wrapper = document.createElement('span');
  wrapper.setAttribute('data-inline-reference', '');
  wrapper.setAttribute('data-ref-type', 'milestone');
  wrapper.setAttribute('data-milestone-id', ms.id);
  wrapper.setAttribute('data-milestone-number', String(ms.number));
  markBadgeElement(wrapper, 'milestone');
  applyMilestoneBadge(wrapper, `MS${Number(ms.number) || 0}`);
  return wrapper;
}
