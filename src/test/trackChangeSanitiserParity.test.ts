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

describe('track-changes static round trip', () => {
  it('keeps both marks and their metadata through generateJSON → generateHTML', async () => {
    const { generateHTML, generateJSON } = await import('@tiptap/core');
    const { LAZY_RICH_FIELD_EXTENSIONS } = await import(
      '@/components/participant/lazyRichFieldExtensions'
    );
    const html =
      '<p><span data-track-insertion="" data-change-id="c1" data-author-id="u1" ' +
      'data-author-name="Nick Walters" data-author-color="#E91E63" ' +
      'data-timestamp="2026-08-27T05:00:00.000Z">added</span></p>';
    const out = generateHTML(
      generateJSON(html, LAZY_RICH_FIELD_EXTENSIONS),
      LAZY_RICH_FIELD_EXTENSIONS,
    );
    expect(out).toContain('data-track-insertion');
    expect(out).toContain('data-change-id="c1"');
    expect(out).toContain('data-author-name="Nick Walters"');
    expect(out).toContain('data-timestamp="2026-08-27T05:00:00.000Z"');
  });
});

describe('tracked changes in the Typst output', () => {
  it('renders the document with every pending change rejected', async () => {
    const { htmlToTypstInline } = await import('@/lib/typst/htmlToTypst');
    const ctx = { unsupported: new Set<string>() };
    const ins = htmlToTypstInline(
      '<span data-track-insertion="" data-author-color="#E91E63">added</span>',
      ctx as never,
    );
    const del = htmlToTypstInline(
      '<span data-track-deletion="" data-author-color="#E91E63">removed</span>',
      ctx as never,
    );
    // An insertion has not been accepted, so it is not in the document yet.
    expect(ins).not.toContain('added');
    // A deletion has not been accepted either: the text is still there, plain.
    expect(del).toContain('removed');
    expect(del).not.toContain('strike(');
  });
});
