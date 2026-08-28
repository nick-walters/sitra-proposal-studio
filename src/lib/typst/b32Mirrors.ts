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
import { fetchB32InfraTableData, type B32InfraTableData } from './b32InfraData';
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
  captions: Map<string, string>;
}



function isBlank(html: string | null | undefined): boolean {
  if (!html) return true;
  return htmlToPlainText(String(html)).replace(/\u00a0/g, ' ').trim().length === 0;
}


/** Every query the B3.2 mirror NodeViews make, issued once for the export. */
export async function fetchB32TypstData(proposalId: string): Promise<B32TypstData> {
  const [propR, partsR, descR, capR, mRowsR, mColsR] = await Promise.all([
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
        return isBlank(raw) ? null : (raw as string);
      })
      .filter((h): h is string => h !== null);
    if (!htmls.length) continue;

    if (emittedAny) out.push('v(3pt, weak: true)');
    emittedAny = true;
    htmls.forEach((html, i) => {
      if (i === 0) out.push(...leadInBlocks(participantChip(p), html, ctx));
      else out.push(...htmlToTypstBlocks(html, ctx));
    });
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
    cell(`strong(${lit('Expertise')})`),
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
      cells.push(cell(m.checked.has(`${row.id}|${col.id}`) ? lit('\u2713') : lit(''), 'center'));
    }
  }
  const columns = `(${['4fr', ...m.cols.map(() => '1fr')].join(', ')},)`;
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
