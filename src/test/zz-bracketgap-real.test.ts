import { describe, expect, it } from 'vitest';
import { htmlToTypstInline } from '@/lib/typst/htmlToTypst';

const ctx = () => ({ unsupported: new Set<string>() });

// Real stored markup from SUSIE-Q (card_fields d398a80d… and 7a0569c5…):
// a deliverable chip nested inside a presentational span, wrapped in brackets.
const BRACKETED =
  '<p>…where feasible (<span style="color: inherit;"><span data-ref-type="deliverable" data-deliverable-number="D1.2" data-deliverable-id="e446cea9-e66c-40fa-82ae-c1f903cc3973" data-wp-color="#73C92D" data-inline-reference="" class="inline-ref inline-ref-deliverable" contenteditable="false"><span>D1.2</span></span></span>), and a cryptographic…</p>';

const UNBRACKETED =
  '<p>…delivered through <span style="color: inherit;"><span data-ref-type="deliverable" data-deliverable-number="D1.2" data-deliverable-id="e446cea9-e66c-40fa-82ae-c1f903cc3973" data-wp-color="#73C92D" data-inline-reference="" class="inline-ref inline-ref-deliverable" contenteditable="false"><span>D1.2</span></span></span> in month 12.</p>';

describe('SUSIE-Q real markup', () => {
  it('bracketed', () => {
    const out = htmlToTypstInline(BRACKETED, ctx());
    console.log('REAL BRACKETED:', out);
    expect((out.match(/h\(0\.6pt/g) || []).length).toBe(2);
  });
  it('unbracketed', () => {
    const out = htmlToTypstInline(UNBRACKETED, ctx());
    console.log('REAL UNBRACKETED:', out);
    expect(out).not.toContain('h(0.6pt');
  });
});
