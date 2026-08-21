/**
 * Figure block layout vocabulary.
 *
 * UNCONDITIONAL RULE — a figure is never split across a page boundary, and a
 * figure is never separated from its caption. There is deliberately no
 * "keep whole" control: it is not a choice the author makes. The rule is
 * recorded in three places and nowhere else:
 *   1. here, as FIGURE_NEVER_SPLITS, consumed by the renderer;
 *   2. the comment on the `card_figure` table in the database;
 *   3. the block's own help text under the page-break controls.
 */
export const FIGURE_NEVER_SPLITS = true;

export type FigureWidthMode =
  | 'full'
  | 'two_thirds'
  | 'half'
  | 'one_third'
  | 'one_quarter'
  | 'custom';

export type FigurePositionMode = 'below' | 'right_wrap' | 'left_wrap';

export type FigurePageBreakMode = 'auto' | 'keep_where_it_lands' | 'float_top' | 'next_page';

export const FIGURE_WIDTH_LABELS: Record<FigureWidthMode, string> = {
  full: 'Full page width',
  two_thirds: 'Two thirds page width',
  half: 'Half page width',
  one_third: 'One third page width',
  one_quarter: 'One quarter page width',
  custom: 'Custom',
};

/** Percentage of the PAGE width each preset resolves to. */
export const FIGURE_WIDTH_PERCENT: Record<Exclude<FigureWidthMode, 'custom'>, number> = {
  full: 100,
  two_thirds: 66.6667,
  half: 50,
  one_third: 33.3333,
  one_quarter: 25,
};

export const FIGURE_POSITION_LABELS: Record<FigurePositionMode, string> = {
  below: 'Below it',
  right_wrap: 'Right of the page, text wrapping on its left',
  left_wrap: 'Left of the page, text wrapping on its right',
};

export const FIGURE_PAGE_BREAK_LABELS: Record<FigurePageBreakMode, string> = {
  auto: 'Automatic',
  keep_where_it_lands: 'Keep where it lands',
  float_top: 'Float to the top of the page it lands on',
  next_page: 'Force to the top of the next page',
};

/** Resolved percentage of the page width for a block. */
export function resolveFigureWidthPct(mode: FigureWidthMode, customPct: number): number {
  if (mode === 'custom') return Math.min(Math.max(customPct, 1), 100);
  return FIGURE_WIDTH_PERCENT[mode];
}
