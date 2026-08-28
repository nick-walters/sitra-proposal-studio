/**
 * ONE delete confirmation, everywhere.
 *
 * Part B, WP drafts and case drafts each grew their own wording and their own
 * button treatment. There is deliberately only one of each now: the copy below
 * varies ONLY in the noun (module, task, deliverable, block, subsection,
 * figure), and the confirm button is red on every surface.
 *
 * Everything that can be deleted on a proposal goes to a recycle bin under the
 * same retention policy, so the body copy never claims a deletion is
 * irreversible.
 */

/** Delete dialogs are capped at the 18 cm document column, like everything else. */
export const DELETE_DIALOG_CONTENT_CLASS = 'w-[18cm] max-w-[18cm]';

/** The red confirm button, identical on every delete dialog. */
export const DELETE_DIALOG_ACTION_CLASS =
  'bg-destructive text-destructive-foreground hover:bg-destructive/90';

export type DeletableNoun =
  | 'module'
  | 'task'
  | 'deliverable'
  | 'block'
  | 'subsection'
  | 'figure'
  | 'field'
  | 'item';

/** `Delete this module?` — the same shape for every noun. */
export const deleteDialogTitle = (noun: DeletableNoun | string) =>
  `Delete this ${noun}?`;

/** The single body sentence, with the noun swapped in. */
export const deleteDialogDescription = (noun: DeletableNoun | string) =>
  `The ${noun} and its content move to the recycle bin, where they are kept ` +
  `until 90 days after the proposal is submitted and can be restored in full.`;
