/**
 * WP chip label form across every render surface.
 *
 * A WP chip records the form chosen at insertion in
 * `data-wp-show-short-name`. Legacy chips predate the attribute and must stay
 * BARE ("WP4"), because that is what they display in the editor and what they
 * read as in running prose. This test drives the real render paths — the
 * TipTap node, `renderRefBadges` (B3.1 and B3.2 mirrors), the export container
 * pass used by PDF and DOCX, and the backup edge function resolver — rather
 * than inferring from the formatters.
 */
import { describe, expect, it } from 'vitest';
import { generateHTML, generateJSON } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { WPReferenceNode } from '@/extensions/WPReferenceNode';
import { renderRefBadges, resolveRefBadgesInDom } from '@/lib/renderRefBadges';
import type { RefSnapshot } from '@/lib/referenceData';
import {
  emptySnapshot,
  resolveChipLabel,
} from '../../supabase/functions/_shared/referenceResolution';

const WP_ID = '11111111-1111-1111-1111-111111111111';

/** A chip as stored before `data-wp-show-short-name` existed. */
const LEGACY_CHIP =
  `<p>Work in <span data-wp-reference="" data-wp-id="${WP_ID}" ` +
  `data-wp-number="4" data-wp-color="#2563EB">WP4</span> continues.</p>`;

/** The same chip inserted with the labelled form explicitly chosen. */
const LABELLED_CHIP =
  `<p>Work in <span data-wp-reference="" data-wp-id="${WP_ID}" ` +
  `data-wp-number="4" data-wp-short-name="Piloting" data-wp-color="#2563EB" ` +
  `data-wp-show-short-name="true">WP4: Piloting</span> continues.</p>`;

function clientSnapshot(): RefSnapshot {
  return {
    wpById: new Map([[WP_ID, { id: WP_ID, number: 4, short_name: 'Piloting', color: '#2563EB' } as never]]),
    taskById: new Map(),
    deliverableById: new Map(),
    milestoneById: new Map(),
    caseById: new Map(),
    participantById: new Map(),
    figureById: new Map(),
    tableCaptionMap: new Map(),
    acronymSegments: [],
  } as RefSnapshot;
}

function serverSnapshot() {
  const snap = emptySnapshot();
  snap.wpById.set(WP_ID, { id: WP_ID, number: 4, short_name: 'Piloting' });
  return snap;
}

/** Editor surface: parse the stored chip and re-render it through the node. */
function editorLabel(html: string): string {
  // Round-trip through the schema exactly as the editor does on load.
  const extensions = [Document, Paragraph, Text, WPReferenceNode];
  return generateHTML(generateJSON(html, extensions), extensions)
    .replace(/<[^>]+>/g, '')
    .trim();
}

/** Mirror surface (B3.1 tables and B3.2 paragraph slots both call this). */
function mirrorLabel(html: string): string {
  return renderRefBadges(html, clientSnapshot()).replace(/<[^>]+>/g, '').trim();
}

/** Export surface: the DOM pass PDF and DOCX both run via prepareExportContainer. */
function exportLabel(html: string): string {
  const container = document.createElement('div');
  container.innerHTML = html;
  resolveRefBadgesInDom(container, clientSnapshot());
  return (container.textContent || '').trim();
}

/** Backup edge function surface. */
function serverLabel(attrs: Record<string, string>): string | null {
  return resolveChipLabel(attrs, serverSnapshot());
}

describe('WP chip label form is consistent across surfaces', () => {
  it('renders the BARE form on all five surfaces for a legacy chip', () => {
    expect(editorLabel(LEGACY_CHIP)).toBe('Work in WP4 continues.');
    expect(mirrorLabel(LEGACY_CHIP)).toBe('Work in WP4 continues.');
    expect(exportLabel(LEGACY_CHIP)).toBe('Work in WP4 continues.');
    expect(serverLabel({ 'data-wp-id': WP_ID })).toBe('WP4');
  });

  it('renders the LABELLED form on all five surfaces when the flag is true', () => {
    expect(editorLabel(LABELLED_CHIP)).toBe('Work in WP4: Piloting continues.');
    expect(mirrorLabel(LABELLED_CHIP)).toBe('Work in WP4: Piloting continues.');
    expect(exportLabel(LABELLED_CHIP)).toBe('Work in WP4: Piloting continues.');
    expect(serverLabel({ 'data-wp-id': WP_ID, 'data-wp-show-short-name': 'true' })).toBe(
      'WP4: Piloting',
    );
  });

  it('keeps the bare form even when the snapshot supplies a short name', () => {
    // Resolution must refresh the number and colour but never promote the form.
    expect(mirrorLabel(LEGACY_CHIP)).not.toContain('Piloting');
    expect(exportLabel(LEGACY_CHIP)).not.toContain('Piloting');
  });
});
