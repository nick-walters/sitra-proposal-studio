import { describe, it, expect } from 'vitest';
import {
  renumberFigureCaptions,
  renumberTableCaptions,
  renumberCitations,
  renumberFootnotes,
  renumberAllCaptions,
  getNextFigureLetterFromContent,
  getNextTableLetterFromContent,
} from '@/lib/captionRenumbering';

describe('renumberFigureCaptions', () => {
  it('renumbers plain figure captions sequentially', () => {
    const content = 'Figure 1.1.c. Some text Figure 1.1.a. More text';
    const result = renumberFigureCaptions(content, '1.1');
    expect(result).toContain('Figure 1.1.a.');
    expect(result).toContain('Figure 1.1.b.');
    expect(result).not.toContain('Figure 1.1.c.');
  });

  it('renumbers bold figure captions', () => {
    const content = '<strong>Figure 2.3.z.</strong> Caption text';
    const result = renumberFigureCaptions(content, '2.3');
    expect(result).toContain('<strong>Figure 2.3.a.</strong>');
  });

  it('handles B-prefixed section numbers', () => {
    const content = 'Figure 1.1.b. Caption';
    const result = renumberFigureCaptions(content, 'B1.1');
    expect(result).toContain('Figure 1.1.a.');
  });

  it('returns unchanged content when no figures present', () => {
    const content = '<p>No figures here</p>';
    expect(renumberFigureCaptions(content, '1.1')).toBe(content);
  });
});

describe('renumberTableCaptions', () => {
  it('renumbers table captions sequentially', () => {
    const content = 'Table 1.1.c. First Table 1.1.a. Second';
    const result = renumberTableCaptions(content, '1.1');
    expect(result).toContain('Table 1.1.a.');
    expect(result).toContain('Table 1.1.b.');
  });

  it('handles bold table captions', () => {
    const content = '<strong>Table 3.2.x.</strong>';
    const result = renumberTableCaptions(content, '3.2');
    expect(result).toContain('Table 3.2.a.');
  });
});

describe('renumberCitations', () => {
  it('renumbers citations sequentially', () => {
    const content = 'Text<sup>[3]</sup> more<sup>[1]</sup> end<sup>[3]</sup>';
    const result = renumberCitations(content);
    expect(result.content).toBe('Text<sup>[1]</sup> more<sup>[2]</sup> end<sup>[1]</sup>');
  });

  it('returns unchanged content when no citations', () => {
    const content = '<p>No citations</p>';
    const result = renumberCitations(content);
    expect(result.content).toBe(content);
    expect(result.mapping.size).toBe(0);
  });

  it('builds correct mapping', () => {
    const content = '<sup>[5]</sup><sup>[2]</sup>';
    const result = renumberCitations(content);
    expect(result.mapping.get(5)).toBe(1);
    expect(result.mapping.get(2)).toBe(2);
  });
});

describe('renumberFootnotes', () => {
  it('renumbers and reorders footnotes based on mapping', () => {
    const footnotes = [
      { number: 3, citation: 'Ref C' },
      { number: 1, citation: 'Ref A' },
    ];
    const mapping = new Map([[3, 1], [1, 2]]);
    const result = renumberFootnotes(footnotes, mapping);
    expect(result[0]).toEqual({ number: 1, citation: 'Ref C' });
    expect(result[1]).toEqual({ number: 2, citation: 'Ref A' });
  });

  it('returns empty array for empty input', () => {
    expect(renumberFootnotes([], new Map())).toEqual([]);
  });

  it('preserves footnotes when mapping is empty', () => {
    const footnotes = [{ number: 1, citation: 'Ref' }];
    expect(renumberFootnotes(footnotes, new Map())).toEqual(footnotes);
  });
});

describe('renumberAllCaptions', () => {
  it('renumbers both figures and tables', () => {
    const content = 'Figure 1.1.z. text Table 1.1.y. text';
    const result = renumberAllCaptions(content, '1.1');
    expect(result).toContain('Figure 1.1.a.');
    expect(result).toContain('Table 1.1.a.');
  });
});

describe('getNextFigureLetterFromContent', () => {
  it('returns "a" when no figures exist', () => {
    expect(getNextFigureLetterFromContent('<p>Hello</p>', '1.1')).toBe('a');
  });

  it('returns next letter after existing figures', () => {
    const content = 'Figure 1.1.a. text Figure 1.1.b. more';
    expect(getNextFigureLetterFromContent(content, '1.1')).toBe('c');
  });
});

describe('getNextTableLetterFromContent', () => {
  it('returns "a" when no tables exist', () => {
    expect(getNextTableLetterFromContent('<p>Hello</p>', '2.3')).toBe('a');
  });

  it('returns next letter after existing tables', () => {
    const content = 'Table 2.3.a. text';
    expect(getNextTableLetterFromContent(content, '2.3')).toBe('b');
  });
});
