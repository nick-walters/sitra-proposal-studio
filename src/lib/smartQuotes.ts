/**
 * Platform-wide smart (curly) quotes.
 *
 * TipTap editors get curly quotes from the Typography extension. Plain
 * <input>, <textarea> and contenteditable fields (e.g. the WP/inline editors
 * and the Methodologies fields) do not, which meant apostrophes and quotation
 * marks stayed straight in some places and curled in others.
 *
 * This installs a single document-level `beforeinput` listener that converts a
 * typed ' or " into the correct opening/closing curly form, based on the
 * character immediately before the caret.
 */

const OPEN_SINGLE = '\u2018';
const CLOSE_SINGLE = '\u2019';
const OPEN_DOUBLE = '\u201C';
const CLOSE_DOUBLE = '\u201D';

/** Characters after which a quote is treated as an opening quote. */
const OPENING_CONTEXT = /[\s(\[{<\u2014\u2013\-\u00a0]/;

export function curlyQuoteFor(char: "'" | '"', prevChar: string): string {
  const isOpening = prevChar === '' || OPENING_CONTEXT.test(prevChar);
  if (char === "'") return isOpening ? OPEN_SINGLE : CLOSE_SINGLE;
  return isOpening ? OPEN_DOUBLE : CLOSE_DOUBLE;
}

/** Convert every straight quote in a string using surrounding context. */
export function toSmartQuotes(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'" || ch === '"') {
      out += curlyQuoteFor(ch as "'" | '"', out.slice(-1));
    } else {
      out += ch;
    }
  }
  return out;
}

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'textarea', '']);

function shouldSkip(el: Element | null): boolean {
  if (!el) return true;
  // ProseMirror/TipTap handles this itself via the Typography extension.
  if (el.closest('.ProseMirror')) return true;
  if (el.closest('[data-no-smart-quotes]')) return true;
  if (el instanceof HTMLInputElement) {
    const type = (el.type || '').toLowerCase();
    if (!TEXT_INPUT_TYPES.has(type)) return true;
    if (el.inputMode === 'numeric' || el.inputMode === 'decimal') return true;
  }
  return false;
}

function handleBeforeInput(event: Event) {
  const e = event as InputEvent;
  if (e.inputType !== 'insertText') return;
  const data = e.data;
  if (data !== "'" && data !== '"') return;

  const target = e.target as HTMLElement | null;
  if (!target || shouldSkip(target)) return;

  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? start;
    const prevChar = start > 0 ? target.value.slice(start - 1, start) : '';
    const replacement = curlyQuoteFor(data, prevChar);
    e.preventDefault();
    target.setRangeText(replacement, start, end, 'end');
    target.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  if (target.isContentEditable) {
    const selection = window.getSelection();
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    let prevChar = '';
    if (range) {
      const node = range.startContainer;
      if (node.nodeType === Node.TEXT_NODE && range.startOffset > 0) {
        prevChar = (node.textContent || '').slice(range.startOffset - 1, range.startOffset);
      }
    }
    const replacement = curlyQuoteFor(data, prevChar);
    e.preventDefault();
    document.execCommand('insertText', false, replacement);
  }
}

let installed = false;

export function installSmartQuotes() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener("beforeinput", handleBeforeInput, true);
}
