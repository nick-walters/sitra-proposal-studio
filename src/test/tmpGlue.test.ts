import { describe, it, expect } from 'vitest';
import { glueBadgeBrackets } from '@/lib/renderRefBadges';

const REAL = '<p>plus via a survey among ≥30 HSC experts from across Europe (<span style="color: inherit;"><span data-ref-type="deliverable" data-deliverable-number="D1.2" data-deliverable-id="e446cea9" data-wp-color="#73C92D" data-inline-reference="">D1.2</span></span>) and more [<span data-wp-reference="" data-wp-id="x">WP4</span>] end.</p>';

describe('bracket glue', () => {
  it('wraps brackets with the chip', () => {
    const d = document.createElement('div');
    d.innerHTML = REAL;
    glueBadgeBrackets(d);
    console.log(d.innerHTML);
    expect(d.querySelectorAll('.ref-bracket-glue').length).toBe(2);
    const texts = [...d.querySelectorAll('.ref-bracket-glue')].map((e) => e.textContent);
    expect(texts).toEqual(['(D1.2)', '[WP4]']);
    const before = d.innerHTML;
    glueBadgeBrackets(d);
    expect(d.innerHTML).toBe(before);
    expect(d.textContent).toContain('Europe (D1.2) and more [WP4] end.');
  });
});
