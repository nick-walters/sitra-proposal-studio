import { describe, it, expect } from 'vitest';
import DOMPurify from 'dompurify';
import { RICH_TEXT_CONFIG } from '@/lib/sanitizePresets';
import { normalizeRefBadges } from '@/lib/normalizeRefBadges';
import { buildDeliverableBadge, buildMilestoneBadge } from '@/lib/contentEditableRefBadges';

describe('B3.1 mirror sanitisation of ref badges', () => {
  it('keeps deliverable badge markup through sanitize + normalize', () => {
    const el = buildDeliverableBadge({ id: 'x', number: '1.2', wp_color: '#73C92D' });
    const html = `<p>Report ${el.outerHTML} delivered</p>`;
    const sanitized = String(DOMPurify.sanitize(html, RICH_TEXT_CONFIG));
    const out = normalizeRefBadges(sanitized);
    expect(out).toContain('data-deliverable-reference');
    expect(out).toContain('1.2');
  });

  it('keeps milestone badge markup', () => {
    const el = buildMilestoneBadge({ id: 'y', number: 3 });
    const sanitized = String(DOMPurify.sanitize(el.outerHTML, RICH_TEXT_CONFIG));
    expect(normalizeRefBadges(sanitized)).toContain('MS3');
  });
});
