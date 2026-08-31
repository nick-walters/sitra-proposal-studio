/**
 * Authored figure blocks (`proposal_cards.kind = 'figure'`) for the Typst
 * document.
 *
 * These are the figures the author inserts themselves — uploads, AI-generated
 * images and the rasterised impact / overview canvases. All three land in the
 * same place: `figures.content.imageUrl` holds a path into the PRIVATE
 * `proposal-files` bucket, so the value is not fetchable as-is. It is resolved
 * to a signed URL with `resolveStorageUrl` (the non-hook form used by
 * `StorageImage`), fetched, downscaled and handed to the compiler's virtual
 * filesystem as a shadow file.
 *
 * The Pert and Gantt are NOT handled here: they are source-fed blocks drawn
 * from B3.1 data (`typstFigures.ts` / `pertTypst.ts`).
 */

import { supabase } from '@/integrations/supabase/client';
import { resolveStorageUrl } from '@/hooks/useStorageUrl';
import { computeFigureNumbers } from '@/lib/figureNumbering';
import {
  resolveFigureWidthPct,
  type FigurePageBreakMode,
  type FigurePositionMode,
} from '@/lib/figureLayout';
import type { TypstAsset } from './typstCompiler';

/**
 * 18 cm at 300 dpi. The printed figure can never be wider than the text
 * column, so anything above this is resolution the PDF cannot show: uploads
 * are downscaled to it (aspect preserved, never upscaled) before they enter
 * the compiler, which keeps both the document and the wasm heap small.
 */
export const FIGURE_MAX_PX = 2126;

export type AuthoredFigureStatus =
  | 'ok'
  /** The block exists but no figure has been chosen for it. */
  | 'no_figure'
  /** `card_figure.figure_id` points at a figure that has been deleted. */
  | 'missing_asset'
  /** A figure with no rendered bitmap yet (an un-rasterised canvas). */
  | 'not_rendered'
  /** The asset exists but could not be signed, fetched or decoded. */
  | 'unreadable';

export interface AuthoredFigureBlock {
  cardId: string;
  status: AuthoredFigureStatus;
  /** Virtual compiler path; only set when `status === 'ok'`. */
  assetPath: string | null;
  /** "Figure 1.2.a." — derived exactly as the board derives it. */
  label: string | null;
  caption: string;
  widthPct: number;
  positionMode: FigurePositionMode;
  pageBreakMode: FigurePageBreakMode;
  groupWithAbove: boolean;
  groupWithBelow: boolean;
}

export interface AuthoredFigures {
  assets: TypstAsset[];
  blocks: Map<string, AuthoredFigureBlock>;
}

/** Decodes, downscales to `FIGURE_MAX_PX` and re-encodes as PNG. */
async function downscale(bytes: Uint8Array, mime: string): Promise<{ bytes: Uint8Array; ext: string } | null> {
  const blob = new Blob([bytes as unknown as BlobPart], { type: mime || 'image/png' });
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return null;
  }
  const scale = Math.min(1, FIGURE_MAX_PX / bitmap.width);
  if (scale >= 1) {
    bitmap.close();
    // Already small enough: the original bytes go in untouched, so nothing is
    // re-encoded and no quality is lost.
    return { bytes, ext: mime === 'image/jpeg' ? 'jpg' : 'png' };
  }
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return null;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const isJpeg = mime === 'image/jpeg';
  const out = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, isJpeg ? 'image/jpeg' : 'image/png', isJpeg ? 0.92 : undefined),
  );
  if (!out) return null;
  return { bytes: new Uint8Array(await out.arrayBuffer()), ext: isJpeg ? 'jpg' : 'png' };
}

/**
 * Resolves every authored figure block of one section: its placement settings,
 * its derived number and its bitmap.
 */
export async function fetchAuthoredFigures(
  proposalId: string,
  sectionId: string,
  /**
   * TEXT-ONLY: skip signing, downloading and re-encoding every bitmap. The
   * word count and the evaluator read the emitted SOURCE, never the PDF, so
   * the images were pure waste there — and that waste ran on every proposal
   * screen because the page badge shares this assembly.
   */
  opts: { textOnly?: boolean } = {},
): Promise<AuthoredFigures> {
  const empty: AuthoredFigures = { assets: [], blocks: new Map() };

  const [placementRes, cardRes, figureRes] = await Promise.all([
    supabase.from('card_figure').select('*').eq('proposal_id', proposalId),
    supabase
      .from('proposal_cards')
      .select('id, section_id, order_index, kind, deleted_at, is_visible')
      .eq('proposal_id', proposalId),
    supabase
      .from('figures')
      .select('id, title, caption, content, deleted_at')
      .eq('proposal_id', proposalId),
  ]);
  const placements = placementRes.data ?? [];
  const allCards = cardRes.data ?? [];
  if (!placements.length) return empty;

  const liveCards = allCards.filter((c) => !c.deleted_at);
  const sectionIds = Array.from(
    new Set(liveCards.map((c) => c.section_id).filter(Boolean)),
  ) as string[];
  const sectionRes = sectionIds.length
    ? await supabase
        .from('proposal_template_sections')
        .select('id, section_number, order_index')
        .in('id', sectionIds)
    : { data: [] as { id: string; section_number: string | null; order_index: number | null }[] };

  // Numbering is the SAME derived authority the board uses, so the preview
  // never disagrees with the on-screen label.
  const numbers = computeFigureNumbers(
    placements as { card_id: string; figure_id: string | null }[],
    liveCards as { id: string; section_id: string | null; order_index: number | null }[],
    (sectionRes.data ?? []) as {
      id: string;
      section_number: string | null;
      order_index: number | null;
    }[],
  );

  const figureById = new Map((figureRes.data ?? []).map((f) => [f.id, f]));
  const cardById = new Map(liveCards.map((c) => [c.id, c]));

  const assets: TypstAsset[] = [];
  const blocks = new Map<string, AuthoredFigureBlock>();

  for (const p of placements as Record<string, unknown>[]) {
    const cardId = p.card_id as string;
    const card = cardById.get(cardId);
    if (!card || card.section_id !== sectionId || card.is_visible === false) continue;

    const figureId = (p.figure_id as string | null) ?? null;
    const figure = figureId ? figureById.get(figureId) : null;
    const widthPct = resolveFigureWidthPct(
      (p.width_mode as never) ?? 'full',
      p.custom_width_pct != null ? Number(p.custom_width_pct) : 100,
    );
    const base: AuthoredFigureBlock = {
      cardId,
      status: 'ok',
      assetPath: null,
      label: figureId && numbers.has(figureId) ? `Figure ${numbers.get(figureId)}.` : null,
      caption:
        ((p.caption as string | null) || figure?.caption || figure?.title || '').trim(),
      widthPct,
      positionMode: ((p.position_mode as FigurePositionMode) ?? 'below'),
      pageBreakMode: ((p.page_break_mode as FigurePageBreakMode) ?? 'auto'),
      groupWithAbove: !!p.group_with_above,
      groupWithBelow: !!p.group_with_below,
    };

    if (!figureId) {
      blocks.set(cardId, { ...base, status: 'no_figure' });
      continue;
    }
    // The FK is ON DELETE SET NULL, but a SOFT-deleted figure keeps the link:
    // both read as "the asset is gone" here.
    if (!figure || figure.deleted_at) {
      blocks.set(cardId, { ...base, status: 'missing_asset' });
      continue;
    }
    const stored = (figure.content as { imageUrl?: string } | null)?.imageUrl ?? null;
    if (!stored) {
      // Canvas figures reach this state until they have been rasterised: the
      // rasteriser writes the bitmap's storage path into the same field.
      blocks.set(cardId, { ...base, status: 'not_rendered' });
      continue;
    }

    if (opts.textOnly) {
      // A path that no compile will ever open: it keeps the block on the same
      // emit branch, so the caption and label text match the real document.
      blocks.set(cardId, { ...base, assetPath: `/figures/authored-${cardId}.png` });
      continue;
    }

    try {
      const url = await resolveStorageUrl(stored);
      if (!url) {
        blocks.set(cardId, { ...base, status: 'unreadable' });
        continue;
      }
      const res = await fetch(url);
      if (!res.ok) {
        blocks.set(cardId, { ...base, status: 'unreadable' });
        continue;
      }
      const raw = new Uint8Array(await res.arrayBuffer());
      const scaled = await downscale(raw, res.headers.get('content-type') || 'image/png');
      if (!scaled) {
        blocks.set(cardId, { ...base, status: 'unreadable' });
        continue;
      }
      const assetPath = `/figures/authored-${cardId}.${scaled.ext}`;
      assets.push({ path: assetPath, bytes: scaled.bytes });
      blocks.set(cardId, { ...base, assetPath });
    } catch {
      blocks.set(cardId, { ...base, status: 'unreadable' });
    }
  }

  return { assets, blocks };
}
