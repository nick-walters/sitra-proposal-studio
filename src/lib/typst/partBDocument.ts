/**
 * The FULL Part B document: six sections, one compile, one PDF.
 *
 * Everything a section needs already exists (`sectionToTypst.ts`); what this
 * module adds is the ASSEMBLY — a single preamble, the sections in template
 * order, a `<part-marker>` at each section start so the running footer names
 * the section the page belongs to, and continuous page numbering (Typst's page
 * counter is never reset, so "Page X of Y" spans the whole document).
 *
 * SELECTION. The export dialog can exclude whole sections, blocks or modules.
 * Exclusion happens on the BLOCK TREE, before anything is emitted, so citation
 * footnotes and table/figure lettering renumber exactly as though the excluded
 * content were hidden on the board — the numbering counters only ever see what
 * survives the filter.
 */

import { supabase } from '@/integrations/supabase/client';
import type { RefSnapshot } from '@/lib/referenceData';
import type { CardField, ProposalCard } from '@/types/cards';
import { htmlToPlainText } from '@/lib/htmlToPlainText';
import { buildTypstPreamble, type TypstDocMeta } from './typstPreamble';
import type { TypstAsset } from './typstCompiler';
import type { SectionBlockTree } from './sectionToTypst';
import { typstString } from './htmlToTypst';

/** The six Part B subsections, in document order. */
export const PART_B_SECTION_NUMBERS = ['B1.1', 'B1.2', 'B2.1', 'B2.2', 'B3.1', 'B3.2'] as const;

export interface PartBSection {
  id: string;
  /** Template number as stored, e.g. "B1.1". */
  number: string;
  title: string;
}

/** The proposal's Part B subsections, ordered B1.1 → B3.2. */
export async function fetchPartBSections(proposalId: string): Promise<PartBSection[]> {
  const bare = PART_B_SECTION_NUMBERS.map((n) => n.replace(/^B/, ''));
  const { data, error } = await supabase
    .from('proposal_template_sections')
    .select('id, section_number, title, proposal_templates!inner(proposal_id)')
    .eq('proposal_templates.proposal_id', proposalId)
    .in('section_number', [...PART_B_SECTION_NUMBERS, ...bare]);
  if (error) throw error;
  const rank = (n: string) => {
    const key = `B${n.replace(/^B/i, '')}`.toUpperCase();
    const i = (PART_B_SECTION_NUMBERS as readonly string[]).indexOf(key);
    return i === -1 ? 99 : i;
  };
  return (data || [])
    .map((row) => ({
      id: String((row as { id: string }).id),
      number: `B${String((row as { section_number: string }).section_number || '').replace(/^B/i, '')}`,
      title: String((row as { title: string | null }).title || ''),
    }))
    .sort((a, b) => rank(a.number) - rank(b.number));
}

/**
 * What the export leaves OUT. Exclusions rather than inclusions, so a block or
 * module added after the last export is included by default.
 */
export interface PartBExportSelection {
  sections: string[];
  blocks: string[];
  modules: string[];
}

export const EMPTY_SELECTION: PartBExportSelection = { sections: [], blocks: [], modules: [] };

/**
 * The remembered selection lives in `localStorage`, per proposal and per user
 * (`partb-export-selection:<proposalId>:<userId>`): it is a personal UI
 * preference about one export, not proposal content, so it is deliberately not
 * a database row — one user's choices never change what another user sees.
 */
export function selectionStorageKey(proposalId: string, userId: string | null | undefined): string {
  return `partb-export-selection:${proposalId}:${userId || 'anon'}`;
}

export function loadSelection(
  proposalId: string,
  userId: string | null | undefined,
): PartBExportSelection {
  try {
    const raw = localStorage.getItem(selectionStorageKey(proposalId, userId));
    if (!raw) return EMPTY_SELECTION;
    const parsed = JSON.parse(raw) as Partial<PartBExportSelection>;
    return {
      sections: Array.isArray(parsed.sections) ? parsed.sections.map(String) : [],
      blocks: Array.isArray(parsed.blocks) ? parsed.blocks.map(String) : [],
      modules: Array.isArray(parsed.modules) ? parsed.modules.map(String) : [],
    };
  } catch {
    return EMPTY_SELECTION;
  }
}

export function saveSelection(
  proposalId: string,
  userId: string | null | undefined,
  selection: PartBExportSelection,
): void {
  try {
    localStorage.setItem(selectionStorageKey(proposalId, userId), JSON.stringify(selection));
  } catch {
    /* storage disabled — the export still runs, it just is not remembered */
  }
}

/** Drops excluded blocks and modules from a fetched tree. */
export function filterTree(
  tree: SectionBlockTree,
  selection: PartBExportSelection,
): SectionBlockTree {
  const blocked = new Set(selection.blocks);
  const hiddenModules = new Set(selection.modules);
  const cards = tree.cards.filter((c: ProposalCard) => !blocked.has(c.id));
  const fieldsByCard: Record<string, CardField[]> = {};
  for (const card of cards) {
    fieldsByCard[card.id] = (tree.fieldsByCard[card.id] || []).filter(
      (f: CardField) => !hiddenModules.has(f.id),
    );
  }
  return { cards, fieldsByCard };
}

/** Plain-text label for a block or module in the selection tree. */
export function labelOf(html: string | null | undefined, fallback: string): string {
  const text = htmlToPlainText(html ?? '').trim();
  return text || fallback;
}

export interface PartBBuildResult {
  source: string;
  assets: TypstAsset[];
  unsupported: string[];
  blockCount: number;
  /** Sections actually emitted (after the selection filter). */
  sectionCount: number;
  /** Per-section source, so callers can derive per-section text. */
  sectionSources: { id: string; label: string; source: string }[];
}

export interface PartBBuildOptions {
  proposalId: string;
  sections: PartBSection[];
  refData?: RefSnapshot;
  selection?: PartBExportSelection;
  watermark?: boolean;
  /** Gantt bitmap captured from a live chart, when one is on the page. */
  figureAssets?: TypstAsset[];
}

/**
 * Compiles nothing — returns the Typst source and every asset it references.
 * The caller hands both to `compileTypstToPdf`.
 */
export async function buildPartBTypstDocument(
  options: PartBBuildOptions,
): Promise<PartBBuildResult> {
  const { proposalId, refData } = options;
  const selection = options.selection ?? EMPTY_SELECTION;
  const excludedSections = new Set(selection.sections);
  const sections = options.sections.filter((s) => !excludedSections.has(s.id));

  const { fetchSharedRenderData, renderSectionBody } = await import('./sectionRender');

  // Proposal-wide inputs, fetched (and the charts captured) exactly as a
  // single-section preview fetches them. The caller may hand in figure assets
  // it captured itself; those take precedence over a fresh capture.
  const shared = await fetchSharedRenderData(proposalId);
  if (options.figureAssets?.length) {
    shared.figureAssets = options.figureAssets;
    shared.figuresAvailable = {
      pert: options.figureAssets.some((a) => a.path.includes('pert')),
      gantt: options.figureAssets.some((a) => a.path.includes('gantt')),
    };
  }

  const assets: TypstAsset[] = [...shared.figureAssets];
  const unsupported = new Set<string>();
  const bodies: string[] = [];
  let blockCount = 0;
  const sectionSources: { id: string; label: string; source: string }[] = [];
  let documentMeta: TypstDocMeta | null = null;

  for (const section of sections) {
    const label = `${section.number} ${section.title}`.trim();
    const built = await renderSectionBody({
      proposalId,
      sectionId: section.id,
      sectionLabel: label,
      refData,
      shared,
      filterTree: (tree) => filterTree(tree, selection),
    });
    assets.push(...built.assets);

    // The preamble is written once, from the FIRST section's meta: it holds
    // the acronym chip, the running header and the footer's default label.
    if (!documentMeta) documentMeta = { ...built.meta, watermark: options.watermark };

    for (const item of built.unsupported) unsupported.add(item);
    blockCount += built.blockCount;

    // Every section starts a fresh page and tags itself for the footer.
    const marker = `#metadata(${typstString(built.meta.partLabel || section.number)}) <part-marker>`;
    const lead = bodies.length ? '#pagebreak(weak: true)\n' : '';
    bodies.push(`${lead}${marker}\n\n${built.source}`);
    sectionSources.push({ id: section.id, label, source: built.source });
  }

  const preambleMeta: TypstDocMeta = documentMeta ?? { watermark: options.watermark };
  return {
    source: `${buildTypstPreamble(preambleMeta)}\n${bodies.join('\n\n')}\n`,
    assets,
    unsupported: Array.from(unsupported).sort(),
    blockCount,
    sectionCount: sections.length,
    sectionSources,
  };
}

/** "2026-02-20 14.05 SUSIE-Q Part B" / "… Part B3.1" — no extension. */
export function exportFileStem(acronym: string, sectionNumber?: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}.${pad(now.getMinutes())}`;
  const name = (acronym || 'Proposal').trim().replace(/[\\/:*?"<>|]/g, '-');
  const part = sectionNumber ? `Part ${sectionNumber.replace(/^B/i, 'B')}` : 'Part B';
  return `${stamp} ${name} ${part}`;
}
