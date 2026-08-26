import { describe, it, expect } from 'vitest';
import { sanitizeEditorHtml } from '@/lib/editorContentSanitizer';

const H = `<p class="document-table-caption" style="text-align: left;"><span data-caption-label="" contenteditable="false" style="user-select: none; font-weight: bold; font-style: italic;">Table 1.1.a. </span><em>Desc</em></p><table class="he-table"><tbody><tr><td class="he-table-cell"><p>x</p></td></tr></tbody></table>`;

describe('caption', () => {
  it('round trips', () => {
    const out = sanitizeEditorHtml(H);
    console.log(out);
    expect(out).toContain('document-table-caption');
  });
});
