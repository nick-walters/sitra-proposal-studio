import { describe, it, expect } from 'vitest';
import { generateHTML, generateJSON } from '@tiptap/core';
import { LAZY_RICH_FIELD_EXTENSIONS } from '@/components/participant/lazyRichFieldExtensions';
const render = (h: string) => generateHTML(generateJSON(h, LAZY_RICH_FIELD_EXTENSIONS), LAZY_RICH_FIELD_EXTENSIONS);
describe('live resolution', () => {
  it('ignores corrupted baked visible text for WP', () => {
    const out = render('<p><span data-wp-reference="" data-wp-id="w1" data-wp-number="6" data-wp-short-name="Coordination" data-wp-show-short-name="true" contenteditable="false"><span>WP99: WRONGNAME</span></span></p>');
    console.log('WP OUT:', out);
  });
  it('ignores corrupted baked visible text for participant', () => {
    const out = render('<p><span data-participant-reference="" data-participant-id="p1" data-participant-number="1" data-participant-short-name="Sitra" contenteditable="false"><span>BOGUS</span></span></p>');
    console.log('PART OUT:', out);
  });
  it('what if the attribute itself is corrupted', () => {
    const out = render('<p><span data-wp-reference="" data-wp-id="w1" data-wp-number="99" data-wp-short-name="WRONG" data-wp-show-short-name="true" contenteditable="false"><span>WP6: Coordination</span></span></p>');
    console.log('ATTR OUT:', out);
  });
});
