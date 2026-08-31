/**
 * Module-anchored comments — target identifiers.
 *
 * A comment anchors to a MODULE, never to a text range. The identifiers below
 * are the same generic target ids already used by locking and version history,
 * so a comment survives editing, reordering, binning, restoring and version
 * history without any re-anchoring guesswork.
 */

export const MODULE_ANCHOR_TYPE = 'module' as const;

export interface ModuleAnchorPayload {
  /** Stable identifier of the module the comment belongs to. */
  targetKey: string;
  /** Human-readable label captured when the comment was left. */
  label: string;
}

/* --- Part B (card_fields) ---------------------------------------------- */
export const cardFieldTarget = (fieldId: string) => `card_field:${fieldId}`;
/** A block title is commentable even though it is not a rich text field. */
export const cardTitleTarget = (cardId: string) => `card:${cardId}:title`;

/* --- Work package drafts ------------------------------------------------ */
export const wpFieldTarget = (wpId: string, box: string) => `wp:${wpId}:${box}`;
export const wpTaskTarget = (taskId: string, box = 'description') =>
  `wp_task:${taskId}:${box}`;
export const wpDeliverableTarget = (deliverableId: string, box = 'title') =>
  `wp_deliverable:${deliverableId}:${box}`;

/* --- B1.2 linked activities ------------------------------------------- */
/** One comment target per linked-activity row. */
export const linkedActivityTarget = (activityId: string) =>
  `linked_activity:${activityId}`;

/* --- Case (pilot) drafts ------------------------------------------------ */
export const caseTarget = (caseId: string, key: string) => `case:${caseId}:${key}`;

/* --- Section ids -------------------------------------------------------- */
/** Comments are grouped per surface; drafts have no template section row. */
export const wpDraftSectionId = (wpId: string) => `wp-draft:${wpId}`;
export const caseDraftSectionId = (caseId: string) => `case-draft:${caseId}`;
