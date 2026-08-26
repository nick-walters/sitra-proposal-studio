/**
 * Typst emitters for the B3.1 source-fed and relational blocks, plus the
 * B1.2 linked-activities table.
 *
 * Each emitter consumes the plain projection from `b31Data.ts` and produces a
 * `he-table(...)` / `he-image(...)` call from `typstPreamble.ts`. Rich-text
 * cells go through `htmlToTypstInline`, so chips inside a cell are redrawn as
 * vector shapes wrapped around real, selectable text exactly as they are in
 * body copy.
 */

import { formatCurrency } from '@/lib/formatNumber';
import { getInstrumentAbbreviation, getInstrumentFullName, formatDurationShort } from '@/lib/fundingInstruments';
import { htmlToPlainText } from '@/lib/htmlToPlainText';
import { captionLetter } from '@/lib/cards/captionSlots';
import { htmlToTypstInline, typstString, type ConvertContext } from './htmlToTypst';
import { FIGURE_ASSET_PATH } from './typstFigures';
import { emitPertChart } from './pertTypst';
import type {
  B31TypstData,
  TypstCostBlock,
  TypstCostEntry,
  TypstParticipant,
  TypstWP,
} from './b31Data';

const lit = (s: string) => `t(${typstString(s)})`;
const EMPTY = lit('—');
/**
 * The gap after a chip is a NON-BREAKING space, so it can never be pushed to
 * the head of the next line (which showed as a stray indent). Every emitter
 * that used to join a chip to what follows with a plain `t(" ")` uses this.
 */
const NBSP = '\u00a0';
const CHIP_GAP = ` + t(${typstString(NBSP)}) + `;
/** Chip-to-chip separator: a plain space, so a run of chips may still wrap. */
const CHIP_SEP = ` + t(" ") + `;

function rich(html: string | null | undefined, ctx: ConvertContext): string {
  const text = htmlToPlainText(html || '').trim();
  if (!text) return EMPTY;
  return htmlToTypstInline(html || '', ctx);
}

function monthLabel(m: number | null | undefined): string {
  return m == null ? '—' : `M${String(m).padStart(2, '0')}`;
}

function wpChip(number: number, colour: string, label?: string, star = false): string {
  const text = label ?? `WP${number}`;
  // Nimbus Roman has no U+2605 glyph. The primary variant therefore draws a
  // native vector star inside the pill while retaining selectable label text.
  return star
    ? `chip-pill-primary(${typstString(text)}, rgb(${typstString(colour)}))`
    : `chip-pill(${typstString(text)}, rgb(${typstString(colour)}), filled: true)`;
}

function participantChip(p: TypstParticipant | undefined): string {
  if (!p) return EMPTY;
  const name = p.organisation_short_name || p.organisation_name || '';
  const label = `${p.participant_number ?? ''}${p.participant_number != null ? '. ' : ''}${name}`;
  return `chip-pill(${typstString(label)}, black, filled: true)`;
}

function taskChip(wpNumber: number, taskNumber: number, colour: string): string {
  return `chip-pill(${typstString(`T${wpNumber}.${taskNumber}`)}, rgb(${typstString(colour)}))`;
}

function deliverableChip(wpNumber: number, number: number, colour: string): string {
  return `chip-deliverable(${typstString(`D${wpNumber}.${number}`)}, rgb(${typstString(colour)}))`;
}

function milestoneChip(number: number): string {
  return `chip-milestone(${typstString(`MS${number}`)})`;
}

function riskBadge(level: string | null | undefined): string {
  const value = (level || '').trim().toUpperCase();
  if (!value) return EMPTY;
  const colour = value === 'H' ? '#dc2626' : value === 'M' ? '#d97706' : '#16a34a';
  return `chip-pill(${typstString(value)}, rgb(${typstString(colour)}))`;
}

function caption(data: B31TypstData, key: string, label: string, fallback: string): string {
  const text = data.captions[key] || fallback;
  return `he-caption(${typstString(label)}, ${lit(text)})`;
}

function table(
  cols: string,
  header: string[],
  rows: string[][],
  aligns?: string[],
  firstFlush = false,
  tight = false,
): string {
  const headerSrc = `(${header.map((h) => h).join(', ')}${header.length === 1 ? ',' : ''})`;
  const rowsSrc = `(${rows.map((r) => `(${r.join(', ')},)`).join(', ')}${rows.length === 1 ? ',' : ''})`;
  const alignSrc = aligns ? `, aligns: (${aligns.join(', ')},)` : '';
  const flushSrc = firstFlush ? ', first-flush: true' : '';
  const tightSrc = tight ? ', tight: true' : '';
  return `he-table(${cols}, ${headerSrc}, ${rowsSrc}${alignSrc}${flushSrc}${tightSrc})`;
}

const bold = (s: string) => `strong(${s})`;

/* ───────────────────────── Table 3.1.a — WP list ────────────────────────── */

function wpDuration(wp: TypstWP): string {
  const months = wp.tasks.flatMap((t) => [t.start_month, t.end_month]).filter((m): m is number => m != null);
  if (wp.manual_duration) return wp.manual_duration;
  if (!months.length) return '—';
  return `M${String(Math.min(...months)).padStart(2, '0')}–M${String(Math.max(...months)).padStart(2, '0')}`;
}

const wpPm = (wp: TypstWP) => wp.effort.reduce((s, e) => s + e.person_months, 0);

export function emitWpList(data: B31TypstData): string[] {
  if (!data.wps.length) return [];
  const byId = new Map(data.participants.map((p) => [p.id, p]));
  const rows = data.wps.map((wp) => {
    const shortName = wp.short_name || '';
    const title = wp.title || '';
    const label = `WP${wp.number}: ${shortName}${shortName && title ? ' – ' : ''}${title}`;
    const pm = wpPm(wp);
    return [
      wpChip(wp.number, wp.color, label),
      participantChip(byId.get(wp.lead_participant_id || '')),
      lit(pm > 0 ? String(pm) : '—'),
      lit(wpDuration(wp)),
    ];
  });
  const totalPm = data.wps.reduce((s, wp) => s + wpPm(wp), 0);
  rows.push([bold(lit('Total')), lit(''), bold(lit(totalPm > 0 ? String(totalPm) : '—')), lit('')]);

  return [
    caption(data, 'wp-list', 'Table 3.1.a.', 'List of work packages (PM = person month)'),
    // The three metadata columns shrink to their content and the work-package
    // column takes ALL the remaining width (`1fr`), so a WP pill keeps one
    // line; with four `auto` columns the pill column was squeezed by the
    // others and the titles wrapped. First column flush (no left inset) and
    // tight padding, matching the board's own rendering of this table.
    table(
      storedCols(data, 'wp-list', 4, '(1fr, auto, auto, auto)'),

      [lit('Work package'), lit('WP leader'), lit('PMs'), lit('Duration')],
      rows,
      undefined,
      true,
      true,
    ),
  ];
}

/* ─────────────────── Table 3.1.b — WP description tables ────────────────── */

export function emitWpDescriptions(data: B31TypstData, ctx: ConvertContext): string[] {
  if (!data.wps.length) return [];
  const byId = new Map(data.participants.map((p) => [p.id, p]));
  const out: string[] = [
    caption(data, 'wp-descriptions', 'Table 3.1.b.', 'Work package descriptions'),
  ];

  for (const wp of data.wps) {
    const shortName = wp.short_name || '';
    const title = wp.title || '';
    const rows: string[][] = [];
    const sep = `wp-sep(rgb(${typstString(wp.color)}))`;

    rows.push([
      participantChip(byId.get(wp.lead_participant_id || '')) + CHIP_GAP + bold(lit(wpDuration(wp))),
    ]);
    rows.push([sep]);
    if (htmlToPlainText(wp.objectives || '').trim()) {
      rows.push([bold(lit('Objectives: ')) + ' + ' + rich(wp.objectives, ctx)]);
    }
    if (htmlToPlainText(wp.description_before_tasks || '').trim()) {
      rows.push([rich(wp.description_before_tasks, ctx)]);
    }
    for (const task of wp.tasks) {
      const partners = task.participantIds
        .filter((id) => id !== task.lead_participant_id)
        .map((id) => participantChip(byId.get(id)))
        .filter((c) => c !== EMPTY);
      const months =
        task.start_month != null || task.end_month != null
          ? CHIP_GAP +
            bold(lit(`${monthLabel(task.start_month)}–${monthLabel(task.end_month)}`))
          : '';
      const head =
        taskChip(wp.number, task.number, wp.color) +
        CHIP_GAP +
        bold(lit(task.title || '')) +
        ` + linebreak() + ` +
        participantChip(byId.get(task.lead_participant_id || '')) +
        (partners.length ? CHIP_SEP + partners.join(CHIP_SEP) : '') +
        months;
      rows.push([sep]);
      rows.push([head]);
      if (htmlToPlainText(task.description || '').trim()) {
        rows.push([rich(task.description, ctx)]);
      }
    }
    // The board closes every work package with a trailing rule.
    rows.push([sep]);

    const heading = wpChip(
      wp.number,
      wp.color,
      `WP${wp.number}: ${shortName}${shortName && title ? ' – ' : ''}${title}`,
    );
    const rowsSrc = `(${rows.map((r) => `(${r.join(', ')},)`).join(', ')}${rows.length === 1 ? ',' : ''})`;
    out.push(`he-wp-table(${heading}, ${rowsSrc}, rgb(${typstString(wp.color)}))`);
  }

  return out;
}


/* ───────────────────── Table 3.1.c — deliverables ───────────────────────── */

export function emitDeliverables(data: B31TypstData, ctx: ConvertContext): string[] {
  if (!data.deliverables.length) return [];
  const byId = new Map(data.participants.map((p) => [p.id, p]));
  // Export order is always by due date, as in the mirror's export mode.
  const ordered = data.deliverables
    .slice()
    .sort(
      (a, b) =>
        (a.due_month ?? 9999) - (b.due_month ?? 9999) ||
        a.wpNumber - b.wpNumber ||
        a.number - b.number,
    );
  const rows = ordered.map((d) => [
    deliverableChip(d.wpNumber, d.number, d.wpColor),
    rich(d.title, ctx),
    wpChip(d.wpNumber, d.wpColor),
    participantChip(byId.get(d.responsible_participant_id || '')),
    lit(d.type || '—'),
    lit(d.dissemination_level || '—'),
    lit(monthLabel(d.due_month)),
  ]);
  return [
    caption(data, 'deliverables', 'Table 3.1.c.', 'List of deliverables'),
    table(
      storedCols(
        data,
        'b31-3-1-c-deliverables',
        7,
        '(auto, 1fr, auto, auto, auto, auto, auto)',
      ),

      [lit('No.'), lit('Deliverable title'), lit('WP'), lit('Lead'), lit('Type'), lit('Diss.'), lit('Due')],
      rows,
    ),
  ];
}

/* ───────────────────── Table 3.1.d — milestones ─────────────────────────── */

function wpChipList(
  numbers: number[],
  colours: string[],
  allCount: number,
  primaryNumber?: number | null,
): string {
  if (!numbers.length) return EMPTY;
  if (allCount > 0 && numbers.length === allCount) {
    const allWps = `chip-pill(${typstString('All WPs')}, black, filled: true)`;
    // Match the editor: its collapsed “All WPs” bubble is followed by the
    // starred primary WP, otherwise the caption describes an invisible mark.
    if (primaryNumber != null) {
      const primaryIndex = numbers.indexOf(primaryNumber);
      const primaryColour = primaryIndex >= 0 ? colours[primaryIndex] : undefined;
      return `${allWps}${CHIP_SEP}${wpChip(primaryNumber, primaryColour || '#666666', undefined, true)}`;
    }
    return allWps;
  }
  const chips = numbers
    .map((n, i) => wpChip(n, colours[i] || '#666666', undefined, n === primaryNumber))
    .join(CHIP_SEP);
  // A narrow WP column wraps the chips over several lines; the default 0pt
  // leading would let their outsets touch, so this paragraph opens the pitch.
  return `par(leading: 4pt, spacing: 0pt, ${chips})`;
}


/**
 * Column widths are taken from the EDITOR's own stored state
 * (`table_column_widths`), so a preview reproduces the table the author sees
 * rather than a second, hardcoded layout. Stored pixel widths become `fr`
 * ratios, which Typst then fits to the 18 cm column.
 *
 * Several tables exist in two places (the B3.1 board and the older manager
 * screen) under different keys, so `keys` is tried in order and the first
 * stored row of the right shape wins. `fallback` is the EDITOR's own default
 * proportions, used while a table has never been resized.
 */
function storedCols(
  data: B31TypstData,
  keys: string | string[],
  count: number,
  fallback: string,
): string {
  for (const key of Array.isArray(keys) ? keys : [keys]) {
    const widths = data.columnWidths[key];
    if (widths && widths.length === count && widths.every((w) => w > 0)) {
      const min = Math.min(...widths);
      return `(${widths.map((w) => `${(w / min).toFixed(3)}fr`).join(', ')})`;
    }
  }
  return fallback;
}


function storedHeaders(data: B31TypstData, key: string, defaults: string[]): string[] {
  const stored = data.columnHeaders[key] || {};
  return defaults.map((fallback, index) => {
    const value = stored[String(index)];
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
  });
}

/** Mirrors the editor's caption, which is template-owned and uneditable. */
export const MILESTONES_CAPTION =
  'List of milestones (★ indicates the primary WP & position in the Gantt chart)';
export const RISKS_CAPTION = 'Critical risks for implementation (i. likelihood; ii. severity)';

/** Replace the unsupported U+2605 with the same native vector used in chips. */
function captionWithVectorStar(text: string): string {
  const parts = text.split('★');
  return parts.map((part) => lit(part)).join(' + chip-star(black) + ');
}

export function emitMilestones(data: B31TypstData, ctx: ConvertContext): string[] {
  if (!data.milestones.length) return [];
  // Same four columns as the editor: badge inline at the head of the
  // milestone column, then verification, WP(s) and due month.
  const rows = data.milestones.map((m) => [
    milestoneChip(m.number) + CHIP_GAP + rich(m.title, ctx),
    rich(m.means_of_verification, ctx),
    wpChipList(m.wpNumbers, m.wpColors, data.wps.length, m.primaryWpNumber),
    lit(monthLabel(m.due_month)),
  ]);
  const headers = storedHeaders(data, 'b31-milestones', [
    'Milestone',
    'Means of verification',
    'WP(s)',
    'Due month',
  ]);
  const milestoneCaption = data.captions.milestones || MILESTONES_CAPTION;
  return [
    `he-caption(${typstString('Table 3.1.d.')}, ${captionWithVectorStar(milestoneCaption)})`,
    table(
      storedCols(data, ['b31-3-1-d-milestones', 'b31-milestones-v2'], 4, '(32fr, 34fr, 22fr, 12fr)'),
      headers.map((h) => lit(h)),
      rows,
      undefined,
      true,
    ),
  ];

}


/* ─────────────────────── Table 3.1.e — critical risks ───────────────────── */

export function emitRisks(data: B31TypstData, ctx: ConvertContext): string[] {
  if (!data.risks.length) return [];
  const rows = data.risks.map((r) => [
    rich(r.title, ctx),
    riskBadge(r.likelihood),
    riskBadge(r.severity),
    wpChipList(r.wpNumbers, r.wpColors, data.wps.length),
    rich(r.mitigation, ctx),
  ]);
  const headers = storedHeaders(data, 'b31-risks', [
    'Risk description',
    'i.',
    'ii.',
    'WP(s)',
    'Mitigation & adaptation measures',
  ]);
  return [
    caption(data, 'risks', 'Table 3.1.e.', RISKS_CAPTION),
    table(
      storedCols(data, ['b31-3-1-e-risks', 'b31-risks'], 5, '(28fr, 7fr, 7fr, 22fr, 36fr)'),
      headers.map((h) => lit(h)),
      rows,
      undefined,
      true,
    ),
  ];
}


/* ───────────────────── Table 3.1.f — effort matrix ──────────────────────── */

/** The board prints a bare 0, and one decimal only when there is one. */
const pm = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** A cell painted in the WP colour with white text, as the board draws it. */
function wpCell(colour: string, body: string, pos: 'top' | 'mid' | 'bottom'): string {
  return `effort-cell(rgb(${typstString(colour)}), ${body}, ${typstString(pos)})`;
}

/** An unfilled cell — the participant column and the Total column. */
function plainCell(body: string, al: 'left' | 'center' = 'center'): string {
  return `effort-plain(${body}, ${al})`;
}

/**
 * On screen this is not a ruled table at all: it is a band of WP-coloured
 * cells with white figures, rounded at the top of the header row and the
 * bottom of the totals row, separated by a 5pt gutter, with a participant
 * badge down the left and a plain bold Total column. `he-grid` reproduces
 * exactly that instead of forcing it through the ruled table furniture.
 */
export function emitEffortMatrix(data: B31TypstData): string[] {
  if (!data.wps.length || !data.participants.length) return [];
  const cells: string[] = [
    plainCell(lit(''), 'left'),
    ...data.wps.map((wp) => wpCell(wp.color, bold(lit(`WP${wp.number}`)), 'top')),
    plainCell(bold(lit('Total'))),
  ];

  for (const p of data.participants) {
    let rowTotal = 0;
    const rowCells = data.wps.map((wp) => {
      const value = wp.effort
        .filter((e) => e.participant_id === p.id)
        .reduce((s, e) => s + e.person_months, 0);
      rowTotal += value;
      return wpCell(wp.color, lit(pm(value)), 'mid');
    });
    cells.push(plainCell(participantChip(p), 'left'), ...rowCells, plainCell(bold(lit(pm(rowTotal)))));
  }

  const colTotals = data.wps.map((wp) => wp.effort.reduce((s, e) => s + e.person_months, 0));
  cells.push(
    plainCell(bold(lit('Total')), 'left'),
    ...data.wps.map((wp, i) => wpCell(wp.color, bold(lit(pm(colTotals[i]))), 'bottom')),
    plainCell(bold(lit(pm(colTotals.reduce((s, v) => s + v, 0))))),
  );

  // Explicit widths, not `1fr`: a cell whose content is a `block(width: 100%)`
  // measures as zero inside a fractional column, so the coloured bands would
  // vanish entirely. 18cm = 510.24pt, less the 5pt gutters between every pair.
  // Where the author has resized the matrix in the editor (`effort-matrix`),
  // those pixel widths are scaled proportionally onto the same 18 cm; where
  // they have not, the editor's own default of a 72pt name column, a 40pt
  // total column and equal work-package columns applies.
  const n = data.wps.length;
  const gutters = (n + 1) * 5;
  const usable = 510.24 - gutters;
  const stored = data.columnWidths['effort-matrix'];
  let widthsPt: number[];
  if (stored && stored.length === n + 2 && stored.every((w) => w > 0)) {
    const sum = stored.reduce((s, w) => s + w, 0);
    widthsPt = stored.map((w) => (w / sum) * usable);
  } else {
    const wpWidth = Math.max(18, (usable - 72 - 40) / n);
    widthsPt = [72, ...data.wps.map(() => wpWidth), 40];
  }
  const cols = `(${widthsPt.map((w) => `${w.toFixed(2)}pt`).join(', ')})`;


  return [
    caption(data, 'effort-matrix', 'Table 3.1.f.', 'Staff effort in person months'),
    `he-grid(${cols}, (${cells.join(', ')},))`,
  ];
}

/* ─────────────── Tables 3.1.g / h / i — cost justifications ─────────────── */

const emphLit = (s: string) => `emph(${lit(s)})`;

/** One category's costs for one participant. */
interface ParticipantCosts {
  participant: TypstParticipant | undefined;
  participantNumber: number;
  /** Category label (3.1.h) or undefined (3.1.g), with its line items. */
  groups: Array<{ categoryLabel?: string; items: TypstCostEntry['items'] }>;
  total: number;
}

/**
 * Groups every cost line by PARTICIPANT (across categories, for 3.1.h) and
 * orders the participants by participant NUMBER — not by amount. The left-hand
 * column is then a single `rowspan` cell carrying one badge, however many
 * lines and categories that participant has.
 */
function groupCosts(
  blocks: Array<{ categoryLabel?: string; participants: TypstCostEntry[] }>,
  participants: TypstParticipant[],
): ParticipantCosts[] {
  const byId = new Map(participants.map((p) => [p.id, p]));
  const map = new Map<string, ParticipantCosts>();
  for (const block of blocks) {
    for (const entry of block.participants) {
      let bucket = map.get(entry.participantId);
      if (!bucket) {
        const participant = byId.get(entry.participantId);
        bucket = {
          participant,
          participantNumber: participant?.participant_number ?? Number.MAX_SAFE_INTEGER,
          groups: [],
          total: 0,
        };
        map.set(entry.participantId, bucket);
      }
      bucket.groups.push({ categoryLabel: block.categoryLabel, items: entry.items });
      bucket.total += entry.totalCost;
    }
  }
  return [...map.values()].sort((a, b) => a.participantNumber - b.participantNumber);
}

/** Flattened cells for a grouped cost table, plus the grid row count. */
function costCells(
  grouped: ParticipantCosts[],
  ctx: ConvertContext,
  header: string[],
): { cells: string[]; nrows: number; total: number } {
  const cells: string[] = header.map((h) => `table.cell(text(weight: "bold", ${h}))`);
  let nrows = 1;
  let total = 0;

  for (const bucket of grouped) {
    const lines = bucket.groups.flatMap((g) =>
      g.items.map((item) => ({ item, categoryLabel: g.categoryLabel })),
    );
    // Every line plus the participant's own subtotal row.
    const span = lines.length + 1;
    // The merged participant cell is TOP aligned: `he-cell-table` centres
    // cells on the horizon, which over a tall rowspan floated the badge into
    // the middle of the participant's block instead of sitting on its first
    // line, as it does in the editor.
    cells.push(
      `table.cell(rowspan: ${span}, align: left + top, ${participantChip(bucket.participant)})`,
    );
    for (const line of lines) {
      cells.push(
        lit(formatCurrency(line.item.amount)),
        (line.categoryLabel ? `${bold(emphLit(line.categoryLabel + ': '))} + ` : '') +
          rich(line.item.justification, ctx),
      );
    }
    cells.push(bold(lit(formatCurrency(bucket.total))), `emph(${lit('Subtotal')})`);
    nrows += span;
    total += bucket.total;
  }

  cells.push(bold(lit('Total')), bold(lit(formatCurrency(total))), lit(''));
  nrows += 1;
  return { cells, nrows, total };
}

export function emitSubcontracting(
  data: B31TypstData,
  ctx: ConvertContext,
  label: string,
): string[] {
  if (!data.subcontracting.length) return [];
  const grouped = groupCosts([{ participants: data.subcontracting }], data.participants);
  const { cells, nrows } = costCells(grouped, ctx, [
    lit('Participant'),
    lit('Cost (€)'),
    lit('Justification'),
  ]);
  return [
    caption(data, 'subcontracting', label, 'Subcontracting cost justifications'),
    `he-cell-table(${storedCols(data, 'subcontracting', 3, '(auto, auto, 1fr)')}, (${cells.join(', ')},), ${nrows}, aligns: (left, right, left))`,

  ];
}

export function emitMergedJustification(
  data: B31TypstData,
  ctx: ConvertContext,
  blocks: TypstCostBlock[],
  tableKey: string,
  label: string,
  defaultCaption: string,
): string[] {
  if (!blocks.length) return [];
  const grouped = groupCosts(blocks, data.participants);
  const { cells, nrows } = costCells(grouped, ctx, [
    lit('Participant'),
    lit('Cost (€)'),
    lit('Category & justification'),
  ]);
  return [
    caption(data, tableKey, label, defaultCaption),
    // `tableKey` is the same key the editor's own resizable table stores under
    // (`purchase-costs`, `equipment`, `other-direct-costs`, …).
    `he-cell-table(${storedCols(data, tableKey, 3, '(auto, auto, 1fr)')}, (${cells.join(', ')},), ${nrows}, aligns: (left, right, left))`,

  ];
}


/* ─────────────────────── B1.2 — linked activities ───────────────────────── */

/** Mirrors `DEFAULT_CAPTION` in `LinkedActivitiesTable.tsx`. */
const LINKED_ACTIVITIES_CAPTION =
  'How relevant research & innovation activities will be linked & whom will establish the link';

export function emitLinkedActivities(data: B31TypstData, ctx: ConvertContext): string[] {
  if (!data.linkedActivities.length) return [];
  const byId = new Map(data.participants.map((p) => [p.id, p]));
  const rows = data.linkedActivities.map((a) => {
    const abbrev = getInstrumentAbbreviation(a.instrument_code, a.instrument_custom);
    const duration = formatDurationShort(a.duration_start, a.duration_end);
    const project = [htmlToPlainText(a.acronym || '').trim(), abbrev, duration]
      .filter(Boolean)
      .join(', ');
    return [
      lit(project || '—'),
      rich(a.link_description_html, ctx),
      participantChip(byId.get(a.responsible_participant_id || '')),
    ];
  });

  const legendEntries = Array.from(
    new Map(
      data.linkedActivities
        .map((a) => [
          getInstrumentAbbreviation(a.instrument_code, a.instrument_custom),
          getInstrumentFullName(a.instrument_code, a.instrument_custom),
        ])
        .filter(([abbrev, full]) => abbrev && full) as [string, string][],
    ),
  )
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([abbrev, full]) => `${abbrev} = ${full}`);

  // The preview follows the editor: stored drag widths become fr ratios, and
  // any header the user retyped replaces the template default.
  const DEFAULT_HEADERS = ['Project', 'How the project will be linked', 'By whom'];
  const stored = data.columnHeaders['b12-linked-activities'] || {};
  const headers = DEFAULT_HEADERS.map((fallback, index) => {
    const value = stored[String(index)];
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
  });
  const cols = storedCols(
    data,
    ['b12-linked-activities', 'b12.linked_activities'],
    3,
    '(37fr, 43fr, 20fr)',
  );


  // The caption is code-side (the block board renders it from a default with a
  // position-derived label), so `table_captions` usually holds NO row for this
  // table. Emitting only on a stored override therefore dropped it entirely:
  // fall back to the same default the editor shows, and take the letter from
  // the running caption counter so editor and preview agree.
  const out: string[] = [];
  const numbering = ctx.captionNumbering;
  if (numbering) {
    const label = `Table ${numbering.sectionNumber.replace(/^[A-Za-z]+/, '')}.${captionLetter(
      numbering.tableIndex++,
    )}.`;
    out.push(caption(data, 'b12.linked_activities', label, LINKED_ACTIVITIES_CAPTION));
  } else {
    // This relational B1.2 emitter must never lose its code-side caption merely
    // because section metadata was unavailable while a standalone preview was
    // assembled. B1.2 has one generated linked-activities table.
    out.push(caption(data, 'b12.linked_activities', 'Table 1.2.a.', LINKED_ACTIVITIES_CAPTION));
  }
  out.push(
    table(
      cols,
      headers.map((h) => lit(h)),
      rows,
      undefined,
      true,
    ),
  );
  if (legendEntries.length) {
    out.push(
      `block(width: he-table-width, above: 0pt, below: 6pt, text(size: 9pt, style: "italic", ${lit(
        legendEntries.join('; '),
      )}))`,
    );
  }
  return out;
}

/* ───────────────────────── Pert and Gantt figures ───────────────────────── */

export function emitFigure(
  data: B31TypstData,
  kind: 'pert' | 'gantt',
  available: boolean,
): string[] {
  const meta = kind === 'pert' ? data.pertFigure : data.ganttFigure;
  if (!meta) return [];
  // The Pert is drawn natively from its own data, so it never depends on a
  // DOM capture. The Gantt is still rasterised (see typstFigures.ts).
  const native = kind === 'pert' && data.pertChart ? emitPertChart(data.pertChart) : '';
  if (!native && !available) {
    return [
      `not-converted(${typstString(
        `[${kind === 'pert' ? 'Pert' : 'Gantt'} chart — the chart was not on screen when this preview was built, so it could not be captured]`,
      )})`,
    ];
  }
  const label = `Figure ${meta.figure_number}.`;
  const captionText = meta.caption || meta.title || (kind === 'pert' ? 'Pert chart' : 'Gantt chart');
  return [
    native || `he-image(${typstString(FIGURE_ASSET_PATH[kind])}, 1.0)`,
    `he-figure-caption(${typstString(label)}, ${lit(captionText)})`,
  ];
}
