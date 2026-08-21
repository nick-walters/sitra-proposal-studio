// Types for the Phase 3b table and figure blocks.

import type { CellAlignH, CellAlignV } from '@/lib/tableStyleSpec';

export interface CardTable {
  cardId: string;
  proposalId: string;
  caption: string | null;
  captionSuffix: string | null;
  variant: 'standard' | 'cases' | 'wp_description';
  /** 1 = one table; 2 = two stacked tables under a single caption. */
  parts: number;
}

export interface CardTableColumn {
  id: string;
  cardId: string;
  part: number;
  orderIndex: number;
  labelHtml: string | null;
  widthPx: number | null;
  alignH: CellAlignH | null;
  alignV: CellAlignV | null;
}

export interface CardTableRow {
  id: string;
  cardId: string;
  part: number;
  orderIndex: number;
  rowType: 'header' | 'body';
}

export interface CardTableCell {
  id: string;
  rowId: string;
  columnId: string;
  contentHtml: string | null;
  alignH: CellAlignH | null;
  alignV: CellAlignV | null;
  contentVersion: number;
}

export interface CardFigureBlockData {
  cardId: string;
  proposalId: string;
  figureId: string | null;
  float: 'none' | 'left' | 'right';
  maxWidthCm: number | null;
  caption: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export const mapCardTable = (row: any): CardTable => ({
  cardId: row.card_id,
  proposalId: row.proposal_id,
  caption: row.caption ?? null,
  captionSuffix: row.caption_suffix ?? null,
  variant: row.variant,
  parts: row.parts ?? 1,
});

export const mapCardTableColumn = (row: any): CardTableColumn => ({
  id: row.id,
  cardId: row.card_id,
  part: row.part,
  orderIndex: row.order_index,
  labelHtml: row.label_html ?? null,
  widthPx: row.width_px ?? null,
  alignH: (row.align_h ?? null) as CellAlignH | null,
  alignV: (row.align_v ?? null) as CellAlignV | null,
});

export const mapCardTableRow = (row: any): CardTableRow => ({
  id: row.id,
  cardId: row.card_id,
  part: row.part,
  orderIndex: row.order_index,
  rowType: row.row_type,
});

export const mapCardTableCell = (row: any): CardTableCell => ({
  id: row.id,
  rowId: row.row_id,
  columnId: row.column_id,
  contentHtml: row.content_html ?? null,
  alignH: (row.align_h ?? null) as CellAlignH | null,
  alignV: (row.align_v ?? null) as CellAlignV | null,
  contentVersion: row.content_version ?? 1,
});

export const mapCardFigure = (row: any): CardFigureBlockData => ({
  cardId: row.card_id,
  proposalId: row.proposal_id,
  figureId: row.figure_id ?? null,
  float: (row.float ?? 'none') as 'none' | 'left' | 'right',
  maxWidthCm: row.max_width_cm != null ? Number(row.max_width_cm) : null,
  caption: row.caption ?? null,
});
/* eslint-enable @typescript-eslint/no-explicit-any */
