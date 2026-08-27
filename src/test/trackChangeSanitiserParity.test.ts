import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import DOMPurify from 'dompurify';

import {
  TRACK_CHANGE_ATTRS,
  RICH_TEXT_CONFIG,
  RICH_TEXT_WITH_DIV_CONFIG,
  RICH_TEXT_WITH_IMAGES_CONFIG,
  RICH_TEXT_WITH_DIFF_CONFIG,
  CROSS_REF_RICH_TEXT_CONFIG,
} from '@/lib/sanitizePresets';

/**
 * The client (DOMPurify presets) and the edge sanitiser must agree on the
 * track-changes attributes. If they drift, one side silently accepts a
 * deletion or downgrades an insertion to plain text.
 */
function serverAllowedDataAttrs(): Set<string> {
  const src = readFileSync(
    resolve(__dirname, '../../supabase/functions/_shared/sanitizeEditorHtml.ts'),
    'utf8',
  );
  const block = src.split('export const ALLOWED_DATA_ATTRS')[1]?.split('])')[0] ?? '';
  return new Set([...block.matchAll(/'([^']+)'/g)].map((m) => m[1]));
}

describe('track-changes sanitiser parity', () => {
  it('the edge sanitiser allows every client track attribute', () => {
    const server = serverAllowedDataAttrs();
    for (const attr of TRACK_CHANGE_ATTRS) {
      expect(server.has(attr), `edge sanitiser drops ${attr}`).toBe(true);
    }
  });

  it('every rich-text preset keeps the track attributes', () => {
    const presets = {
      RICH_TEXT_CONFIG,
      RICH_TEXT_WITH_DIV_CONFIG,
      RICH_TEXT_WITH_IMAGES_CONFIG,
      RICH_TEXT_WITH_DIFF_CONFIG,
      CROSS_REF_RICH_TEXT_CONFIG,
    };
    for (const [name, preset] of Object.entries(presets)) {
      for (const attr of TRACK_CHANGE_ATTRS) {
        expect(preset.ALLOWED_ATTR.includes(attr), `${name} drops ${attr}`).toBe(true);
      }
    }
  });

  it('survives an actual sanitise pass', () => {
    const html =
      '<p><span data-track-insertion="" data-change-id="c1" data-author-id="u1" ' +
      'data-author-name="Nick Walters" data-author-color="#E91E63" ' +
      'data-timestamp="2026-08-27T05:00:00.000Z">added</span>' +
      '<span data-track-deletion="" data-change-id="c2" data-author-id="u1" ' +
      'data-author-name="Nick Walters" data-author-color="#E91E63" ' +
      'data-timestamp="2026-08-27T05:00:01.000Z">removed</span></p>';
    const out = DOMPurify.sanitize(html, CROSS_REF_RICH_TEXT_CONFIG);
    for (const attr of TRACK_CHANGE_ATTRS) {
      expect(out).toContain(attr);
    }
    expect(out).toContain('Nick Walters');
  });
});
