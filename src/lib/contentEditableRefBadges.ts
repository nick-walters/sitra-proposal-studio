/**
 * Builders for cross-reference badge elements inserted into plain
 * contentEditable editors (i.e. NOT TipTap). Used by the A2 participant
 * description fields, whose content is mirrored into Part B3.2.
 *
 * All badges are pure <span> markup (no <svg>) so they survive the
 * DOMPurify allow-lists used by PrefixedInlineEditor and the B3.2 mirror.
 */

const SERIF = "'Times New Roman', Times, serif";

function baseBubble(el: HTMLSpanElement) {
  el.setAttribute('contenteditable', 'false');
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
  baseBubble(span);
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
  baseBubble(span);
  span.style.backgroundColor = '#ffffff';
  span.style.color = color;
  span.style.border = `1.5px solid ${color}`;
  return span;
}

/** Pentagon deliverable badge built from nested clip-path spans (no SVG). */
export function buildDeliverableBadge(del: {
  id: string;
  number: string;
  wp_color?: string;
}): HTMLSpanElement {
  const raw = del.wp_color || '#73C92D';
  const color = /^#[0-9a-fA-F]{3,8}$/.test(raw) ? raw : '#73C92D';
  const outer = document.createElement('span');
  outer.setAttribute('data-deliverable-reference', '');
  outer.setAttribute('data-deliverable-id', del.id);
  outer.setAttribute('contenteditable', 'false');
  Object.assign(outer.style, {
    display: 'inline-block',
    background: color,
    padding: '1.5px',
    paddingRight: '3px',
    clipPath: 'polygon(0% 0%, calc(100% - 7px) 0%, 100% 50%, calc(100% - 7px) 100%, 0% 100%)',
    verticalAlign: 'baseline',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  } as Partial<CSSStyleDeclaration>);

  const inner = document.createElement('span');
  inner.textContent = del.number;
  Object.assign(inner.style, {
    display: 'inline-block',
    background: '#ffffff',
    color,
    padding: '0 8px 0 4px',
    clipPath: 'polygon(0% 0%, calc(100% - 6px) 0%, 100% 50%, calc(100% - 6px) 100%, 0% 100%)',
    fontFamily: SERIF,
    fontSize: '11pt',
    fontWeight: '700',
    fontStyle: 'normal',
    lineHeight: '1.3',
    whiteSpace: 'nowrap',
  } as Partial<CSSStyleDeclaration>);
  outer.appendChild(inner);
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
  baseBubble(span);
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
  baseBubble(span);
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
  wrapper.setAttribute('contenteditable', 'false');
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
  wrapper.setAttribute('contenteditable', 'false');
  Object.assign(wrapper.style, {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#000000',
    color: '#ffffff',
    fontFamily: "'Times New Roman', Times, serif",
    fontSize: '11pt',
    fontWeight: '700',
    lineHeight: '18px',
    height: '18px',
    padding: '0 4px',
    clipPath: 'polygon(12% 0%, 88% 0%, 100% 50%, 88% 100%, 12% 100%, 0% 50%)',
    verticalAlign: 'baseline',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  } as Partial<CSSStyleDeclaration>);
  wrapper.textContent = `MS${Number(ms.number) || 0}`;
  return wrapper;
}
