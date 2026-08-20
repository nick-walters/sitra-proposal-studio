import { describe, it, expect } from 'vitest';
import { renderRefBadges } from '@/lib/renderRefBadges';
import type { RefSnapshot } from '@/lib/referenceData';

const LEGACY_CHIP =
  '<p>tested in the pilots in <span data-wp-reference="" data-wp-id="wp4" data-wp-number="4" data-wp-color="#E8114B"><span>WP4</span></span>.</p>';

function snap(): RefSnapshot {
  return {
    wpById: new Map([['wp4', { id: 'wp4', number: 4, short_name: 'Piloting', color: '#E8114B' }]]),
    taskById: new Map(),
    deliverableById: new Map(),
    milestoneById: new Map(),
    caseById: new Map(),
    participantById: new Map(),
    figureById: new Map(),
    tableCaptionKeys: new Set(),
    acronymSegments: [],
  } as unknown as RefSnapshot;
}

describe('legacy WP chip label on the render path', () => {
  it('shows what renderRefBadges produces for a legacy (no data-wp-n) chip', () => {
    const out = renderRefBadges(LEGACY_CHIP, snap());
    // eslint-disable-next-line no-console
    console.log('RENDERED:', out.replace(/style="[^"]*"/g, ''));
    expect(out).toContain('WP4');
  });
});

describe('legacy WP chip label on the editor/static-field path', () => {
  it('shows what the TipTap node renders', async () => {
    const { generateHTML, generateJSON } = await import('@tiptap/core');
    const { LAZY_RICH_FIELD_EXTENSIONS } = await import('@/components/participant/lazyRichFieldExtensions');
    const json = generateJSON(LEGACY_CHIP, LAZY_RICH_FIELD_EXTENSIONS as any);
    const html = generateHTML(json, LAZY_RICH_FIELD_EXTENSIONS as any);
    // eslint-disable-next-line no-console
    console.log('EDITOR:', html.replace(/style="[^"]*"/g, ''));
    expect(html).toContain('WP4');
  });
});
