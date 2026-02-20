import { describe, it, expect } from 'vitest';

// Test the snippet filtering and section normalization logic
interface Snippet {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  section_ids?: string[];
  is_default?: boolean;
}

function normalizeSectionId(sectionId: string | undefined): string | undefined {
  return sectionId
    ?.toLowerCase()
    .replace(/^[a-z]/, '')
    .replace(/\./g, '-');
}

function filterSnippetsBySection(snippets: Snippet[], sectionId?: string): Snippet[] {
  const normalizedSectionId = normalizeSectionId(sectionId);
  return snippets.filter(snippet => {
    if (!snippet.section_ids || snippet.section_ids.length === 0) return true;
    if (!normalizedSectionId) return true;
    return snippet.section_ids.some(sid => sid === normalizedSectionId || sid === sectionId);
  });
}

function filterSnippets(
  snippets: Snippet[],
  searchQuery: string,
  selectedCategory: string,
): Snippet[] {
  return snippets.filter(snippet => {
    const matchesSearch = searchQuery === '' ||
      snippet.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      snippet.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      snippet.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || snippet.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });
}

const mkSnippet = (overrides: Partial<Snippet> = {}): Snippet => ({
  id: '1',
  title: 'Test Snippet',
  content: 'Some content',
  category: 'Impact',
  tags: ['tag1', 'tag2'],
  section_ids: [],
  is_default: false,
  ...overrides,
});

describe('normalizeSectionId', () => {
  it('returns undefined for undefined input', () => {
    expect(normalizeSectionId(undefined)).toBeUndefined();
  });

  it('strips leading letter and replaces dot with dash', () => {
    expect(normalizeSectionId('B1.1')).toBe('1-1');
  });

  it('lowercases the input', () => {
    expect(normalizeSectionId('B2.1')).toBe('2-1');
  });

  it('handles already normalized input', () => {
    expect(normalizeSectionId('b1-1')).toBe('1-1');
  });

  it('handles multi-dot section IDs', () => {
    expect(normalizeSectionId('B1.1.2')).toBe('1-1-2');
  });
});

describe('filterSnippetsBySection', () => {
  it('returns all snippets when no section_ids defined', () => {
    const snippets = [mkSnippet({ section_ids: [] })];
    expect(filterSnippetsBySection(snippets, 'b1-1')).toHaveLength(1);
  });

  it('returns all snippets when no sectionId provided', () => {
    const snippets = [mkSnippet({ section_ids: ['b1-1'] })];
    expect(filterSnippetsBySection(snippets, undefined)).toHaveLength(1);
  });

  it('filters out snippets for different sections', () => {
    const snippets = [mkSnippet({ section_ids: ['b1-1'] })];
    expect(filterSnippetsBySection(snippets, 'b2-1')).toHaveLength(0);
  });

  it('includes matching section snippets', () => {
    const snippets = [mkSnippet({ section_ids: ['b1-1', 'b2-1'] })];
    expect(filterSnippetsBySection(snippets, 'b1-1')).toHaveLength(1);
  });
});

describe('filterSnippets', () => {
  const snippets = [
    mkSnippet({ id: '1', title: 'Dissemination Plan', category: 'Impact', tags: ['dissemination'] }),
    mkSnippet({ id: '2', title: 'Risk Table', category: 'Implementation', tags: ['risks'] }),
    mkSnippet({ id: '3', title: 'Open Science', category: 'Cross-cutting', tags: ['open'], content: 'FAIR data principles' }),
  ];

  it('returns all with empty search and all category', () => {
    expect(filterSnippets(snippets, '', 'all')).toHaveLength(3);
  });

  it('filters by category', () => {
    expect(filterSnippets(snippets, '', 'Impact')).toHaveLength(1);
  });

  it('searches by title', () => {
    expect(filterSnippets(snippets, 'dissemination', 'all')).toHaveLength(1);
  });

  it('searches by content', () => {
    expect(filterSnippets(snippets, 'FAIR', 'all')).toHaveLength(1);
  });

  it('searches by tag', () => {
    expect(filterSnippets(snippets, 'risks', 'all')).toHaveLength(1);
  });

  it('combines search and category filter', () => {
    expect(filterSnippets(snippets, 'open', 'Impact')).toHaveLength(0);
    expect(filterSnippets(snippets, 'open', 'Cross-cutting')).toHaveLength(1);
  });

  it('search is case insensitive', () => {
    expect(filterSnippets(snippets, 'RISK', 'all')).toHaveLength(1);
  });

  it('returns empty for no match', () => {
    expect(filterSnippets(snippets, 'xyznonexistent', 'all')).toHaveLength(0);
  });
});
