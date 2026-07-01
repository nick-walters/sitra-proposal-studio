/**
 * stripWordHtml — shared paste/save-time cleaner for HTML pasted from
 * Microsoft Word (and other Office sources). DOM-based, not regex-only.
 *
 * Removes Word/MSO junk while:
 *   • keeping basic formatting (p, br, strong/b, em/i, u, s, ul, ol, li,
 *     a[href], h1–h4, sub, sup, tables)
 *   • preserving every custom TipTap node (cross-reference badges,
 *     casesTable, figure/table refs, acronyms, citations, track-changes)
 *     verbatim — short-circuits on any element carrying a class in
 *     ALLOWED_CLASSES or any attribute in ALLOWED_DATA_ATTRS.
 *
 * Finishes by deferring to the canonical sanitizeEditorHtml allow-list.
 *
 * Intended call sites: contentEditable onPaste, save-time field clean,
 * and the WP-draft import path that previously used stripWordXml.
 */
import {
  sanitizeEditorHtml,
  ALLOWED_CLASSES,
  ALLOWED_DATA_ATTRS,
} from '../../supabase/functions/_shared/sanitizeEditorHtml';

const OFFICE_NS_PREFIX = /^(o|w|m|v|x|st\d):/i;
const MSO_COMMENT = /\[if[^\]]*\bmso\b|\[endif\]|\bmso\b/i;
const MSO_CLASS = /^Mso/;
const FRAGMENT_HEADER_TAGS = new Set(['META', 'LINK', 'STYLE', 'TITLE']);

function isPreservedElement(el: Element): boolean {
  // Any class token in ALLOWED_CLASSES → custom node, leave it alone.
  const classList = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
  if (classList.some((c) => ALLOWED_CLASSES.has(c) || c.startsWith('inline-ref'))) {
    return true;
  }
  // Any data-* attribute in ALLOWED_DATA_ATTRS → custom node.
  for (let i = 0; i < el.attributes.length; i++) {
    const name = el.attributes[i].name.toLowerCase();
    if (name.startsWith('data-') && ALLOWED_DATA_ATTRS.has(name)) return true;
  }
  return false;
}

function unwrap(el: Element) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

function cleanStyle(value: string): string {
  return value
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .filter((d) => !/^mso-/i.test(d))
    .join('; ');
}

function looksLikeWordHtml(html: string): boolean {
  return /xmlns|MsoNormal|mso-|<o:|<w:|<m:|<v:|<x:|class="?Mso|\[if[^\]]*mso/i.test(html);
}

/**
 * Public entry point. Returns sanitised HTML (always passed through
 * sanitizeEditorHtml as a final canonicalisation step).
 */
export function stripWordHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';

  // Fast path: if there's no Word-junk signature, just run the canonical
  // sanitiser. This keeps behaviour identical for non-Word paste sources.
  if (!looksLikeWordHtml(html)) {
    return sanitizeEditorHtml(html);
  }

  if (typeof document === 'undefined') {
    // SSR / edge fallback — sanitiser already strips classes/styles that
    // aren't in the allow-list, so it removes the bulk of MSO junk.
    return sanitizeEditorHtml(html);
  }

  // 1. Strip <?xml…?> processing instructions before DOM parse (DOMParser
  //    would otherwise reject the doc if a PI sits at the top).
  let pre = html.replace(/<\?xml[\s\S]*?\?>/gi, '');

  // 2. Strip MS-Word conditional comments. Use a non-greedy scan that
  //    handles both `<!--[if … mso …]>…<![endif]-->` and nested blocks.
  pre = pre.replace(/<!--\[if[\s\S]*?endif\]-->/gi, '');

  // Parse the remainder. We wrap in <div> so DOMParser keeps inline
  // fragments intact.
  const doc = new DOMParser().parseFromString(`<div id="__sw">${pre}</div>`, 'text/html');
  const root = doc.getElementById('__sw');
  if (!root) return sanitizeEditorHtml(html);

  // 3. Walk every comment and drop any whose text references MSO.
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const comments: Comment[] = [];
  let c: Node | null;
  while ((c = walker.nextNode())) comments.push(c as Comment);
  for (const cm of comments) {
    if (MSO_COMMENT.test(cm.data)) cm.remove();
  }

  // 4. Walk every element. Snapshot first because we may unwrap/remove.
  const all = Array.from(root.getElementsByTagName('*')) as Element[];

  for (const el of all) {
    if (!el.parentNode) continue; // already detached

    // Preserved custom nodes are untouchable.
    if (isPreservedElement(el)) continue;

    const tag = el.tagName.toUpperCase();

    // Drop Office namespace tags entirely (children dropped too — they
    // are MSO-only markers like <o:p>, <w:WordDocument>, etc.).
    if (OFFICE_NS_PREFIX.test(el.tagName)) {
      el.remove();
      continue;
    }

    // Drop Office fragment header tags (Word pastes <meta>/<link>/<style>
    // ahead of the body fragment).
    if (FRAGMENT_HEADER_TAGS.has(tag)) {
      el.remove();
      continue;
    }

    // Unwrap <font> into its children.
    if (tag === 'FONT') {
      unwrap(el);
      continue;
    }

    // Strip xmlns / xmlns:* and lang / xml:lang attributes (Word residue
    // like lang="EN-GB" carries no formatting meaning).
    for (let i = el.attributes.length - 1; i >= 0; i--) {
      const attr = el.attributes[i];
      const name = attr.name.toLowerCase();
      if (/^xmlns(:|$)/i.test(attr.name)) el.removeAttribute(attr.name);
      else if (name === 'lang' || name === 'xml:lang') el.removeAttribute(attr.name);
    }

    // Unwrap Word OLE bookmark anchors: <a name="…"> with no href (typically
    // name="OLE_LINK…" or name="_…"). Keep child content; just drop the
    // anchor wrapper. Real <a href> links and platform reference spans
    // (caught earlier by isPreservedElement) are unaffected.
    if (tag === 'A' && el.hasAttribute('name') && !el.hasAttribute('href')) {
      unwrap(el);
      continue;
    }

    // Filter Mso* class tokens. Drop class if empty afterwards.
    const cls = el.getAttribute('class');
    if (cls) {
      const kept = cls.split(/\s+/).filter(Boolean).filter((t) => !MSO_CLASS.test(t));
      if (kept.length === 0) el.removeAttribute('class');
      else el.setAttribute('class', kept.join(' '));
    }

    // Strip mso-* declarations inside style="". Drop style if empty.
    const style = el.getAttribute('style');
    if (style) {
      const cleaned = cleanStyle(style);
      if (!cleaned) el.removeAttribute('style');
      else el.setAttribute('style', cleaned);
    }
  }

  // 5. Drop empty <span>s left behind (no attributes, no content).
  const spans = Array.from(root.getElementsByTagName('span'));
  for (const span of spans) {
    if (isPreservedElement(span)) continue;
    if (span.attributes.length === 0 && !span.textContent?.trim()) span.remove();
  }

  // 6. Hand the cleaned HTML to the canonical sanitiser. It enforces the
  //    project allow-list and is the source of truth for tag/attr policy.
  return sanitizeEditorHtml(root.innerHTML);
}
