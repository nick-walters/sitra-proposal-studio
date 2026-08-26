import { describe, it, expect } from 'vitest';
import { generateHTML, generateJSON } from '@tiptap/core';
import DOMPurify from 'dompurify';
import { CROSS_REF_RICH_TEXT_CONFIG } from '@/lib/sanitizePresets';
import { CASE_DRAFT_FIELD_EXTENSIONS } from '@/components/cases/caseDraftFieldExtensions';

const H = `<p class="document-table-caption" style="text-align: left;"><span data-caption-label="" contenteditable="false" style="user-select: none; font-weight: bold; font-style: italic;">Table 1.1.a. </span><em>Desc</em></p><table class="he-table"><tbody><tr><td class="he-table-cell"><p>x</p></td></tr></tbody></table>`;

describe('static caption round trip', () => {
  it('keeps class and label', () => {
    const out = DOMPurify.sanitize(
      generateHTML(generateJSON(H, CASE_DRAFT_FIELD_EXTENSIONS), CASE_DRAFT_FIELD_EXTENSIONS),
      CROSS_REF_RICH_TEXT_CONFIG,
    );
    console.log(out);
    expect(out).toContain('document-table-caption');
    expect(out).toContain('data-caption-label');
  });
});
