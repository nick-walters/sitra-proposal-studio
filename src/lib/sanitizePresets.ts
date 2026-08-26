// Centralised DOMPurify allow-list presets.
// Use these instead of declaring tag/attr arrays inline at call sites,
// so all rich-text rendering stays in lock-step.

export const INLINE_EMPHASIS_CONFIG = {
  ALLOWED_TAGS: ['em', 'strong'],
};

export const FOOTNOTE_CONFIG = {
  ALLOWED_TAGS: ['em', 'strong', 'a', 'br', 'sup', 'span'],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'style'],
};

export const RICH_TEXT_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'span', 'a',
    'h1', 'h2', 'h3', 'h4', 'sub', 'sup',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  ALLOWED_ATTR: ['class', 'style', 'href', 'target', 'rel', 'colspan', 'rowspan'],
};

export const RICH_TEXT_WITH_DIV_CONFIG = {
  ALLOWED_TAGS: [...RICH_TEXT_CONFIG.ALLOWED_TAGS, 'div'],
  ALLOWED_ATTR: [...RICH_TEXT_CONFIG.ALLOWED_ATTR],
};

export const RICH_TEXT_WITH_IMAGES_CONFIG = {
  ALLOWED_TAGS: [
    ...RICH_TEXT_CONFIG.ALLOWED_TAGS,
    'img', 'figure', 'figcaption', 'div',
  ],
  ALLOWED_ATTR: [
    ...RICH_TEXT_CONFIG.ALLOWED_ATTR,
    'src', 'alt', 'width', 'height',
  ],
};

export const RICH_TEXT_WITH_DIFF_CONFIG = {
  ALLOWED_TAGS: [
    ...RICH_TEXT_CONFIG.ALLOWED_TAGS,
    'img', 'del', 'ins', 'mark',
  ],
  ALLOWED_ATTR: [
    ...RICH_TEXT_CONFIG.ALLOWED_ATTR,
    'src', 'alt', 'width', 'height', 'data-diff',
  ],
};

/**
 * Read-only rich text that may contain cross-reference badges (participant,
 * work package, case, task, deliverable, milestone, acronym, figure/table).
 *
 * Badges keep their identity in `data-*` attributes; their presentation is
 * rebuilt from those attributes by `hydrateRefBadges`. Without these attrs
 * surviving the sanitiser, the badge renders as an unstyled — effectively
 * blank — span. Only the exact reference attributes are added; the shared
 * RICH_TEXT_CONFIG is deliberately left untouched.
 */
export const CROSS_REF_RICH_TEXT_CONFIG = {
  ALLOWED_TAGS: [...RICH_TEXT_CONFIG.ALLOWED_TAGS],
  ALLOWED_ATTR: [
    ...RICH_TEXT_CONFIG.ALLOWED_ATTR,
    'data-participant-reference', 'data-participant-id', 'data-participant-number',
    'data-participant-short-name',
    'data-wp-reference', 'data-wp-id', 'data-wp-number', 'data-wp-short-name', 'data-wp-color',
    // Label form chosen at insertion ("WP1" vs "WP1: Needs"). Must survive the
    // sanitiser or the chip silently changes form on reload.
    'data-wp-show-short-name',
    'data-case-reference', 'data-case-id', 'data-case-number', 'data-case-short-name',
    'data-case-color', 'data-case-type',
    'data-task-reference', 'data-task-id', 'data-task-number',
    'data-deliverable-reference', 'data-deliverable-id', 'data-deliverable-number',
    'data-deliverable-label', 'data-deliverable-color',
    'data-milestone-reference', 'data-milestone-id', 'data-milestone-number',
    'data-inline-reference', 'data-ref-type', 'data-ref-kind',
    'data-acronym-reference', 'data-acronym-segments',
    'data-fig-table-ref', 'data-figure-id', 'data-table-key',
    // Badges are atomic: `contenteditable="false"` and the `data-badge` marker
    // must survive, or the caret can be placed inside a badge and typing is
    // absorbed into it.
    'contenteditable', 'data-badge',
    // Derived caption labels ("Table 1.1.a. ") are styled off this attribute;
    // without it a caption renders as unmarked body text.
    'data-caption-label',
  ],

};

