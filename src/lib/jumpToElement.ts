/**
 * Scrolls a (possibly not-yet-rendered) element into view inside its real
 * scrollable ancestor, offsetting the sticky editor chrome so the target is
 * never hidden behind the toolbars, then flashes a transient highlight.
 *
 * Three things made earlier attempts unreliable and are handled explicitly:
 *  1. Radix dialogs lock body scrolling while open — scrolling before the
 *     dialog has unmounted is silently swallowed. We wait for the lock to go.
 *  2. Rich-text editors mount after the block appears, so the block's offset
 *     keeps moving; a single scroll pass lands short. We re-scroll until the
 *     computed delta settles.
 *  3. The real scroll container is a nested div (or a Radix scroll-area
 *     viewport), not the window.
 */

const HIGHLIGHT_CLASSES = ['ring-2', 'ring-primary', 'ring-offset-2', 'rounded-lg'];

const debug = (...args: unknown[]) => {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[jumpToElement]', ...args);
  }
};

/** Resolves once an element with the id exists in the DOM (or times out). */
function waitForElement(domId: string, timeoutMs = 6000): Promise<HTMLElement | null> {
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

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/** True while a Radix overlay is holding the body scroll lock. */
function scrollLocked(): boolean {
  const body = document.body;
  return (
    body.hasAttribute('data-scroll-locked') ||
    body.style.overflow === 'hidden' ||
    !!document.querySelector('[data-state="open"][role="dialog"]')
  );
}

/** Waits for any dialog scroll lock to be released before scrolling. */
async function waitForScrollUnlock(timeoutMs = 2000) {
  const start = Date.now();
  while (scrollLocked() && Date.now() - start < timeoutMs) {
    await wait(50);
  }
  debug('scroll lock released after', Date.now() - start, 'ms');
}

function getScrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const style = window.getComputedStyle(node);
    const overflowY = style.overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1) {
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

/** One scroll pass; returns the delta it applied. */
function scrollPass(el: HTMLElement, label: string): number {
  const container = getScrollParent(el);
  const offset = stickyOffset(container);

  if (container) {
    const delta = el.getBoundingClientRect().top - container.getBoundingClientRect().top - offset;
    debug(label, 'container', container.className || container.tagName, 'delta', Math.round(delta));
    if (Math.abs(delta) > 4) {
      container.scrollTo({ top: container.scrollTop + delta, behavior: 'smooth' });
    }
    return delta;
  }

  const delta = el.getBoundingClientRect().top - offset;
  debug(label, 'container window, delta', Math.round(delta));
  if (Math.abs(delta) > 4) {
    window.scrollTo({ top: window.scrollY + delta, behavior: 'smooth' });
  }
  return delta;
}

export async function jumpToElementId(domId: string): Promise<void> {
  debug('enter', domId);
  await waitForScrollUnlock();

  const el = await waitForElement(domId);
  if (!el) {
    debug('exit — element never appeared', domId);
    return;
  }

  // Let React finish painting (and layout settle) before measuring.
  await raf();
  await raf();

  // Editors and images mount late and shift the target: repeat until settled.
  scrollPass(el, 'pass 1');
  for (const delayMs of [250, 450, 700]) {
    await wait(delayMs);
    const delta = scrollPass(el, `pass @${delayMs}ms`);
    if (Math.abs(delta) <= 4) break;
  }

  flash(el);
  debug('exit', domId);
}
