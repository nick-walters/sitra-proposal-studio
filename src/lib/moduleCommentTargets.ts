/**
 * Target keys for module-anchored comments.
 *
 * Prompt 84 settled the anchoring model: a comment is pinned to a MODULE, not
 * to a text range. The key is the same generic `<type>:<id>[:<box>]` address
 * that locking and version history already use, so a comment survives editing,
 * reordering, binning, restoring and reverting with no re-anchoring guesswork.
 *
 * Storage: `section_comments` with `anchor_type = 'module'` and
 * `anchor_payload = { targetKey, label }`. No second table.
 */

export const MODULE_ANCHOR_TYPE = 'module';

export interface ModuleAnchorPayload {
  /** Generic target address, e.g. `card_field:<uuid>` or `wp:<uuid>:objectives`. */
  targetKey: string;
  /** Human label captured at authoring time, shown if the module is not on screen. */
  label: string;
}

/* ---- Part B blocks -------------------------------------------------- */

/** A Part B module: one `card_fields` row. */
export const cardFieldTarget = (fieldId: string) => `card_field:${fieldId}`;
/** A block title — commentable even though it is not a module body. */
export const cardTitleTarget = (cardId: string) => `card:${cardId}:title`;

/* ---- WP drafts ------------------------------------------------------ */

export const wpFieldTarget = (wpId: string, box: string) => `wp:${wpId}:${box}`;
export const wpTaskTarget = (taskId: string, box = 'description') => `wp_task:${taskId}:${box}`;
export const wpDeliverableTarget = (deliverableId: string, box = 'title') =>
  `wp_deliverable:${deliverableId}:${box}`;

/* ---- Case drafts ---------------------------------------------------- */

export const caseTarget = (caseId: string, key: string) => `case:${caseId}:${key}`;

/* ---- Section ids ---------------------------------------------------- */

/**
 * `section_comments.section_id` is free text. Part B boards use the template
 * section id they already have; WP and case drafts are not sections, so they
 * get a stable synthetic page id.
 */
export const wpDraftSectionId = (wpId: string) => `wp-draft:${wpId}`;
export const caseDraftSectionId = (caseId: string) => `case-draft:${caseId}`;

/** The bare uuid inside a target key, used to tie a comment to a binned row. */
export function targetOwnerId(targetKey: string): string {
  const parts = targetKey.split(':');
  return parts[1] ?? '';
}
