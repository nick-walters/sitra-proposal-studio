import { describe, it, expect } from 'vitest';
import { hydrateRefBadges } from '@/lib/hydrateRefBadges';

const stored = `<p><span data-participant-reference="" data-participant-number="7" data-participant-id="908" data-participant-short-name="Varha" style="color: rgb(255, 255, 255); font-weight: 700; display: inline-flex">Varha</span> and <span data-wp-reference="" data-wp-number="4" data-wp-id="7d6" data-wp-color="#E8114B" style="color: rgb(255, 255, 255); font-weight: 700">WP4</span> plus <span data-task-id="46d" style="display: inline-flex; height: 17px; color: rgb(115, 201, 45); font-weight: 700">T1.2</span> and <span data-milestone-id="m1" style="color: rgb(255,255,255)">MS1</span> and <span data-deliverable-id="d1" style="display:inline-block"><svg stroke="#008549"></svg><span style="color:#008549">D2.1</span></span></p>`;

describe('hydrate wp draft badges', () => {
  it('rebuilds pills', () => {
    const out = hydrateRefBadges(stored);
    console.log(out);
    expect(out).toContain('background-color: #000000');
    expect(out).toContain("background-color: #E8114B");
    expect(hydrateRefBadges(out)).toBe(out); // idempotent
  });
});
