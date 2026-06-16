// Centralised DOMPurify allow-list presets.
// Use these instead of declaring tag/attr arrays inline at call sites,
// so all rich-text rendering stays in lock-step.

export const INLINE_EMPHASIS_CONFIG = {
  ALLOWED_TAGS: ['em', 'strong'],
} as const;

export const FOOTNOTE_CONFIG = {
  ALLOWED_TAGS: ['em', 'strong', 'a', 'br', 'sup', 'span'],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'style'],
} as const;

export const RICH_TEXT_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li', 'span', 'a',
    'h1', 'h2', 'h3', 'h4', 'sub', 'sup',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  ALLOWED_ATTR: ['class', 'style', 'href', 'target', 'rel', 'colspan', 'rowspan'],
} as const;

export const RICH_TEXT_WITH_DIV_CONFIG = {
  ALLOWED_TAGS: [...RICH_TEXT_CONFIG.ALLOWED_TAGS, 'div'],
  ALLOWED_ATTR: [...RICH_TEXT_CONFIG.ALLOWED_ATTR],
} as const;

export const RICH_TEXT_WITH_IMAGES_CONFIG = {
  ALLOWED_TAGS: [
    ...RICH_TEXT_CONFIG.ALLOWED_TAGS,
    'img', 'figure', 'figcaption', 'div',
  ],
  ALLOWED_ATTR: [
    ...RICH_TEXT_CONFIG.ALLOWED_ATTR,
    'src', 'alt', 'width', 'height',
  ],
} as const;

export const RICH_TEXT_WITH_DIFF_CONFIG = {
  ALLOWED_TAGS: [
    ...RICH_TEXT_CONFIG.ALLOWED_TAGS,
    'img', 'del', 'ins', 'mark',
  ],
  ALLOWED_ATTR: [
    ...RICH_TEXT_CONFIG.ALLOWED_ATTR,
    'src', 'alt', 'width', 'height', 'data-diff',
  ],
} as const;
