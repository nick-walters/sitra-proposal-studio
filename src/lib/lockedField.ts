/**
 * Shared treatment for a field the current user may not change because the
 * participant's information or budget is locked.
 *
 * A locked text field is READ-ONLY, not disabled: the cursor can be placed in
 * it, the text can be selected and copied, and it stays reachable by keyboard —
 * typing simply does nothing, and no save is attempted. Controls that carry no
 * selectable text (dropdowns, checkboxes, drag handles, delete buttons) are
 * disabled instead, since there is nothing to read out of them.
 */

/** Visibly "locked" without dimming the text out of legibility. */
export const LOCKED_FIELD_CLASS =
  'bg-muted/70 border-dashed text-foreground cursor-text';

/** Props to spread on an input or textarea that is locked. */
export function lockedFieldProps(locked: boolean) {
  return locked
    ? { readOnly: true, 'aria-readonly': true, title: 'Locked — read-only' }
    : {};
}

/** Appends the locked styling to a field's own classes. */
export function lockedFieldClass(locked: boolean, className = '') {
  return locked ? `${className} ${LOCKED_FIELD_CLASS}` : className;
}
