import { beforeAll, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { htmlToTypstBlocks, type ConvertContext } from '@/lib/typst/htmlToTypst';

beforeAll(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  Object.assign(globalThis, {
    document: dom.window.document,
    Node: dom.window.Node,
    Element: dom.window.Element,
  });
});

function context(): ConvertContext {
  return {
    unsupported: new Set(),
    captionNumbering: { sectionNumber: '1.2', tableIndex: 0, figureIndex: 0 },
  };
}

describe('Typst authored content typography', () => {
  it('derives separate table and figure caption sequences', () => {
    const ctx = context();
    const result = htmlToTypstBlocks(
      '<p class="document-table-caption"><span data-caption-label></span><em>Alpha</em></p>' +
        '<p class="figure-caption"><span data-caption-label></span><em>Beta</em></p>' +
        '<p class="document-table-caption"><span data-caption-label></span><em>Gamma</em></p>',
      ctx,
    ).join('\n');

    expect(result).toContain('he-caption("Table 1.2.a."');
    expect(result).toContain('he-figure-caption("Figure 1.2.a."');
    expect(result).toContain('he-caption("Table 1.2.b."');
  });

  it('routes authored tables through the shared borderless table helper', () => {
    const result = htmlToTypstBlocks(
      '<table><tbody><tr><th><p>Head</p></th></tr><tr><td><p>Body</p></td></tr></tbody></table>',
      context(),
    ).join('\n');

    expect(result).toContain('he-authored-table(');
    expect(result).toContain('table.header(');
  });

  it('keeps H3 spacing at three points before and after', () => {
    const result = htmlToTypstBlocks('<h3>Heading</h3>', context()).join('\n');
    expect(result).toContain('block(above: 3pt, below: 3pt');
  });
});
describe('Typst authored table array emission', () => {
  it('emits one-element cell and column tuples as arrays', () => {
    const result = htmlToTypstBlocks(
      '<table><tbody><tr><th><p>Only header</p></th></tr></tbody></table>',
      context(),
    ).join('\n');
    // Without the trailing comma Typst reads `(x)` as content and the spread
    // inside he-authored-table fails with "cannot spread content".
    expect(result).toContain('(1fr,)');
    expect(result).toMatch(/table\.header\([\s\S]*\),\)/);
  });

  it('drops tables that have no cells', () => {
    expect(htmlToTypstBlocks('<table></table>', context()).join('')).toBe('');
  });
});
