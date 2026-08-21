// Types for the figure block.
//
// Table blocks were removed: a table inside a text block already offers merge
// and split cells, formulas, auto-resize and captions, and works in the
// editor, mirrors and exports.

/** How a figure block occupies the text column. */
export type FigurePlacement = 'full_width' | 'beside_next' | 'top_of_page';

export interface CardFigureBlockData {
  cardId: string;
  proposalId: string;
  figureId: string | null;
  float: 'none' | 'left' | 'right';
  maxWidthCm: number | null;
  caption: string | null;
  /** Width as a percentage of the text column. */
  widthPct: number;
  placement: FigurePlacement;
  /** Break controls, applied by the Typst renderer in a later phase. */
  breakBefore: boolean;
  keepWithNext: boolean;
  keepWhole: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export const mapCardFigure = (row: any): CardFigureBlockData => ({
  cardId: row.card_id,
  proposalId: row.proposal_id,
  figureId: row.figure_id ?? null,
  float: (row.float ?? 'none') as 'none' | 'left' | 'right',
  maxWidthCm: row.max_width_cm != null ? Number(row.max_width_cm) : null,
  caption: row.caption ?? null,
  widthPct: row.width_pct != null ? Number(row.width_pct) : 100,
  placement: (row.placement ?? 'full_width') as FigurePlacement,
  breakBefore: row.break_before ?? false,
  keepWithNext: row.keep_with_next ?? false,
  keepWhole: row.keep_whole ?? true,
});
/* eslint-enable @typescript-eslint/no-explicit-any */
