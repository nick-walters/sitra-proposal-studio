import { describe, it, expect } from 'vitest';
import {
  generateProposalFilePath,
  generateLogoPath,
  generateFigurePath,
  generateParticipantLogoPath,
  extractFilePathFromUrl,
} from '@/lib/proposalStorage';

const PROPOSAL_ID = 'd687661f-afbc-44fc-ac39-fad26b5d3336';

describe('generateProposalFilePath', () => {
  it('creates a path with category and sanitized filename', () => {
    const path = generateProposalFilePath(PROPOSAL_ID, 'figures', 'My Image!.png', { addTimestamp: false });
    expect(path).toBe(`${PROPOSAL_ID}/figures/my-image.png`);
  });

  it('adds a prefix when provided', () => {
    const path = generateProposalFilePath(PROPOSAL_ID, 'figures', 'test.png', { prefix: 'figure-1', addTimestamp: false });
    expect(path).toBe(`${PROPOSAL_ID}/figures/figure-1-test.png`);
  });

  it('includes timestamp by default', () => {
    const path = generateProposalFilePath(PROPOSAL_ID, 'logo', 'logo.png');
    expect(path).toMatch(/logo-\d+\.png$/);
  });

  it('truncates long filenames to 50 chars', () => {
    const longName = 'a'.repeat(100) + '.png';
    const path = generateProposalFilePath(PROPOSAL_ID, 'attachments', longName, { addTimestamp: false });
    const filename = path.split('/').pop()!;
    // base name limited to 50 + .png
    expect(filename.length).toBeLessThanOrEqual(55);
  });

  it('handles filenames with special characters', () => {
    const path = generateProposalFilePath(PROPOSAL_ID, 'figures', 'My (Special) File [2024].jpg', { addTimestamp: false });
    expect(path).toContain('my-special-file-2024');
    expect(path).toMatch(/\.jpg$/);
  });

  it('defaults to "file" for empty base names', () => {
    const path = generateProposalFilePath(PROPOSAL_ID, 'attachments', '.png', { addTimestamp: false });
    expect(path).toContain('file.png');
  });
});

describe('generateLogoPath', () => {
  it('creates a logo path with prefix', () => {
    const path = generateLogoPath(PROPOSAL_ID, 'my-logo.png');
    expect(path).toContain('/logo/project-logo-');
    expect(path).toMatch(/\.png$/);
  });
});

describe('generateFigurePath', () => {
  it('formats figure number with dashes', () => {
    const path = generateFigurePath(PROPOSAL_ID, '1.1.a', 'diagram.png');
    expect(path).toContain('/figures/figure-1-1-a-');
  });
});

describe('generateParticipantLogoPath', () => {
  it('creates participant logo path without timestamp', () => {
    const path = generateParticipantLogoPath(PROPOSAL_ID, 3, 'logo.png');
    expect(path).toBe(`${PROPOSAL_ID}/participants/partner-3-logo-logo.png`);
  });
});

describe('extractFilePathFromUrl', () => {
  it('extracts file path from a public URL', () => {
    const url = 'https://example.supabase.co/storage/v1/object/public/proposal-files/abc123/logo/test.png';
    expect(extractFilePathFromUrl(url)).toBe('abc123/logo/test.png');
  });

  it('returns null for non-matching URLs', () => {
    expect(extractFilePathFromUrl('https://example.com/other-path')).toBeNull();
  });
});
