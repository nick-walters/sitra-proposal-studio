// Types for the figure block.
//
// Table blocks were removed: a table inside a text block already offers merge
// and split cells, formulas, auto-resize and captions, and works in the
// editor, mirrors and exports.

import type {
  FigurePageBreakMode,
  FigurePositionMode,
  FigureWidthMode,
} from '@/lib/figureLayout';

export interface CardFigureBlockData {
  cardId: string;
  proposalId: string;
  figureId: string | null;
  float: 'none' | 'left' | 'right';
  maxWidthCm: number | null;
  caption: string | null;
  /** Width as a fraction of the PAGE width. */
  widthMode: FigureWidthMode;
  /** Percentage of the page width, honoured only when widthMode is 'custom'. */
  customWidthPct: number;
  /** No page break may fall between this figure and the block above/below. */
  groupWithAbove: boolean;
  groupWithBelow: boolean;
  /** Position compared to the block above. */
  positionMode: FigurePositionMode;
  /** Page-break behaviour, applied by the Typst renderer in a later phase. */
  pageBreakMode: FigurePageBreakMode;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export const mapCardFigure = (row: any): CardFigureBlockData => ({
  cardId: row.card_id,
  proposalId: row.proposal_id,
  figureId: row.figure_id ?? null,
  float: (row.float ?? 'none') as 'none' | 'left' | 'right',
  maxWidthCm: row.max_width_cm != null ? Number(row.max_width_cm) : null,
  caption: row.caption ?? null,
  widthMode: (row.width_mode ?? 'full') as FigureWidthMode,
  customWidthPct: row.custom_width_pct != null ? Number(row.custom_width_pct) : 100,
  groupWithAbove: row.group_with_above ?? false,
  groupWithBelow: row.group_with_below ?? false,
  positionMode: (row.position_mode ?? 'below') as FigurePositionMode,
  pageBreakMode: (row.page_break_mode ?? 'auto') as FigurePageBreakMode,
});
/* eslint-enable @typescript-eslint/no-explicit-any */
