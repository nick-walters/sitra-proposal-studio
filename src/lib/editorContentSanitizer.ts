import DOMPurify from 'dompurify';

const ALLOWED_CLASSES = new Set([
  'figure-caption',
  'table-caption',
  'he-table',
  'he-table-cell',
  'he-table-header',
  'wp-reference-badge',
  'case-reference-badge',
  'participant-reference-badge',
  'formula-result',
]);

const ALLOWED_DATA_ATTRS = new Set([
  'data-list-style',
  'data-inline-reference',
  'data-wp-reference',
  'data-case-reference',
  'data-participant-reference',
  'data-acronym-reference',
  'data-fig-table-ref',
  'data-ref-type',
  'data-ref-kind',
  'data-wp-number',
  'data-wp-short-name',
  'data-wp-color',
  'data-wp-id',
  'data-task-number',
  'data-task-id',
  'data-deliverable-number',
  'data-deliverable-id',
  'data-milestone-number',
  'data-milestone-id',
  'data-case-number',
  'data-case-short-name',
  'data-case-color',
  'data-case-id',
  'data-case-type',
  'data-participant-number',
  'data-participant-short-name',
  'data-participant-id',
  'data-figure-id',
  'data-table-key',
  'data-acronym-segments',
  'data-track-insertion',
  'data-track-deletion',
  'data-change-id',
  'data-author-id',
  'data-author-name',
  'data-author-color',
  'data-timestamp',
]);

const STYLE_ALLOWLIST = new Set([
  'text-align',
  'color',
  'font-weight',
  'font-style',
  'text-decoration',
  'vertical-align',
  'width',
  'min-width',
  'height',
  'margin-left',
  'margin-right',
  'display',
  'border-color',
  '--wp-color',
]);

function cleanStorageSrc(src: string) {
  const match = src.match(/\/proposal-files\/([^?]+)/);
  return match ? decodeURIComponent(match[1]) : src;
}

function cleanStyle(style: string) {
  return style
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      const [property, value = ''] = part.split(':');
      const name = property.trim().toLowerCase();
      const lowerValue = value.toLowerCase();
      return STYLE_ALLOWLIST.has(name) && !lowerValue.includes('javascript:') && !lowerValue.includes('expression(');
    })
    .join('; ');
}

export function sanitizeEditorHtml(html: string): string {
  if (!html || typeof document === 'undefined') return html || '';

  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li', 'span', 'a', 'h1', 'h2', 'h3', 'h4', 'sub', 'sup', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'blockquote'],
    ALLOWED_ATTR: ['class', 'style', 'href', 'target', 'rel', 'src', 'alt', 'width', 'height', 'colspan', 'rowspan', ...Array.from(ALLOWED_DATA_ATTRS)],
  });

  const template = document.createElement('template');
  template.innerHTML = sanitized;

  template.content.querySelectorAll<HTMLElement>('*').forEach((element) => {
    for (const attr of Array.from(element.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || ['contenteditable', 'draggable', 'spellcheck', 'tabindex', 'role'].includes(name)) {
        element.removeAttribute(attr.name);
      }
      if (name.startsWith('data-') && !ALLOWED_DATA_ATTRS.has(name)) {
        element.removeAttribute(attr.name);
      }
    }

    const classList = Array.from(element.classList).filter((className) => (
      ALLOWED_CLASSES.has(className) || className.startsWith('inline-ref')
    ));
    if (classList.length) element.setAttribute('class', classList.join(' '));
    else element.removeAttribute('class');

    const cleanedStyle = cleanStyle(element.getAttribute('style') || '');
    if (cleanedStyle) element.setAttribute('style', cleanedStyle);
    else element.removeAttribute('style');

    if (element.tagName === 'IMG') {
      const src = element.getAttribute('src') || '';
      if (src.includes('/proposal-files/')) element.setAttribute('src', cleanStorageSrc(src));
    }
  });

  return template.innerHTML;
}