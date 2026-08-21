import { describe, it, expect } from 'vitest';
import {
  computeCitationNumbers,
  extractCitationRefKeys,
  type CitationInstance,
  type CitationNumberingBlock,
  type CitationNumberingField,
  type CitationNumberingSection,
} from '@/lib/citationNumbering';
import * as shared from '../../supabase/functions/_shared/citationNumbering';

const sections: CitationNumberingSection[] = [
  { id: 's1', order_index: 0, section_number: 'B1.1' },
  { id: 's2', order_index: 1, section_number: 'B1.2' },
];

const blocks: CitationNumberingBlock[] = [
  { id: 'b-tail', section_id: 's1', order_index: 0, anchor: 'tail', is_visible: true },
  { id: 'b-free2', section_id: 's1', order_index: 1, anchor: 'free', is_visible: true },
  { id: 'b-free1', section_id: 's1', order_index: 0, anchor: 'free', is_visible: true },
  { id: 'b-head', section_id: 's1', order_index: 0, anchor: 'head', is_visible: true },
  { id: 'b-hidden', section_id: 's1', order_index: 0, anchor: 'free', is_visible: false },
  { id: 'b-binned', section_id: 's1', order_index: 0, anchor: 'free', is_visible: true, deleted_at: '2026-08-01T00:00:00Z' },
  { id: 'b-s2', section_id: 's2', order_index: 0, anchor: 'free', is_visible: true },
];

const fields: CitationNumberingField[] = [
  { id: 'f-head', card_id: 'b-head', order_index: 0 },
  { id: 'f-free1-b', card_id: 'b-free1', order_index: 1 },
  { id: 'f-free1-a', card_id: 'b-free1', order_index: 0 },
  { id: 'f-free2', card_id: 'b-free2', order_index: 0 },
  { id: 'f-tail', card_id: 'b-tail', order_index: 0 },
  { id: 'f-hidden', card_id: 'b-hidden', order_index: 0 },
  { id: 'f-binned', card_id: 'b-binned', order_index: 0 },
  { id: 'f-s2', card_id: 'b-s2', order_index: 0 },
  { id: 'f-deleted', card_id: 'b-free1', order_index: 0, deleted_at: '2026-08-01T00:00:00Z' },
];

const cite = (ref_key: number, field_id: string, position = 0): CitationInstance => ({
  ref_key,
  field_id,
  position,
});

describe('extractCitationRefKeys', () => {
  it('reads the data-citation id, in order, including repeats', () => {
    const html = '<p>a<sup data-citation="7">3</sup> b<sup data-citation="2">1</sup> c<sup data-citation="7">3</sup></p>';
    expect(extractCitationRefKeys(html)).toEqual([7, 2, 7]);
  });

  it('falls back to numeric sup text for pre-node citations', () => {
    expect(extractCitationRefKeys('<p>x<sup>[4]</sup></p>')).toEqual([4]);
  });

  it('ignores non-numeric superscripts', () => {
    expect(extractCitationRefKeys('<p>3<sup>rd</sup></p>')).toEqual([]);
  });
});

describe('computeCitationNumbers', () => {
  it('numbers by first citation in reading order', () => {
    const map = computeCitationNumbers(
      [
        cite(50, 'f-s2'),
        cite(30, 'f-tail'),
        cite(20, 'f-free2'),
        cite(11, 'f-free1-b'),
        cite(10, 'f-free1-a'),
        cite(1, 'f-head'),
      ],
      fields,
      blocks,
      sections,
    );
    // head -> free(0) -> free(1) -> tail, then section 2.
    expect([...map.entries()]).toEqual([
      [1, 1],
      [10, 2],
      [11, 3],
      [20, 4],
      [30, 5],
      [50, 6],
    ]);
  });

  it('orders by position within a single field', () => {
    const map = computeCitationNumbers(
      [cite(9, 'f-head', 2), cite(8, 'f-head', 0), cite(7, 'f-head', 1)],
      fields,
      blocks,
      sections,
    );
    expect([...map.entries()]).toEqual([
      [8, 1],
      [7, 2],
      [9, 3],
    ]);
  });

  it('reuses the first number when a reference is cited again', () => {
    const map = computeCitationNumbers(
      [cite(5, 'f-head'), cite(6, 'f-free1-a'), cite(5, 'f-s2')],
      fields,
      blocks,
      sections,
    );
    expect(map.get(5)).toBe(1);
    expect(map.get(6)).toBe(2);
    expect(map.size).toBe(2);
  });

  it('skips hidden and binned blocks, and they consume no number', () => {
    const map = computeCitationNumbers(
      [cite(1, 'f-head'), cite(99, 'f-hidden'), cite(98, 'f-binned'), cite(2, 'f-s2')],
      fields,
      blocks,
      sections,
    );
    expect(map.get(1)).toBe(1);
    expect(map.get(2)).toBe(2);
    expect(map.has(99)).toBe(false);
    expect(map.has(98)).toBe(false);
  });

  it('skips deleted fields', () => {
    const map = computeCitationNumbers([cite(42, 'f-deleted')], fields, blocks, sections);
    expect(map.size).toBe(0);
  });

  it('renumbers everything after a removed citation', () => {
    const before = computeCitationNumbers(
      [cite(1, 'f-head'), cite(2, 'f-free1-a'), cite(3, 'f-s2')],
      fields,
      blocks,
      sections,
    );
    expect(before.get(3)).toBe(3);
    // The only citation of ref 2 is deleted: 3 moves up, and 2 has no number
    // although the reference itself remains in the library.
    const after = computeCitationNumbers([cite(1, 'f-head'), cite(3, 'f-s2')], fields, blocks, sections);
    expect(after.get(1)).toBe(1);
    expect(after.get(3)).toBe(2);
    expect(after.has(2)).toBe(false);
  });

  it('places block-anchored citations before that block’s fields', () => {
    const map = computeCitationNumbers(
      [cite(2, 'f-free1-a'), { ref_key: 1, card_id: 'b-free1', position: 0 }],
      fields,
      blocks,
      sections,
    );
    expect(map.get(1)).toBe(1);
    expect(map.get(2)).toBe(2);
  });
});

describe('client/server parity', () => {
  it('the client module is the shared module, not a copy', () => {
    // If these ever stop being the same function object, two implementations
    // exist and can diverge — which is exactly what happened to the reference
    // formatters before they were consolidated.
    expect(computeCitationNumbers).toBe(shared.computeCitationNumbers);
    expect(extractCitationRefKeys).toBe(shared.extractCitationRefKeys);
  });

  it('produces identical results through both entry points', () => {
    const instances = [cite(4, 'f-head'), cite(9, 'f-s2'), cite(4, 'f-tail')];
    expect([...computeCitationNumbers(instances, fields, blocks, sections)]).toEqual([
      ...shared.computeCitationNumbers(instances, fields, blocks, sections),
    ]);
    const html = '<p><sup data-citation="4">1</sup><sup>[9]</sup></p>';
    expect(extractCitationRefKeys(html)).toEqual(shared.extractCitationRefKeys(html));
  });
});
