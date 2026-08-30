/**
 * The evaluator payload.
 *
 * Since the card restructure the live document is `proposal_cards` /
 * `card_fields` plus the mirrors; `section_content` holds only pre-restructure
 * remnants. The Typst assembly (`buildPartBTypstDocument`) already reads the
 * live store for the whole of Part B — front matter, participants, B1.2 cases,
 * B3.1 relational tables, B3.2 mirrors, expertise matrix, milestones and risks
 * — so the payload is derived from ITS source rather than from the legacy
 * print DOM.
 *
 * Nothing is excluded: the export selection is deliberately EMPTY here, so the
 * evaluator always sees the complete proposal, and no watermark or figure
 * bitmap is needed because only text is extracted.
 */

import { fetchReferenceData } from '@/lib/referenceData';
import {
  buildPartBTypstDocument,
  fetchPartBSections,
  EMPTY_SELECTION,
} from '@/lib/typst/partBDocument';
import { typstSourceToText } from '@/lib/typst/typstText';

export interface EvaluationPayload {
  /** Markdown-shaped text of the live Part B document. */
  text: string;
  characters: number;
  words: number;
  /** Same arithmetic the edge function uses: 500 words/page + 1 front matter. */
  estimatedPages: number;
  sectionCount: number;
  blockCount: number;
}

export async function buildEvaluationPayload(proposalId: string): Promise<EvaluationPayload> {
  const [sections, refData] = await Promise.all([
    fetchPartBSections(proposalId),
    fetchReferenceData(proposalId),
  ]);

  const built = await buildPartBTypstDocument({
    proposalId,
    sections,
    refData,
    selection: EMPTY_SELECTION,
    watermark: false,
  });

  const text = typstSourceToText(built.source);
  const words = text.split(/\s+/).filter(Boolean).length;

  return {
    text,
    characters: text.length,
    words,
    estimatedPages: Math.ceil(words / 500) + 1,
    sectionCount: built.sectionCount,
    blockCount: built.blockCount,
  };
}
