import { describe, it, expect } from 'vitest';
import { generateHTML, generateJSON } from '@tiptap/core';
import { LAZY_RICH_FIELD_EXTENSIONS } from '@/components/participant/lazyRichFieldExtensions';

function render(html: string) {
  return generateHTML(generateJSON(html, LAZY_RICH_FIELD_EXTENSIONS), LAZY_RICH_FIELD_EXTENSIONS);
}

// Real stored A2 participant-description markup from SUSIE-Q.
const ACRONYM =
  '<span data-acronym-reference="" data-acronym-segments="[{&quot;text&quot;:&quot;SUSIE&quot;,&quot;color&quot;:&quot;#06b6d4&quot;},{&quot;text&quot;:&quot;-&quot;,&quot;color&quot;:&quot;#64748b&quot;},{&quot;text&quot;:&quot;Q&quot;,&quot;color&quot;:&quot;#2563eb&quot;}]" contenteditable="false"><span style="color: rgb(6, 182, 212);">SUSIE</span></span>';

const WP =
  '<span data-wp-reference="" data-wp-id="3d71a070" data-wp-number="6" data-wp-short-name="Coordination" data-wp-show-short-name="true" data-wp-color="#367ABA" contenteditable="false"><span>WP6: Coordination</span></span>';

const PARTICIPANT =
  '<span data-participant-reference="" data-participant-id="p1" data-participant-number="1" data-participant-short-name="Sitra" contenteditable="false"><span>Sitra</span></span>';

describe('LazyRichField static rendering', () => {
  it('keeps bold, italic and underline', () => {
    const out = render('<p><strong>a</strong><em>b</em><u>c</u></p>');
    expect(out).toContain('<strong>a</strong>');
    expect(out).toContain('<em>b</em>');
    expect(out).toContain('<u>c</u>');
  });

  it('renders an acronym badge from its stored segments', () => {
    const out = render(`<p>will coordinate ${ACRONYM} today</p>`);
    expect(out).toContain('data-acronym-reference');
    expect(out).toContain('SUSIE');
    expect(out).toContain('will coordinate');
  });

  it('renders a WP badge from node attributes, keeping the short-name form', () => {
    const out = render(`<p>lead ${WP}</p>`);
    expect(out).toContain('data-wp-reference');
    expect(out).toContain('data-wp-number="6"');
    expect(out).toContain('WP6: Coordination');
  });

  it('renders a participant badge from node attributes', () => {
    const out = render(`<p>${PARTICIPANT}</p>`);
    expect(out).toContain('data-participant-reference');
    expect(out).toContain('data-participant-short-name="Sitra"');
  });

  it('drops nothing from plain prose', () => {
    const out = render('<p>Hello&nbsp;world</p>');
    expect(out).toContain('Hello');
    expect(out).toContain('world');
  });

  it('does not enable lists or tables', () => {
    const out = render('<ul><li>one</li></ul>');
    expect(out).not.toContain('<ul>');
    expect(out).toContain('one');
  });
});
