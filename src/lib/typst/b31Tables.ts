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
import { htmlToTypstInline, typstString, type ConvertContext } from './htmlToTypst';
import { FIGURE_ASSET_PATH } from './typstFigures';
import type {
  B31TypstData,
  TypstCostBlock,
  TypstCostEntry,
  TypstParticipant,
  TypstWP,
} from './b31Data';

const lit = (s: string) => `t(${typstString(s)})`;
const EMPTY = lit('—');

function rich(html: string | null | undefined, ctx: ConvertContext): string {
  const text = htmlToPlainText(html || '').trim();
  if (!text) return EMPTY;
  return htmlToTypstInline(html || '', ctx);
}

function monthLabel(m: number | null | undefined): string {
  return m == null ? '—' : `M${String(m).padStart(2, '0')}`;
}

function wpChip(number: number, colour: string, label?: string): string {
  return `chip-pill(${typstString(label ?? `WP${number}`)}, rgb(${typstString(colour)}), filled: true)`;
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

function table(cols: string, header: string[], rows: string[][], aligns?: string[]): string {
  const headerSrc = `(${header.map((h) => h).join(', ')}${header.length === 1 ? ',' : ''})`;
  const rowsSrc = `(${rows.map((r) => `(${r.join(', ')},)`).join(', ')}${rows.length === 1 ? ',' : ''})`;
  const alignSrc = aligns ? `, aligns: (${aligns.join(', ')})` : '';
  return `he-table(${cols}, ${headerSrc}, ${rowsSrc}${alignSrc})`;
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
    caption(data, 'wp-list', 'Table 3.1.a.', 'List of work packages'),
    table('(1fr, auto, auto, auto)', [lit('Work package'), lit('WP leader'), lit('Person months'), lit('Duration')], rows),
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

    rows.push([
      participantChip(byId.get(wp.lead_participant_id || '')) + ` + t(" ") + ` + bold(lit(wpDuration(wp))),
    ]);
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
          ? ` + t(" ") + ` +
            bold(lit(`${monthLabel(task.start_month)}–${monthLabel(task.end_month)}`))
          : '';
      const head =
        taskChip(wp.number, task.number, wp.color) +
        ` + t(" ") + ` +
        bold(lit(task.title || '')) +
        ` + linebreak() + ` +
        participantChip(byId.get(task.lead_participant_id || '')) +
        (partners.length ? ` + t(" ") + ` + partners.join(' + t(" ") + ') : '') +
        months;
      rows.push([head]);
      if (htmlToPlainText(task.description || '').trim()) {
        rows.push([rich(task.description, ctx)]);
      }
    }

    const heading = wpChip(
      wp.number,
      wp.color,
      `WP${wp.number}: ${shortName}${shortName && title ? ' – ' : ''}${title}`,
    );
    out.push(table('(1fr,)', [heading], rows));
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
      '(auto, 1fr, auto, auto, auto, auto, auto)',
      [lit('No.'), lit('Deliverable title'), lit('WP'), lit('Lead'), lit('Type'), lit('Diss.'), lit('Due')],
      rows,
    ),
  ];
}

/* ───────────────────── Table 3.1.d — milestones ─────────────────────────── */

function wpChipList(numbers: number[], colours: string[], allCount: number): string {
  if (!numbers.length) return EMPTY;
  if (allCount > 0 && numbers.length === allCount) {
    return `chip-pill(${typstString('All WPs')}, black, filled: true)`;
  }
  return numbers.map((n, i) => wpChip(n, colours[i] || '#666666')).join(' + t(" ") + ');
}

export function emitMilestones(data: B31TypstData, ctx: ConvertContext): string[] {
  if (!data.milestones.length) return [];
  const rows = data.milestones.map((m) => [
    milestoneChip(m.number),
    rich(m.title, ctx),
    wpChipList(m.wpNumbers, m.wpColors, data.wps.length),
    lit(monthLabel(m.due_month)),
    rich(m.means_of_verification, ctx),
  ]);
  return [
    caption(data, 'milestones', 'Table 3.1.d.', 'List of milestones'),
    table(
      '(auto, 1fr, auto, auto, 1fr)',
      [lit('No.'), lit('Milestone'), lit('WP(s)'), lit('Due'), lit('Means of verification')],
      rows,
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
  return [
    caption(data, 'risks', 'Table 3.1.e.', 'Critical risks for implementation'),
    table(
      '(1fr, auto, auto, auto, 1fr)',
      [lit('Risk'), lit('i.'), lit('ii.'), lit('WP(s)'), lit('Mitigation & adaptation measures')],
      rows,
    ),
  ];
}

/* ───────────────────── Table 3.1.f — effort matrix ──────────────────────── */

const pm = (n: number) => (n === 0 ? '' : Number.isInteger(n) ? String(n) : n.toFixed(2));

export function emitEffortMatrix(data: B31TypstData): string[] {
  if (!data.wps.length || !data.participants.length) return [];
  const header = [
    lit(''),
    ...data.wps.map((wp) => wpChip(wp.number, wp.color)),
    lit('Total'),
  ];
  const rows = data.participants.map((p) => {
    let rowTotal = 0;
    const cells = data.wps.map((wp) => {
      const value = wp.effort
        .filter((e) => e.participant_id === p.id)
        .reduce((s, e) => s + e.person_months, 0);
      rowTotal += value;
      return lit(pm(value));
    });
    return [participantChip(p), ...cells, bold(lit(pm(rowTotal)))];
  });
  const colTotals = data.wps.map((wp) => wp.effort.reduce((s, e) => s + e.person_months, 0));
  rows.push([
    bold(lit('Total')),
    ...colTotals.map((v) => bold(lit(pm(v)))),
    bold(lit(pm(colTotals.reduce((s, v) => s + v, 0)))),
  ]);
  const cols = `(auto, ${data.wps.map(() => '1fr').join(', ')}, auto)`;
  return [
    caption(data, 'effort-matrix', 'Table 3.1.f.', 'Staff effort in person months'),
    table(cols, header, rows, ['left', ...data.wps.map(() => 'right'), 'right']),
  ];
}

/* ─────────────── Tables 3.1.g / h / i — cost justifications ─────────────── */

function costRows(
  entries: TypstCostEntry[],
  participants: TypstParticipant[],
  ctx: ConvertContext,
  categoryLabel?: string,
): { rows: string[][]; total: number } {
  const byId = new Map(participants.map((p) => [p.id, p]));
  const rows: string[][] = [];
  let total = 0;
  for (const entry of entries) {
    entry.items.forEach((item, index) => {
      rows.push([
        index === 0 ? participantChip(byId.get(entry.participantId)) : lit(''),
        lit(formatCurrency(item.amount)),
        (categoryLabel ? `${bold(emphLit(categoryLabel + ': '))} + ` : '') +
          rich(item.justification, ctx),
      ]);
    });
    rows.push([lit(''), bold(lit(formatCurrency(entry.totalCost))), `emph(${lit('Subtotal')})`]);
    total += entry.totalCost;
  }
  return { rows, total };
}

const emphLit = (s: string) => `emph(${lit(s)})`;

export function emitSubcontracting(
  data: B31TypstData,
  ctx: ConvertContext,
  label: string,
): string[] {
  if (!data.subcontracting.length) return [];
  const { rows, total } = costRows(data.subcontracting, data.participants, ctx);
  rows.push([bold(lit('Total')), bold(lit(formatCurrency(total))), lit('')]);
  return [
    caption(data, 'subcontracting', label, 'Subcontracting cost justifications'),
    table(
      '(auto, auto, 1fr)',
      [lit('Participant'), lit('Cost (€)'), lit('Justification')],
      rows,
      ['left', 'right', 'left'],
    ),
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
  const rows: string[][] = [];
  let total = 0;
  for (const block of blocks) {
    const built = costRows(block.participants, data.participants, ctx, block.categoryLabel);
    rows.push(...built.rows);
    total += built.total;
  }
  rows.push([bold(lit('Total')), bold(lit(formatCurrency(total))), lit('')]);
  return [
    caption(data, tableKey, label, defaultCaption),
    table(
      '(auto, auto, 1fr)',
      [lit('Participant'), lit('Cost (€)'), lit('Category & justification')],
      rows,
      ['left', 'right', 'left'],
    ),
  ];
}

/* ─────────────────────── B1.2 — linked activities ───────────────────────── */

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

  const out = [
    table(
      '(auto, 1fr, auto)',
      [
        lit('Project'),
        lit('How the project will be linked'),
        lit('Participant responsible for establishing the link'),
      ],
      rows,
    ),
  ];
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
  if (!available) {
    return [
      `not-converted(${typstString(
        `[${kind === 'pert' ? 'Pert' : 'Gantt'} chart — the chart was not on screen when this preview was built, so it could not be captured]`,
      )})`,
    ];
  }
  const label = `Figure ${meta.figure_number}.`;
  const captionText = meta.caption || meta.title || (kind === 'pert' ? 'Pert chart' : 'Gantt chart');
  return [
    `he-image(${typstString(FIGURE_ASSET_PATH[kind])}, 1.0)`,
    `he-figure-caption(${typstString(label)}, ${lit(captionText)})`,
  ];
}

/**
 * The per-section reference list (the tail "References" block).
 *
 * Only references cited by VISIBLE content are exported, numbered with the
 * document-wide display number so the numbers match the superscripts in the
 * body. References cited only in hidden blocks are on-screen aids and are
 * left out here, exactly as the browser-print path does.
 */
export function emitReferences(
  entries: Array<{ displayNumber: number | null; html: string }>,
  ctx: ConvertContext,
): string[] {
  const cited = entries.filter((e) => e.displayNumber != null);
  if (!cited.length) return [];
  return cited.map(
    (entry) =>
      `block(spacing: 3pt, super(t(${typstString(String(entry.displayNumber))})) + t(" ") + ${rich(
        entry.html,
        ctx,
      )})`,
  );
}
