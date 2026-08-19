import { describe, it, expect } from 'vitest';
import DOMPurify from 'dompurify';
import { hydrateRefBadges } from '@/lib/hydrateRefBadges';
import { CROSS_REF_RICH_TEXT_CONFIG } from '@/lib/sanitizePresets';
import { sanitizeEditorHtml } from '@/lib/editorContentSanitizer';
import { buildDeliverableBadge, buildMilestoneBadge, buildWPBadge } from '@/lib/contentEditableRefBadges';

describe('badge contenteditable survives the save/load cycle', () => {
  it('builders mark the outer element and every nested layer', () => {
    const del = buildDeliverableBadge({ id: 'd1', number: 'D1.2', wp_color: '#73C92D' });
    expect(del.getAttribute('contenteditable')).toBe('false');
    expect(del.getAttribute('data-badge')).toBe('deliverable');
    expect(del.children.length).toBeGreaterThan(0);
    Array.from(del.querySelectorAll('*')).forEach((child) => {
      expect(child.getAttribute('contenteditable')).toBe('false');
    });

    expect(buildMilestoneBadge({ id: 'm1', number: 3 }).getAttribute('contenteditable')).toBe('false');
    expect(buildWPBadge({ id: 'w1', number: 1, short_name: 'Needs', color: '#000' }).getAttribute('contenteditable')).toBe('false');
  });

  it('the canonical (server) sanitiser keeps contenteditable on badges only', () => {
    const html =
      '<p contenteditable="true">text ' +
      '<span contenteditable="false" data-badge="wp" data-wp-reference="" data-wp-id="w1" data-wp-number="1">WP1</span>' +
      '</p>';
    const out = sanitizeEditorHtml(html);
    expect(out).toContain('contenteditable="false"');
    expect(out).not.toContain('contenteditable="true"');
    expect(out).toContain('data-badge="wp"');
  });

  it('hydration re-asserts contenteditable on legacy badges that lack it', () => {
    const stored =
      '<p><span data-wp-reference="" data-wp-id="w1" data-wp-number="1" data-wp-short-name="Needs">WP1</span>' +
      '<span data-deliverable-reference="" data-deliverable-id="d1" data-deliverable-label="D1.2"></span></p>';
    const hydrated = hydrateRefBadges(DOMPurify.sanitize(stored, CROSS_REF_RICH_TEXT_CONFIG));
    const tpl = document.createElement('div');
    tpl.innerHTML = hydrated;
    const badges = tpl.querySelectorAll('[data-wp-id], [data-deliverable-id]');
    expect(badges.length).toBe(2);
    badges.forEach((b) => expect(b.getAttribute('contenteditable')).toBe('false'));
  });
});
