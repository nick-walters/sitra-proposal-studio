/**
 * Scrolls a (possibly not-yet-rendered) element into view inside its real
 * scrollable ancestor, offsetting the sticky editor chrome so the target is
 * never hidden behind the toolbars, then flashes a transient highlight.
 */

const HIGHLIGHT_CLASSES = ['ring-2', 'ring-primary', 'ring-offset-2', 'rounded-lg'];

/** Resolves once an element with the id exists in the DOM (or times out). */
function waitForElement(domId: string, timeoutMs = 4000): Promise<HTMLElement | null> {
  const existing = document.getElementById(domId);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (el: HTMLElement | null) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      window.clearTimeout(timer);
      resolve(el);
    };

    const observer = new MutationObserver(() => {
      const el = document.getElementById(domId);
      if (el) finish(el);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const timer = window.setTimeout(() => finish(document.getElementById(domId)), timeoutMs);
  });
}

function getScrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const style = window.getComputedStyle(node);
    const overflowY = style.overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/** Height of any sticky chrome pinned to the top of the scroll container. */
function stickyOffset(container: HTMLElement | null): number {
  const root: ParentNode = container ?? document;
  const chrome = root.querySelector('[data-editor-chrome]') as HTMLElement | null;
  return chrome ? chrome.getBoundingClientRect().height + 12 : 12;
}

function flash(el: HTMLElement) {
  el.classList.add(...HIGHLIGHT_CLASSES);
  window.setTimeout(() => el.classList.remove(...HIGHLIGHT_CLASSES), 2000);
}

export async function jumpToElementId(domId: string): Promise<void> {
  const el = await waitForElement(domId);
  if (!el) return;

  // Let React finish painting (and layout settle) before measuring.
  await new Promise<void>((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => r())),
  );

  const container = getScrollParent(el);
  const offset = stickyOffset(container);

  if (container) {
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const delta = elRect.top - containerRect.top - offset;
    container.scrollTo({ top: container.scrollTop + delta, behavior: 'smooth' });
  } else {
    const top = window.scrollY + el.getBoundingClientRect().top - offset;
    window.scrollTo({ top, behavior: 'smooth' });
  }

  flash(el);
}
