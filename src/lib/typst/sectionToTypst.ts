/**
 * Reads one section's BLOCK TREE and assembles a complete Typst document.
 *
 * Blocks are ordered head → free → tail then by `order_index`, hidden and
 * soft-deleted blocks are excluded, and each block's modules come back in
 * `order_index` order. Legacy `section_content` is deliberately out of scope:
 * this path renders blocks only.
 *
 * Source-fed and relational blocks (B3.1 tables 3.1.a–h, milestones, risks,
 * the Pert and Gantt figures and B1.2's linked activities) are rendered from
 * data projected afresh by `b31Data.ts` and emitted by `b31Tables.ts` — the
 * React mirror components are not involved, because Typst cannot consume a
 * component tree.
 */

import { supabase } from '@/integrations/supabase/client';
import type { RefSnapshot } from '@/lib/referenceData';
import { mapCard, mapField, type CardField, type ProposalCard } from '@/types/cards';
import {
  htmlToTypstBlocks,
  htmlToTypstInline,
  typstString,
  type ConvertContext,
} from './htmlToTypst';
import { bannerCall, buildTypstPreamble, type TypstDocMeta } from './typstPreamble';
import {
  emitParticipantList,
  SITRA_LOGO_ASSET_PATH,
  type TypstFrontMatter,
} from './frontMatter';

import { fetchB31TypstData, type B31TypstData } from './b31Data';
import {
  emitDeliverables,
  emitEffortMatrix,
  emitFigure,
  emitLinkedActivities,
  emitMergedJustification,
  emitMilestones,
  emitRisks,
  emitSubcontracting,
  emitWpDescriptions,
  emitWpList,
} from './b31Tables';

import { htmlToPlainText } from '@/lib/htmlToPlainText';
import { emitCasesTable, type CasesTypstData } from './casesData';
import { countCaptionSlots, captionKind } from '@/lib/cards/captionSlots';
import {
  citationHtml,
  fetchSectionCitationSources,
  sectionCitedReferences,
} from '@/lib/sectionCitations';

export interface SectionTypstReference {
  refKey: number;
  displayNumber: number | null;
  html: string;
  /** Bare title, so the footnote can be shortened to one line if it overflows. */
  title?: string;
}

/**
 * The section's cited references, resolved and numbered exactly as the
 * on-screen list and the browser-print export do (shared
 * `sectionCitedReferences`), as plain data the converter can emit.
 */
export async function fetchSectionTypstReferences(
  proposalId: string,
  sectionId: string,
  citationNumbers: Map<number, number> | undefined,
): Promise<SectionTypstReference[]> {
  const sources = await fetchSectionCitationSources(proposalId);
  return sectionCitedReferences(sources, { sectionId }, citationNumbers).map((entry) => ({
    refKey: entry.refKey,
    displayNumber: entry.displayNumber,
    html: citationHtml(entry.reference),
    title: (entry.reference.title || '').trim(),
  }));
}

/**
 * Plain text of a title, used only for placeholder MESSAGES (never for the
 * rendered heading, which keeps its per-run marks — see `htmlToTypstInline`).
 */
function titleText(value: string | null | undefined): string {
  return htmlToPlainText(value ?? '').trim();
}



import {
  B32_CONDITIONAL_KEYS,
  deriveB32Signals,
  resolveB32Condition,
} from '@/lib/cards/b32Conditions';

const BAND_ORDER: Record<string, number> = { head: 0, free: 1, tail: 2 };

export interface SectionBlockTree {
  cards: ProposalCard[];
  fieldsByCard: Record<string, CardField[]>;
}

export async function fetchSectionBlockTree(
  proposalId: string,
  sectionId: string,
): Promise<SectionBlockTree> {
  const { data: cardRows, error: cardError } = await supabase
    .from('proposal_cards')
    .select('*')
    .eq('proposal_id', proposalId)
    .eq('section_id', sectionId)
    .is('deleted_at', null)
    .eq('is_visible', true)
    .order('order_index');
  if (cardError) throw cardError;

  let cards = (cardRows || [])
    .map(mapCard)
    .sort(
      (a, b) =>
        (BAND_ORDER[a.anchor] ?? 1) - (BAND_ORDER[b.anchor] ?? 1) || a.orderIndex - b.orderIndex,
    );

  // B3.2's two conditional blocks: excluded when the consortium does not have
  // what they describe, and their heading names only the halves present. Both
  // are derived from A2 at render time — nothing is stored (b32Conditions.ts).
  if (cards.some((c) => B32_CONDITIONAL_KEYS.includes(c.templateKey as never))) {
    const [propR, partR] = await Promise.all([
      supabase
        .from('proposals')
        .select(
          'mirror_value_chain, mirror_industrial_involvement, mirror_participation_justification',
        )
        .eq('id', proposalId)
        .maybeSingle(),
      supabase
        .from('participants')
        .select('organisation_category, organisation_type, country')
        .eq('proposal_id', proposalId),
    ]);
    const signals = deriveB32Signals(propR.data, partR.data || []);
    cards = cards
      .map((c) => {
        const r = resolveB32Condition(c.templateKey, signals);
        if (!r.conditional) return c;
        if (!r.met) return null;
        return r.title ? { ...c, title: r.title } : c;
      })
      .filter(Boolean) as ProposalCard[];
  }

  const fieldsByCard: Record<string, CardField[]> = {};
  if (cards.length) {
    const { data: fieldRows, error: fieldError } = await supabase
      .from('card_fields')
      .select('*')
      .in('card_id', cards.map((c) => c.id))
      .eq('is_visible', true)
      .is('deleted_at', null)
      .order('order_index');
    if (fieldError) throw fieldError;
    for (const row of fieldRows || []) {
      const field = mapField(row);
      (fieldsByCard[field.cardId] ||= []).push(field);
    }
  }

  return { cards, fieldsByCard };
}

export interface BuiltTypstDocument {
  source: string;
  /** Names of markup features encountered but not converted in this step. */
  unsupported: string[];
  blockCount: number;
}

function placeholder(label: string): string {
  return `not-converted(${typstString(label)})`;
}

/**
 * Source-fed blocks are absent from the document whenever their source is
 * empty. There is nothing to author in them, so a placeholder note would be
 * noise — the board carries the explanation instead (see
 * `sourceFedEmptyReasons`). This covers every recognised source key: the B3.1
 * tables and figures, the per-section reference lists, and B1.2's linked
 * activities.
 */
const SILENT_WHEN_EMPTY = new Set([
  'b11.references',
  'b12.references',
  'b21.references',
  'b22.references',
  'b31.references',
  'b32.references',
  'b12.linked_activities',
  'b31.table_a',
  'b31.table_b',
  'b31.table_c',
  'b31.table_d',
  'b31.table_e',
  'b31.table_f',
  'b31.table_g',
  'b31.table_h',
  'b31.gantt',
  'b31.pert',
]);


export interface BuildTypstOptions {
  sectionLabel?: string;
  data?: RefSnapshot;
  /** Page-one banner and running footer text. */
  meta?: TypstDocMeta;
  /** Projected source data for source-fed and relational blocks. */
  sourceData?: B31TypstData | null;
  /** Which charts were successfully rasterised from the board. */
  figuresAvailable?: { pert: boolean; gantt: boolean };
  /**
   * The section's cited references, already numbered — see
   * `fetchSectionTypstReferences`. They feed the per-page footnotes; there is
   * no reference list in the document.
   */
  references?: SectionTypstReference[];
  /** Page-one furniture (participant list, AI statement); B1.1 only. */
  frontMatter?: TypstFrontMatter | null;
  /** B1.2 cases ("pilots") rows, for the `casesTable` atom nodes. */
  casesData?: CasesTypstData | null;

}

/** Emitters for every source-fed / relational block key we can render. */
function emitSourceFed(
  sourceKey: string,
  ctx: ConvertContext,
  data: B31TypstData,
  figures: { pert: boolean; gantt: boolean },
): string[] | null {
  switch (sourceKey) {
    case 'b11.references':
    case 'b12.references':
    case 'b21.references':
    case 'b22.references':
    case 'b31.references':
    case 'b32.references':
      // Footnotes carry the references; no list is emitted.
      return [];
    case 'b31.table_a':
      return emitWpList(data);
    case 'b31.table_b':
      return emitWpDescriptions(data, ctx);
    case 'b31.table_c':
      return emitDeliverables(data, ctx);
    case 'b31.table_d':
      return emitMilestones(data, ctx);
    case 'b31.table_e':
      return emitRisks(data, ctx);
    case 'b31.table_f':
      return emitEffortMatrix(data);
    case 'b31.table_g':
      return emitSubcontracting(data, ctx, 'Table 3.1.g.');
    case 'b31.table_h':
      return emitMergedJustification(
        data,
        ctx,
        data.purchaseBlocks,
        'purchase-costs',
        'Table 3.1.h.',
        'Purchase cost justifications',
      );
    case 'b31.pert':
      return emitFigure(data, 'pert', figures.pert);
    case 'b31.gantt':
      return emitFigure(data, 'gantt', figures.gantt);
    case 'b12.linked_activities':
      return emitLinkedActivities(data, ctx);
    default:
      return null;
  }
}

export function buildSectionTypstDocument(
  tree: SectionBlockTree,
  options: BuildTypstOptions = {},
): BuiltTypstDocument {
  const sectionNumber = (options.meta?.headings?.h2 || options.sectionLabel || '')
    .match(/(?:B)?(\d+(?:\.\d+)+)/i)?.[1] ?? '';
  const refEntries = options.references ?? [];
  const ctx: ConvertContext = {
    data: options.data,
    unsupported: new Set<string>(),
    citations: {
      numbers: new Map(
        refEntries
          .filter((r) => r.displayNumber != null)
          .map((r) => [r.refKey, r.displayNumber as number]),
      ),
      html: new Map(refEntries.map((r) => [r.refKey, r.html])),
      titles: new Map(refEntries.map((r) => [r.refKey, r.title || ''])),
      emitted: new Set<number>(),
    },
    casesTable: options.casesData
      ? (typeId, label, inner) =>
          emitCasesTable(options.casesData as CasesTypstData, typeId, label, inner)
      : undefined,
    captionNumbering:
      sectionNumber && sectionNumber !== '3.1'
        ? { sectionNumber, tableIndex: 0, figureIndex: 0 }
        : undefined,
  };
  const out: string[] = [];
  const sourceData = options.sourceData ?? null;
  const figures = options.figuresAvailable ?? { pert: false, gantt: false };
  const frontMatter = options.frontMatter ?? null;

  // Page one: banner (with the Sitra mark, when its bitmap was supplied),
  // then the mirrored list of participants and the AI usage statement.
  const banner = options.meta
    ? bannerCall(options.meta, frontMatter ? SITRA_LOGO_ASSET_PATH : '')
    : '';
  if (banner) out.push(banner);
  // The participant list is a BLOCK on the B1.1 board (`b11.participants`), so
  // the export prints it only when that block is present and visible, with the
  // column widths the author set on it. It keeps its page-one position above
  // the numbered headings; the card loop skips it.
  const participantCard = tree.cards.find((c) => c.sourceKey === 'b11.participants');
  if (banner && frontMatter) {
    if (participantCard) out.push(...emitParticipantList(frontMatter));
    if (frontMatter.aiStatementHtml && frontMatter.aiStatementHtml.trim()) {
      out.push(...htmlToTypstBlocks(frontMatter.aiStatementHtml, ctx));
    }
  }

  // Numbered headings, derived from the template's section numbers. The H1 is
  // only emitted by the first section of its part, so a per-section document
  // never repeats "1. Excellence".
  const headings = options.meta?.headings;
  if (headings?.h1) out.push(`he-h1-plain(${typstString(headings.h1)})`);
  if (headings?.h2) out.push(`he-h2-plain(${typstString(headings.h2)})`);
  if (!headings?.h1 && !headings?.h2 && options.sectionLabel) {
    out.push(`he-h2-plain(${typstString(options.sectionLabel)})`);
  }


  // Milestones, risks and linked activities are authored in place (their rows
  // live in proposal_milestones / proposal_risks /
  // methodology_linked_activities), so they are not card-field blocks even
  // though they are not source-fed either. They render the same way here.
  const RELATIONAL_KEYS = new Set(['b31.table_d', 'b31.table_e', 'b12.linked_activities']);

  for (const card of tree.cards) {
    if (card.sourceKey === 'b11.participants') continue; // emitted with page one
    const isGenerated =
      card.isSourceFed || (card.sourceKey && RELATIONAL_KEYS.has(card.sourceKey));

    // Editor-only headers (B3.1) exist for navigation in the board and are
    // never emitted to the preview or the export.
    if (card.title && card.titleMode === 'mirrored') {
      // Colour is carried per RUN, so colouring one word colours one word.
      out.push(
        `block(above: 14pt, below: 6pt, text(size: 12pt, weight: "bold", underline(${htmlToTypstInline(card.title, ctx)})))`,
      );
    }

    if (isGenerated) {
      const emitted = sourceData
        ? emitSourceFed(card.sourceKey || '', ctx, sourceData, figures)
        : null;
      if (emitted && emitted.length) {
        out.push(...emitted);
      } else if (emitted && SILENT_WHEN_EMPTY.has(card.sourceKey || '')) {
        // Nothing cited / no costs of this category: the block exists in the
        // board so the author can see it, but it is left out of the document
        // entirely rather than printing a placeholder note.
        continue;

      } else if (emitted) {
        // Recognised block with nothing in it yet — say so rather than
        // silently dropping the block from the document.
        out.push(
          placeholder(
            `[${titleText(card.title) || card.sourceKey} — no content has been entered yet]`,
          ),
        );
      } else {
        ctx.unsupported.add(`source-fed block ${card.sourceKey || card.templateKey || ''}`.trim());
        out.push(
          placeholder(
            `[source-fed block “${titleText(card.title) || card.sourceKey || card.templateKey || 'untitled'}” — not rendered]`,
          ),
        );
      }
      continue;
    }

    if (card.kind === 'figure') {
      if (ctx.captionNumbering) ctx.captionNumbering.figureIndex += 1;
      ctx.unsupported.add('figure block');
      out.push(placeholder(`[figure block “${titleText(card.title) || 'untitled'}” — not rendered in this step]`));
      continue;
    }
    // References are per-page footnotes now: there is no reference LIST in the
    // exported document, so a references block emits nothing at all.
    if (card.kind === 'references') continue;

    for (const field of tree.fieldsByCard[card.id] || []) {
      if (field.headingEnabled && field.heading) {
        // A module boundary is NOT a structural break: the heading gets the
        // ordinary 3pt paragraph spacing, so items from two different modules
        // sit exactly as far apart as two paragraphs in one module.
        out.push(
          `block(above: 3pt, below: 3pt, text(size: 11pt, weight: "bold", style: "italic", ${htmlToTypstInline(field.heading, ctx)}))`,
        );
      }
      out.push(...htmlToTypstBlocks(field.contentHtml, ctx));
      // Atom-backed case tables have no caption paragraph for the HTML walker
      // to encounter, but still occupy a position-derived table slot.
      if (ctx.captionNumbering) {
        const slots = countCaptionSlots(field.contentHtml);
        const parsedCaptions = typeof document === 'undefined'
          ? 0
          : (() => {
              const holder = document.createElement('div');
              holder.innerHTML = field.contentHtml || '';
              let n = 0;
              holder.querySelectorAll('p').forEach((p) => {
                if (captionKind(p) === 'table') n += 1;
              });
              return n;
            })();
        ctx.captionNumbering.tableIndex += Math.max(0, slots.tables - parsedCaptions);
      }
    }

  }

  // Each block is emitted as a CODE BLOCK (`#{ … }`), not a bare `#expr`:
  // in markup mode a `#` expression ends at the first operator, so the `+`
  // chains this converter builds would spill out as literal text.
  const body = out.map((expr) => `#{\n${expr}\n}`).join('\n\n');
  return {
    source: `${buildTypstPreamble(options.meta || {})}\n${body}\n`,
    unsupported: Array.from(ctx.unsupported).sort(),
    blockCount: tree.cards.length,
  };
}

/**
 * Derives the numbered H1/H2 pair for a section. Nothing here is stored: the
 * number is the template's `section_number` minus its "B" prefix, so renaming
 * or reordering the template reorders the printed headings too.
 */
async function fetchSectionHeadings(
  sec: Record<string, unknown>,
  sectionNumber: string,
  sectionTitle: string,
): Promise<TypstDocMeta['headings']> {
  const strip = (n: string) => n.replace(/^B/i, '').replace(/\.$/, '');
  const h2 = sectionNumber && sectionTitle ? `${strip(sectionNumber)}. ${sectionTitle}` : sectionTitle;
  const parentId = typeof sec.parent_section_id === 'string' ? sec.parent_section_id : '';
  if (!parentId) return { h2: h2 || undefined };

  const [{ data: parent }, { data: siblings }] = await Promise.all([
    supabase
      .from('proposal_template_sections')
      .select('section_number, title')
      .eq('id', parentId)
      .maybeSingle(),
    supabase
      .from('proposal_template_sections')
      .select('id, order_index')
      .eq('parent_section_id', parentId)
      .order('order_index', { ascending: true }),
  ]);

  // Only the first child of the part prints the part heading.
  const first = (siblings || [])[0] as { id?: string } | undefined;
  const isFirstChild = !first || first.id === sec.id || !sec.id;
  if (!parent || !isFirstChild) return { h2: h2 || undefined };
  const pNum = strip(String((parent as { section_number?: string }).section_number || '').trim());
  const pTitle = String((parent as { title?: string }).title || '').trim();
  return {
    h1: pNum && pTitle ? `${pNum}. ${pTitle}` : pTitle || undefined,
    h2: h2 || undefined,
  };
}

/**

 * Proposal-level text for the banner and footer.
 *
 * THE BANNER IS PAGE ONE OF THE DOCUMENT, NOT PAGE ONE OF EVERY SECTION.
 * Only B1.1 — the first section of Part B — carries it; every other section
 * starts on plain 15mm margins. The footer, by contrast, names the section it
 * belongs to ("Part B3.1. Work plan & resources") and carries the acronym as
 * a chip rather than as plain text.
 */
export async function fetchTypstDocMeta(
  proposalId: string,
  sectionId?: string,
  acronymSegments?: TypstDocMeta['acronymSegments'],
): Promise<TypstDocMeta> {
  const [{ data }, section] = await Promise.all([
    supabase
      .from('proposals')
      .select('acronym, title, topic_id, topic_title, type, banner_topic_line_override, banner_title_override')
      .eq('id', proposalId)
      .maybeSingle(),
    sectionId
      ? supabase
          .from('proposal_template_sections')
          .select('id, section_number, title, parent_section_id, order_index, proposal_template_id')
          .eq('id', sectionId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const row = (data || {}) as Record<string, string | null>;
  const sec = ((section as { data: Record<string, unknown> | null }).data || {}) as Record<
    string,
    unknown
  >;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const sectionNumber = str(sec.section_number).trim();
  const sectionTitle = str(sec.title).trim();
  const partLabel = sectionNumber
    ? `Part ${sectionNumber}.${sectionTitle ? ` ${sectionTitle}` : ''}`
    : 'Part B';
  const computedTopic =
    `${row.topic_id || ''}${row.topic_id && row.topic_title ? ': ' : ''}${row.topic_title || ''}` +
    `${row.type ? ` (${row.type})` : ''}`;
  const isFirstSection = sectionNumber.toUpperCase() === 'B1.1';

  // Headings are DERIVED, never stored: the number is the template section's
  // own `section_number` with the "B" prefix dropped, and the H1 above it is
  // the parent container section ("B1" → "1. Excellence"), emitted only by the
  // parent's first child so a per-section document does not repeat it.
  const headings = await fetchSectionHeadings(sec, sectionNumber, sectionTitle);

  return {
    acronym: row.acronym || '',
    acronymSegments,
    partLabel,
    headings,
    // The browser-print export prints "<topic id>: <topic title>" across the
    // top of every page but the first; the Typst header is the same string.
    // …and the action type in parentheses after it: `proposals.type`, the
    // RIA / IA / CSA value chosen when the proposal was created (locked
    // afterwards by `lock_proposal_action_type`).
    runningHeader: row.topic_id || row.topic_title
      ? `${row.topic_id ? `${row.topic_id}: ` : ''}${row.topic_title || ''}` +
        `${row.type ? ` (${row.type})` : ''}`
      : '',
    banner: isFirstSection
      ? {
          topicLine: row.banner_topic_line_override ?? computedTopic,
          acronym: row.acronym || '',

          title: row.banner_title_override ?? row.title ?? '',
        }
      : null,
  };
}


export { fetchB31TypstData };

