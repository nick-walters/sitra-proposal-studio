import { describe, expect, it } from 'vitest';
import { buildSectionTypstBody, type SectionBlockTree } from '@/lib/typst/sectionToTypst';
import type { AuthoredFigureBlock } from '@/lib/typst/authoredFigures';
import type { ProposalCard } from '@/types/cards';

function figureCard(id: string): ProposalCard {
  return {
    id,
    proposalId: 'proposal-test',
    sectionId: 'section-test',
    document: 'part_b',
    kind: 'figure',
    templateKey: null,
    title: null,
    orderIndex: 0,
    anchor: 'free',
    isDeletable: true,
    isHideable: true,
    isSourceFed: false,
    isFixedPosition: false,
    isVisible: true,
    titleVersion: 1,
    titleMode: 'off',
    sourceKey: null,
    renderGroup: null,
    origin: 'manual',
    deletedAt: null,
    createdAt: '2026-09-15T00:00:00Z',
    updatedAt: '2026-09-15T00:00:00Z',
  };
}

function floatedFigure(
  cardId: string,
  captionKind: AuthoredFigureBlock['captionKind'],
): AuthoredFigureBlock {
  return {
    cardId,
    fieldId: null,
    status: 'ok',
    assetPath: '/figures/authored-test.jpg',
    label: captionKind === 'table' ? 'Table 2.2.d.' : 'Figure 2.2.d.',
    caption: 'Impact summary canvas',
    captionKind,
    widthPct: 100,
    positionMode: 'below',
    pageBreakMode: 'float_top',
    groupWithAbove: false,
    groupWithBelow: false,
  };
}

function render(captionKind: AuthoredFigureBlock['captionKind']): string {
  const card = figureCard(`card-${captionKind}`);
  const tree: SectionBlockTree = { cards: [card], fieldsByCard: {} };
  return buildSectionTypstBody(tree, {
    sectionLabel: '2.2. Measures to maximise impact',
    authoredFigures: new Map([[card.id, floatedFigure(card.id, captionKind)]]),
  }).source;
}

describe('Typst float-top authored figures', () => {
  it('executes an image and its figure caption inside the content block', () => {
    const source = render('figure');

    expect(source).toContain(
      'he-figure-float(stack(dir: ttb, spacing: 0pt, he-figure-image("/figures/authored-test.jpg", 100, tight: false), he-figure-caption("Figure 2.2.d.", "Impact summary canvas")))',
    );
    expect(source).not.toContain('he-figure-float([');
  });

  it('executes a table caption, gap and image inside the content block', () => {
    const source = render('table');

    expect(source).toContain(
      'he-figure-float(stack(dir: ttb, spacing: 1.5pt, he-image-table-caption("Table 2.2.d.", "Impact summary canvas"), he-figure-image("/figures/authored-test.jpg", 100, tight: true)))',
    );
    expect(source).not.toContain('he-figure-float([');
  });
});