import { describe, it, expect } from 'vitest';
import { hydrateRefBadges } from '@/lib/hydrateRefBadges';

/**
 * Badges inserted into the plain contentEditable WP-draft fields carry only
 * their identity attribute (`data-task-id`, `data-deliverable-id`, …). The
 * save-time sanitiser strips background/border/padding, so without hydration
 * they render as bare coloured text (task/case) or as invisible white text
 * (participant / WP / milestone).
 */
const stored =
  '<p><span data-participant-reference="" data-participant-number="7" data-participant-id="908" ' +
  'data-participant-short-name="Varha" style="color: rgb(255, 255, 255); font-weight: 700">Varha</span> and ' +
  '<span data-wp-reference="" data-wp-number="4" data-wp-id="7d6" data-wp-color="#E8114B" ' +
  'style="color: rgb(255, 255, 255); font-weight: 700">WP4</span> plus ' +
  '<span data-task-id="46d" style="color: rgb(115, 201, 45); font-weight: 700">T1.2</span> and ' +
  '<span data-milestone-id="m1" style="color: rgb(255,255,255)">MS1</span> and ' +
  '<span data-deliverable-id="d1"><svg stroke="#008549"></svg><span style="color:#008549">D2.1</span></span></p>';

describe('WP draft cross-reference badge hydration', () => {
  const out = hydrateRefBadges(stored);

  it('rebuilds the participant pill', () => {
    expect(out).toContain('background-color: #000000');
    expect(out).toContain('>Varha</span>');
  });

  it('rebuilds the work package pill in its own colour', () => {
    expect(out).toContain('background-color: #E8114B');
  });

  it('rebuilds the task outline pill', () => {
    expect(out).toContain('border: 1.5px solid rgb(115, 201, 45)');
  });

  it('rebuilds the milestone chevron and deliverable pentagon', () => {
    expect(out).toContain('clip-path:polygon(12% 0%');
    expect(out).toContain('calc(100% - 8px)');
    expect(out).toContain('>D2.1</span>');
  });

  it('is stable when applied repeatedly', () => {
    const twice = hydrateRefBadges(out);
    expect(hydrateRefBadges(twice)).toBe(twice);
  });
});
