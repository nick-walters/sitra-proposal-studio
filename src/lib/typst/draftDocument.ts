/**
 * PER-DRAFT Typst documents: one work package, or one case ("pilot").
 *
 * A draft preview is a FRAGMENT, not a document. It carries no banner, no
 * participant list and no front matter — only the content the author is
 * writing, laid out exactly as Part B will print it.
 *
 * DIVERGENCE IS THE RISK, so nothing here emits content of its own: a WP draft
 * reuses `emitWpDescriptions` / `emitDeliverables` from `b31Tables.ts` (the
 * very functions B3.1's mirror calls) against a copy of the B3.1 projection
 * narrowed to one work package, and a case draft reuses `emitCasesTable` from
 * `casesData.ts` against a copy narrowed to one case. Hidden subsections,
 * chip rendering, tracked-change resolution (pending changes render as
 * REJECTED — insertions absent, deletions present, which is what
 * `htmlToTypst` does everywhere) therefore behave identically to Part B by
 * construction.
 */

import type { RefSnapshot } from '@/lib/referenceData';
import type { ConvertContext } from './htmlToTypst';
import { buildTypstPreamble, type TypstDocMeta } from './typstPreamble';
import type { TypstAsset } from './typstCompiler';

export interface DraftBuildResult {
  source: string;
  assets: TypstAsset[];
  unsupported: string[];
  /** Footer label and download stem fragment, e.g. "WP3" or "Finnish Pilot". */
  label: string;
}

interface DraftBuildOptions {
  proposalId: string;
  refData?: RefSnapshot;
}

/**
 * Captions belong to the numbered Part B tables ("Table 3.1.b."). A fragment
 * has no table sequence of its own, so the emitters' leading caption call is
 * dropped rather than printed with a number that means nothing here.
 */
function withoutCaptions(blocks: string[]): string[] {
  return blocks.filter((b) => !b.trimStart().startsWith('he-caption('));
}

/** Wraps emitted expressions as Typst code blocks, exactly as sections do. */
function toBody(blocks: string[]): string {
  return blocks.map((expr) => `#{\n${expr}\n}`).join('\n\n');
}

/**
 * Footer meta for a fragment: the acronym chip and page numbering are kept —
 * a printed WP draft is circulated and page numbers make it citable in a
 * review — but the running HEADER (the topic identifier) is dropped, because
 * that line asserts the page belongs to the submitted proposal.
 */
async function draftMeta(
  proposalId: string,
  label: string,
  refData?: RefSnapshot,
): Promise<TypstDocMeta> {
  const { fetchTypstDocMeta } = await import('./sectionToTypst');
  const meta = await fetchTypstDocMeta(proposalId, undefined, refData?.acronymSegments);
  return {
    acronym: meta.acronym,
    acronymSegments: meta.acronymSegments,
    partLabel: label,
    banner: null,
    headings: null,
    runningHeader: '',
  };
}

/** One work package, as B3.1's mirror renders it. */
export async function buildWpDraftTypstDocument(
  options: DraftBuildOptions & { wpId: string },
): Promise<DraftBuildResult> {
  const [{ fetchB31TypstData }, { emitWpDescriptions, emitDeliverables }] = await Promise.all([
    import('./b31Data'),
    import('./b31Tables'),
  ]);

  const data = await fetchB31TypstData(options.proposalId);
  const wp = data.wps.find((w) => w.id === options.wpId);
  if (!wp) throw new Error('That work package could not be found.');

  const scoped = {
    ...data,
    wps: [wp],
    deliverables: data.deliverables.filter((d) => d.wpNumber === wp.number),
  };

  const ctx: ConvertContext = { data: options.refData, unsupported: new Set<string>() };
  const blocks = [
    ...withoutCaptions(emitWpDescriptions(scoped, ctx)),
    ...withoutCaptions(emitDeliverables(scoped, ctx)),
  ];

  const label = `WP${wp.number}`;
  const meta = await draftMeta(options.proposalId, label, options.refData);
  return {
    source: `${buildTypstPreamble(meta)}\n${toBody(blocks)}\n`,
    assets: [],
    unsupported: Array.from(ctx.unsupported).sort(),
    label,
  };
}

/** One case, as B1.2's pilots table renders it. */
export async function buildCaseDraftTypstDocument(
  options: DraftBuildOptions & { caseId: string },
): Promise<DraftBuildResult> {
  const { fetchCasesTypstData, emitCasesTable } = await import('./casesData');

  const data = await fetchCasesTypstData(options.proposalId);
  const all = data.byType.get('');
  const one = all?.cases.find((c) => c.id === options.caseId);
  if (!all || !one) throw new Error('That case could not be found.');

  const scoped = {
    byType: new Map([['', { ...all, cases: [one] }]]),
  } as typeof data;

  const ctx: ConvertContext = { data: options.refData, unsupported: new Set<string>() };
  // `null` caption: a fragment prints no "Table 1.2.a." label.
  const blocks = emitCasesTable(scoped, '', null, ctx);

  const label = one.chipLabel || one.title || 'Case';
  const meta = await draftMeta(options.proposalId, label, options.refData);
  return {
    source: `${buildTypstPreamble(meta)}\n${toBody(blocks)}\n`,
    assets: [],
    unsupported: Array.from(ctx.unsupported).sort(),
    label,
  };
}

/** "2026-08-28 19.42 SUSIE-Q WP3" — the Part B stem, with the draft's label. */
export function draftFileStem(acronym: string, label: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}.${pad(now.getMinutes())}`;
  const clean = (s: string) => s.trim().replace(/[\\/:*?"<>|]/g, '-');
  return `${stamp} ${clean(acronym || 'Proposal')} ${clean(label)}`.trim();
}
