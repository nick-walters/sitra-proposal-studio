/**
 * THE ONE PATH A SECTION IS RENDERED BY.
 *
 * A section must look identical whether it is previewed on its own
 * (`TypstPreviewDialog`) or stitched into the full Part B document
 * (`partBDocument.ts`). Previously each caller fetched its own inputs and
 * assembled its own options object, so the two drifted: they captured the
 * Gantt from different hosts, collected assets differently, and could pass a
 * different `figuresAvailable` map. Any fault then had to be found twice.
 *
 * This module owns everything a section needs:
 *
 *   - `fetchSharedRenderData` — the PROPOSAL-WIDE inputs (B3.1 projection,
 *     cases, B3.2 mirrors, the rasterised charts). Fetched once and reused by
 *     every section of a document; a single-section preview fetches the same
 *     set for its one section.
 *   - `renderSectionBody` — the SECTION inputs (block tree, meta, references,
 *     authored figures, page-one furniture) plus the emit itself.
 *
 * What legitimately remains caller-specific: the preamble (written once, from
 * the first section's meta), the `<part-marker>` emitted before each section,
 * and the export selection filter. Nothing else.
 */

import type { RefSnapshot } from '@/lib/referenceData';
import type { TypstAsset } from './typstCompiler';
import type { TypstDocMeta } from './typstPreamble';
import {
  buildSectionTypstBody,
  fetchSectionBlockTree,
  fetchSectionTypstReferences,
  fetchTypstDocMeta,
  type SectionBlockTree,
} from './sectionToTypst';
import type { FigureKind } from './typstFigures';

export interface SharedRenderData {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  sourceData: any;
  casesData: any;
  b32Data: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  /** Rasterised charts, already keyed to their virtual paths. */
  figureAssets: TypstAsset[];
  figuresAvailable: { pert: boolean; gantt: boolean };
}

/** Proposal-wide inputs, fetched once per compile. */
export async function fetchSharedRenderData(
  proposalId: string,
  figureKinds: FigureKind[] = ['gantt'],
): Promise<SharedRenderData> {
  const [{ fetchB31TypstData }, { fetchCasesTypstData }, { fetchB32TypstData }, { captureFigureAssets }] =
    await Promise.all([
      import('./b31Data'),
      import('./casesData'),
      import('./b32Mirrors'),
      import('./typstFigures'),
    ]);
  const [sourceData, casesData, b32Data, captured] = await Promise.all([
    fetchB31TypstData(proposalId),
    fetchCasesTypstData(proposalId),
    fetchB32TypstData(proposalId),
    captureFigureAssets(figureKinds),
  ]);
  return {
    sourceData,
    casesData,
    b32Data,
    figureAssets: captured.assets,
    figuresAvailable: {
      pert: captured.assets.some((a) => a.path.includes('pert')),
      gantt: captured.assets.some((a) => a.path.includes('gantt')),
    },
  };
}

export interface RenderedSection {
  /** The section body — never the preamble. */
  source: string;
  /** Assets this section adds (authored figures, page-one furniture). */
  assets: TypstAsset[];
  unsupported: string[];
  blockCount: number;
  /** The section's own meta; the document takes its preamble from the first. */
  meta: TypstDocMeta;
}

export interface RenderSectionOptions {
  proposalId: string;
  sectionId: string;
  /** "B3.1 Work plan & resources" — used when the template gives no headings. */
  sectionLabel: string;
  refData?: RefSnapshot;
  shared: SharedRenderData;
  /** Export-only: drops excluded blocks and modules before anything is emitted. */
  filterTree?: (tree: SectionBlockTree) => SectionBlockTree;
}

/** One section's body, rendered exactly as the full document renders it. */
export async function renderSectionBody(options: RenderSectionOptions): Promise<RenderedSection> {
  const { proposalId, sectionId, sectionLabel, refData, shared } = options;
  const [{ fetchTypstFrontMatter }, { fetchAuthoredFigures }] = await Promise.all([
    import('./frontMatter'),
    import('./authoredFigures'),
  ]);

  const [tree, meta, references, authored] = await Promise.all([
    fetchSectionBlockTree(proposalId, sectionId),
    fetchTypstDocMeta(proposalId, sectionId, refData?.acronymSegments),
    fetchSectionTypstReferences(proposalId, sectionId, refData?.citationNumbers),
    fetchAuthoredFigures(proposalId, sectionId),
  ]);

  // Page-one furniture belongs to the document, not to each section: only the
  // section carrying the banner (B1.1) pulls it in — identical in both paths.
  const frontMatter = meta.banner ? await fetchTypstFrontMatter(proposalId) : null;

  const built = buildSectionTypstBody(options.filterTree ? options.filterTree(tree) : tree, {
    sectionLabel,
    data: refData,
    meta,
    sourceData: shared.sourceData,
    references,
    frontMatter,
    casesData: shared.casesData,
    b32Data: shared.b32Data,
    authoredFigures: authored.blocks,
    figuresAvailable: shared.figuresAvailable,
  });

  return {
    source: built.source,
    assets: [...authored.assets, ...(frontMatter?.assets ?? [])],
    unsupported: built.unsupported,
    blockCount: built.blockCount,
    meta,
  };
}
