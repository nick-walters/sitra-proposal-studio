/**
 * Collapse keys for WP draft blocks and task modules.
 *
 * WP drafts are projections, not `proposal_cards` rows, so their per-user
 * collapse state lives in `ui_collapse_states` keyed by a stable string
 * (`useKeyedCollapse`), exactly as Part A cards do. Every key is derived here
 * so the page-wide Collapse all control and the per-item chevrons can never
 * drift apart.
 */

export const wpHeaderCollapseKey = (wpDraftId?: string | null) => `wp:${wpDraftId ?? 'none'}:header`;
export const wpObjectivesCollapseKey = (wpDraftId?: string | null) =>
  `wp:${wpDraftId ?? 'none'}:objectives`;
export const wpDescriptionCollapseKey = (wpDraftId?: string | null) =>
  `wp:${wpDraftId ?? 'none'}:description-of-work`;
export const wpDeliverablesCollapseKey = (wpDraftId?: string | null) =>
  `wp:${wpDraftId ?? 'none'}:deliverables`;
export const wpTaskCollapseKey = (taskId: string) => `wp_task:${taskId}`;

/** A Part B module (a card field). Same store, so both surfaces behave alike. */
export const moduleCollapseKey = (fieldId: string) => `module:${fieldId}`;
