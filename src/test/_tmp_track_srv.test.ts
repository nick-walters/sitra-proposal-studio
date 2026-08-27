import { describe, it, expect } from 'vitest';
import { sanitizeEditorHtml } from '../../supabase/functions/_shared/sanitizeEditorHtml';
describe('server', () => { it('keeps track attrs', () => {
  const html = '<p><span data-track-insertion="" data-change-id="c1" data-author-id="u1" data-author-name="Nick Walters" data-author-color="#E91E63" data-timestamp="2026-08-27T05:00:00.000Z">added</span><span data-track-deletion="" data-change-id="c2" data-author-name="Nick Walters" data-author-color="#E91E63">removed</span></p>';
  const out = sanitizeEditorHtml(html);
  console.log(out);
  expect(out).toContain('data-track-insertion');
  expect(out).toContain('data-track-deletion');
  expect(out).toContain('data-timestamp');
}); });
