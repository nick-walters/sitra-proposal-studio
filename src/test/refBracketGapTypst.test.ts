import { describe, expect, it } from 'vitest';
import { htmlToTypstInline } from '@/lib/typst/htmlToTypst';

const ctx = () => ({ unsupported: new Set<string>() });
const chip = (label = 'WP4') =>
  `<span data-wp-reference="1" data-wp-id="11111111-1111-4111-8111-111111111111" data-wp-number="4" data-wp-color="#ff0000">${label}</span>`;

describe('bracket hairline', () => {
  it('bracketed reference gets gaps on both sides', () => {
    const out = htmlToTypstInline(`<p>see (${chip()}) now</p>`, ctx());
    console.log('BRACKETED:', out);
    expect(out).toContain('h(0.6pt, weak: false) + chip-pill');
    expect(out).toContain('chip-pill("WP4", rgb("#ff0000"), filled: true) + h(0.6pt, weak: false)');
  });

  it('unbracketed reference gets no gap', () => {
    const out = htmlToTypstInline(`<p>see ${chip()} now</p>`, ctx());
    console.log('PLAIN:', out);
    expect(out).not.toContain('h(0.6pt');
  });

  it('square brackets also work', () => {
    const out = htmlToTypstInline(`<p>see [${chip()}] now</p>`, ctx());
    console.log('SQUARE:', out);
    expect((out.match(/h\(0\.6pt/g) || []).length).toBe(2);
  });

  it('chip nested in a span still gets the gap', () => {
    const out = htmlToTypstInline(
      `<p>see (<span style="color: inherit;">${chip()}</span>) now</p>`,
      ctx(),
    );
    console.log('NESTED:', out);
    expect((out.match(/h\(0\.6pt/g) || []).length).toBe(2);
  });

  it('chip inside a ref-bracket-glue span still gets the gap', () => {
    const out = htmlToTypstInline(
      `<p>see <span class="ref-bracket-glue" style="white-space: nowrap">(<span class="ref-bracket-gap"></span>${chip()}<span class="ref-bracket-gap"></span>)</span> now</p>`,
      ctx(),
    );
    console.log('GLUED:', out);
    expect((out.match(/h\(0\.6pt/g) || []).length).toBe(2);
  });

  it('chip at start of paragraph after an opening bracket keeps the gap', () => {
    const out = htmlToTypstInline(`<p>(${chip()}) leads</p>`, ctx());
    console.log('LINESTART:', out);
    expect(out).toContain('h(0.6pt, weak: false) + chip-pill');
  });

  it('only one side when only one bracket', () => {
    const out = htmlToTypstInline(`<p>see (${chip()} and more) now</p>`, ctx());
    console.log('ONESIDE:', out);
    expect((out.match(/h\(0\.6pt/g) || []).length).toBe(1);
  });
});

/* Real stored markup from SUSIE-Q (card_fields d398a80d-…): a deliverable chip
 * nested inside a presentational span and wrapped in round brackets. */
describe('SUSIE-Q stored markup', () => {
  const realChip =
    '<span style="color: inherit;"><span data-ref-type="deliverable" data-deliverable-number="D1.2" data-deliverable-id="e446cea9-e66c-40fa-82ae-c1f903cc3973" data-wp-color="#73C92D" data-inline-reference="" class="inline-ref inline-ref-deliverable" contenteditable="false"><span>D1.2</span></span></span>';

  it('bracketed gains the gap, unbracketed does not', () => {
    const bracketed = htmlToTypstInline(`<p>where feasible (${realChip}), and</p>`, ctx());
    const plain = htmlToTypstInline(`<p>delivered through ${realChip} in month 12.</p>`, ctx());
    expect((bracketed.match(/h\(0\.6pt/g) || []).length).toBe(2);
    expect(plain).not.toContain('h(0.6pt');
  });
});
