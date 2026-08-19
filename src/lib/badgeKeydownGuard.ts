/**
 * Atomic-badge keyboard guard for plain contentEditable editors.
 *
 * Cross-reference badges are non-editable islands. Without this guard a
 * Backspace next to a badge removes only its last decorative layer, leaving
 * degraded markup behind and letting the caret settle *inside* the badge —
 * after which typing is absorbed into it.
 *
 * Behaviour: Backspace/Delete with the caret immediately adjacent to a badge
 * deletes the WHOLE badge in one keystroke.
 */

const BADGE_SELECTOR = [
  '[data-badge]',
  '[data-wp-reference]',
  '[data-wp-id]',
  '[data-task-reference]',
  '[data-task-id]',
  '[data-deliverable-reference]',
  '[data-deliverable-id]',
  '[data-milestone-reference]',
  '[data-milestone-id]',
  '[data-participant-reference]',
  '[data-participant-id]',
  '[data-case-reference]',
  '[data-case-id]',
  '[data-acronym-reference]',
  '[data-fig-table-ref]',
].join(', ');

/** Nearest badge ancestor (or the element itself), bounded by the editor. */
export function closestBadge(node: Node | null, editor: HTMLElement): HTMLElement | null {
  let el: Node | null = node;
  while (el && el !== editor) {
    if (el.nodeType === Node.ELEMENT_NODE && (el as HTMLElement).matches?.(BADGE_SELECTOR)) {
      return el as HTMLElement;
    }
    el = el.parentNode;
  }
  return null;
}

function isBadge(node: Node | null | undefined): node is HTMLElement {
  return (
    !!node &&
    node.nodeType === Node.ELEMENT_NODE &&
    !!(node as HTMLElement).matches?.(BADGE_SELECTOR)
  );
}

/** Element/text node immediately before the caret, skipping empty text. */
function nodeBefore(container: Node, offset: number): Node | null {
  if (container.nodeType === Node.TEXT_NODE) {
    if (offset > 0) return null; // caret is inside text, not adjacent
    return container.previousSibling;
  }
  return container.childNodes[offset - 1] ?? null;
}

function nodeAfter(container: Node, offset: number): Node | null {
  if (container.nodeType === Node.TEXT_NODE) {
    if (offset < (container.textContent?.length ?? 0)) return null;
    return container.nextSibling;
  }
  return container.childNodes[offset] ?? null;
}

/**
 * Handles Backspace/Delete adjacent to a badge. Returns true when it consumed
 * the keystroke (caller should have called preventDefault and then flush its
 * change handler).
 */
export function handleBadgeKeydown(event: KeyboardEvent | React.KeyboardEvent, editor: HTMLElement | null): boolean {
  if (!editor) return false;
  const key = (event as KeyboardEvent).key;
  if (key !== 'Backspace' && key !== 'Delete') return false;

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer)) return false;

  // Caret somehow landed inside a badge — remove the whole badge.
  const inside = closestBadge(range.startContainer, editor);
  if (inside) {
    event.preventDefault();
    removeBadge(inside, selection);
    return true;
  }

  if (!range.collapsed) return false;

  const target =
    key === 'Backspace'
      ? nodeBefore(range.startContainer, range.startOffset)
      : nodeAfter(range.startContainer, range.startOffset);

  if (isBadge(target)) {
    event.preventDefault();
    removeBadge(target, selection);
    return true;
  }
  return false;
}

function removeBadge(badge: HTMLElement, selection: Selection) {
  const parent = badge.parentNode;
  if (!parent) return;
  const after = document.createRange();
  after.setStartBefore(badge);
  after.collapse(true);
  parent.removeChild(badge);
  selection.removeAllRanges();
  selection.addRange(after);
}
