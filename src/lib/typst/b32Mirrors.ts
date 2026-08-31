/**
 * A2 → B3.2 mirror slots for Typst.
 *
 * Every B3.2 mirror is a TipTap ATOM node: the stored HTML holds only an empty
 * `<div data-b32-mirror-slot data-b32-slot-key="…">` and the visible content is
 * fetched and rendered live by `B32MirrorSlotNodeView`. The Typst converter
 * walks the stored HTML, so without an emitter every one of these slots
 * converts to nothing and the mirrored A2 content is absent from the preview
 * and the export.
 *
 * This module re-issues the NodeViews' own queries as plain async calls and
 * emits the same content in Typst, at the document's own typography:
 *  - paragraph slots (capacity, value chain, international): one entry per
 *    participant, the participant badge inline at the start of the first
 *    paragraph and the mirrored text following it;
 *  - infrastructure: the one-column "Access to critical infrastructure" table
 *    (see `b32InfraData.ts`), emitted from the stored atom in the HTML;
 *  - interdisciplinarity: the expertise matrix with its caption.
 */

import { supabase } from '@/integrations/supabase/client';
import type { B32SlotKey } from '@/extensions/B32MirrorSlotNode';
import { htmlToPlainText } from '@/lib/htmlToPlainText';
import { dropBlankBlocks, htmlHasInk } from './emptyBlocks';
import { fetchB32InfraTableData, type B32InfraTableData } from './b32InfraData';
import { pointWidths, ptTrack } from './tableColumns';
import {
  htmlToTypstBlocks,
  htmlToTypstInline,
  typstString,
  type ConvertContext,
} from './htmlToTypst';

/* eslint-disable @typescript-eslint/no-explicit-any */

const lit = (s: string) => `t(${typstString(s)})`;

export interface B32Participant {
  id: string;
  number: number | null;
  shortName: string;
}

export interface B32MatrixData {
  enabled: boolean;
  rows: { id: string; label: string }[];
  cols: { id: string; kind: string; participantId: string | null; headerText: string | null }[];
  checked: Set<string>;
}

export interface B32TypstData {
  participants: B32Participant[];
  /** Per participant id → the A2 fields, already sanitised of "not applicable". */
  descriptions: Map<
    string,
    {
      contribution_resources: string | null;
      value_chain: string | null;
      industrial_involvement: string | null;
      participation_justification: string | null;
      value_chain_applicable: boolean | null;
    }
  >;
  toggles: Record<string, boolean>;
  /** Rows for the one-column "Access to critical infrastructure" table. */
  infraTable: B32InfraTableData;
  matrix: B32MatrixData;
  /** Editor column widths (px) stored under `b32-expertise-matrix`, if any. */
  matrixWidthsPx: number[];
  captions: Map<string, string>;
}




function isBlank(html: string | null | undefined): boolean {
  if (!html) return true;
  return htmlToPlainText(String(html)).replace(/\u00a0/g, ' ').trim().length === 0;
}


/** Every query the B3.2 mirror NodeViews make, issued once for the export. */
export async function fetchB32TypstData(proposalId: string): Promise<B32TypstData> {
  const [propR, partsR, descR, capR, widthsR, mRowsR, mColsR] = await Promise.all([
    supabase
      .from('proposals')
      .select(
        'mirror_contribution_resources, mirror_value_chain, mirror_industrial_involvement, mirror_participation_justification, expertise_matrix_enabled',
      )
      .eq('id', proposalId)
      .maybeSingle(),
    supabase
      .from('participants')
      .select('id, participant_number, organisation_short_name')
      .eq('proposal_id', proposalId),
    supabase
      .from('participant_descriptions')
      .select(
        'participant_id, contribution_resources, value_chain, industrial_involvement, participation_justification, value_chain_applicable',
      )
      .eq('proposal_id', proposalId),
    supabase.from('table_captions').select('table_key, caption').eq('proposal_id', proposalId),
    supabase
      .from('table_column_widths')
      .select('column_widths')
      .eq('proposal_id', proposalId)
      .eq('table_key', 'b32-expertise-matrix')
      .maybeSingle(),

    supabase
      .from('expertise_matrix_rows')
      .select('id, label, order_index')
      .eq('proposal_id', proposalId)
      .order('order_index'),
    supabase
      .from('expertise_matrix_columns')
      .select('id, kind, participant_id, header_text, order_index')
      .eq('proposal_id', proposalId)
      .order('order_index'),
  ]);

  const prop = (propR.data || {}) as any;
  const participants: B32Participant[] = ((partsR.data || []) as any[])
    .map((p) => ({
      id: p.id as string,
      number: (p.participant_number ?? null) as number | null,
      shortName: (p.organisation_short_name ?? '') as string,
    }))
    .sort((a, b) => (a.number ?? 9999) - (b.number ?? 9999));

  const descriptions = new Map<string, any>();
  for (const d of (descR.data || []) as any[]) descriptions.set(d.participant_id, d);

  const captions = new Map<string, string>();
  for (const c of (capR.data || []) as any[]) {
    if (c.caption) captions.set(c.table_key, c.caption);
  }

  const infraTable = await fetchB32InfraTableData(proposalId);

  // Expertise matrix cells are only needed when the matrix is on.
  const matrixEnabled = prop.expertise_matrix_enabled ?? true;
  const checked = new Set<string>();
  if (matrixEnabled) {
    const cellsR = await supabase
      .from('expertise_matrix_cells')
      .select('row_id, column_id, checked, expertise_matrix_rows!inner(proposal_id)')
      .eq('expertise_matrix_rows.proposal_id', proposalId);
    for (const c of ((cellsR.data || []) as any[])) {
      if (c.checked) checked.add(`${c.row_id}|${c.column_id}`);
    }
  }

  return {
    participants,
    descriptions,
    toggles: {
      capacity: !!prop.mirror_contribution_resources,
      value_chain: !!prop.mirror_value_chain,
      industrial_involvement: !!prop.mirror_industrial_involvement,
      participation_justification: !!prop.mirror_participation_justification,
    },
    infraTable,
    matrix: {
      enabled: !!matrixEnabled,
      rows: ((mRowsR.data || []) as any[]).map((r) => ({ id: r.id, label: r.label || '' })),
      cols: ((mColsR.data || []) as any[]).map((c) => ({
        id: c.id,
        kind: c.kind,
        participantId: c.participant_id ?? null,
        headerText: c.header_text ?? null,
      })),
      checked,
    },
    matrixWidthsPx: (((widthsR.data as any)?.column_widths ?? []) as unknown[]).filter(
      (w): w is number => typeof w === 'number' && Number.isFinite(w) && w > 0,
    ),
    captions,
  };
}

/* ───────────────────────────── emitters ───────────────────────────── */

function participantChip(p: B32Participant | undefined): string {
  if (!p) return lit('');
  const name = p.shortName || '';
  const label = `${p.number ?? ''}${p.number != null ? '. ' : ''}${name}`;
  return `chip-pill(${typstString(label)}, black, filled: true)`;
}

/**
 * One participant's mirrored text with its badge inline at the start, exactly
 * as the board renders it: the badge sits in the first line of the first
 * paragraph, every following paragraph is ordinary body copy.
 */
function leadInBlocks(chip: string, html: string, ctx: ConvertContext): string[] {
  const tpl = document.createElement('template');
  tpl.innerHTML = html
    .replace(/^(?:\s*<p[^>]*>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>)+/i, '')
    .replace(/(?:<p[^>]*>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>\s*)+$/i, '');
  const children = Array.from(tpl.content.children);
  if (children.length === 0) {
    return [`par(justify: true, ${chip} + h(4pt) + ${htmlToTypstInline(html, ctx)})`];
  }
  const out = [
    `par(justify: true, ${chip} + h(4pt) + ${htmlToTypstInline(children[0].outerHTML, ctx)})`,
  ];
  for (const child of children.slice(1)) {
    out.push(...htmlToTypstBlocks(child.outerHTML, ctx));
  }
  return out;
}

type ParagraphSlotKey = 'capacity' | 'value-chain' | 'international';

const PARAGRAPH_FIELDS: Record<ParagraphSlotKey, { field: string; toggle: string }[]> = {
  capacity: [{ field: 'contribution_resources', toggle: 'capacity' }],
  'value-chain': [
    { field: 'value_chain', toggle: 'value_chain' },
    { field: 'industrial_involvement', toggle: 'industrial_involvement' },
  ],
  international: [{ field: 'participation_justification', toggle: 'participation_justification' }],
};

function emitParagraphSlot(
  slotKey: ParagraphSlotKey,
  data: B32TypstData,
  ctx: ConvertContext,
): string[] {
  const configs = PARAGRAPH_FIELDS[slotKey].filter((c) => data.toggles[c.toggle]);
  if (!configs.length) return [];

  const out: string[] = [];
  let emittedAny = false;
  for (const p of data.participants) {
    const desc = data.descriptions.get(p.id);
    const htmls = configs
      .map((c) => {
        const raw = desc ? ((desc as any)[c.field] as string | null) : null;
        // "No" to the value-chain relevance question hides the text; it is
        // never deleted, and returns the moment "Yes" is chosen again.
        if (c.field === 'value_chain' && desc?.value_chain_applicable === false) return null;
        return isBlank(raw) || !htmlHasInk(raw) ? null : (raw as string);
      })
      .filter((h): h is string => h !== null);
    if (!htmls.length) continue;

    // Buffered, then trimmed: a participant whose mirrored text converts to
    // nothing but empty paragraphs must not print a badge over a blank region.
    const entry: string[] = [];
    htmls.forEach((html, i) => {
      if (i === 0) entry.push(...leadInBlocks(participantChip(p), html, ctx));
      else entry.push(...htmlToTypstBlocks(html, ctx));
    });
    const trimmed = dropBlankBlocks(entry);
    // The badge itself draws, so the FIRST block always counts as visible;
    // the entry is kept only when something beyond the badge line survives.
    if (!trimmed.length || (trimmed.length === 1 && !htmlHasInk(htmls[0]))) continue;
    if (emittedAny) out.push('v(3pt, weak: true)');
    emittedAny = true;
    out.push(...trimmed);
  }
  return out;
}

function cell(inner: string, align?: string): string {
  return `table.cell(${align ? `align: ${align}, ` : ''}par(justify: false, ${inner}))`;
}

function emitMatrix(data: B32TypstData, _ctx: ConvertContext): string[] {
  const m = data.matrix;
  if (!m.enabled || !m.rows.length || !m.cols.length) return [];
  const byId = new Map(data.participants.map((p) => [p.id, p]));

  // Participant headers are rotated a quarter turn, as on the board, so many
  // narrow tick columns fit inside the 18cm table width.
  const headerCells = [
    `table.cell(align: left + bottom, par(justify: false, strong(${lit('Expertise')})))`,
    ...m.cols.map((c) => {
      const inner =
        c.kind === 'participant'
          ? participantChip(byId.get(c.participantId || ''))
          : `strong(${lit(c.headerText || '')})`;
      return `table.cell(align: center + bottom, rotate(-90deg, reflow: true, ${inner}))`;
    }),
  ];
  const cells: string[] = [`table.header(${headerCells.join(', ')})`];
  for (const row of m.rows) {
    cells.push(cell(lit(row.label)));
    for (const col of m.cols) {
      // U+2713 has no glyph in the embedded Nimbus Roman faces, so the tick was
      // typeset as nothing. Draw it as a vector instead (`he-tick`).
      cells.push(cell(m.checked.has(`${row.id}|${col.id}`) ? 'he-tick' : lit(''), 'center'));
    }
  }
  // Mirror the editor's own column geometry EXACTLY (B32SectionContent.tsx).
  //
  // The stored row (`table_column_widths`, key `b32-expertise-matrix`) is only
  // honoured by the editor when its length equals the CURRENT column count —
  // a stale short row (SUSIE-Q: 10 stored widths, 12 columns) is ignored there
  // and the auto geometry is used instead. Extending a short row with its last
  // tick width, as this emitter used to do, therefore produced widths the board
  // never uses, which is the remaining divergence. Now: stored widths only on
  // an exact length match, else the editor's auto rule.
  const stored = data.matrixWidthsPx;
  const expected = 1 + m.cols.length;
  const ONE_CM_PX = 38;
  const ROTATED_COL_MIN_PX = 22;
  const CONTAINER_PX = 680; // 18cm block at 96dpi, the editor's measured width
  const widthsPx = (() => {
    if (stored.length === expected && stored.every((w) => Number.isFinite(w))) return stored;
    const maxChars = m.rows.reduce(
      (acc, r) => Math.max(acc, (r.label || '').length),
      'Expertise'.length,
    );
    const expertisePx = Math.min(420, Math.max(80, Math.ceil(maxChars * 6.5) + 16));
    const n = m.cols.length;
    const checkPx = Math.max(
      ROTATED_COL_MIN_PX,
      Math.min(ONE_CM_PX, n > 0 ? Math.floor((CONTAINER_PX - expertisePx) / n) : ONE_CM_PX),
    );
    return Array.from({ length: expected }, (_, i) => (i === 0 ? expertisePx : checkPx));
  })();
  const columns = ptTrack(pointWidths(widthsPx));


  const caption = data.captions.get('b32-expertise-matrix') || 'Expertise of participants';
  return [
    `he-caption(${typstString('Table 3.2.a.')}, ${lit(caption)})`,
    `he-authored-table(${columns}, (${cells.join(', ')},), ${m.rows.length + 1})`,
  ];
}

/** Emits one B3.2 mirror slot; `[]` when its source is empty or switched off. */
export function emitB32Slot(
  slotKey: string | null,
  data: B32TypstData,
  ctx: ConvertContext,
): string[] {
  switch (slotKey as B32SlotKey) {
    case 'interdisciplinarity':
      return emitMatrix(data, ctx);
    case 'capacity':
    case 'value-chain':
    case 'international':
      return emitParagraphSlot(slotKey as ParagraphSlotKey, data, ctx);
    default:
      ctx.unsupported.add(`B3.2 mirror slot ${slotKey || '—'}`);
      return [];
  }
}
