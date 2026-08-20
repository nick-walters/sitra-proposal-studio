import { supabase } from '@/integrations/supabase/client';
import { OVERVIEW_CANVAS_FIGURE_TYPE } from '@/lib/overviewCanvas';

/**
 * B1.1 overview canvas — remove the legacy "source table" text.
 *
 * Older B1.1 documents carry a flattened, baked-in text copy of the overview
 * canvas cells (column headings, the bullet lines of every cell, the canvas
 * acronym shape and a duplicate caption paragraph) stored as ordinary
 * paragraphs immediately BEFORE the <div data-overview-canvas-slot> node.
 * The canvas itself is rendered from live data into that slot, so in the
 * export the same content appeared twice — once as raw text, once as the
 * figure.
 *
 * This scrub is export-only: it removes those paragraphs from the export
 * container. Stored section content is never written.
 */

function normalise(text: string | null | undefined): string {
  return String(text || '')
    .replace(/[\u2022\u00b7\u2013\u2014]/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function textsFromHtml(html: string): string[] {
  const holder = document.createElement('div');
  holder.innerHTML = html || '';
  const out: string[] = [];
  holder.querySelectorAll('p, li, div, span').forEach((el) => {
    const t = normalise(el.textContent);
    if (t) out.push(t);
  });
  const whole = normalise(holder.textContent);
  if (whole) out.push(whole);
  return out;
}

/** Collect every text fragment the live overview canvas renders. */
async function loadCanvasTexts(proposalId: string): Promise<Set<string>> {
  const known = new Set<string>();

  const { data: figure } = await supabase
    .from('figures')
    .select('id, title, caption')
    .eq('proposal_id', proposalId)
    .eq('figure_type', OVERVIEW_CANVAS_FIGURE_TYPE)
    .maybeSingle();
  if (!figure?.id) return known;

  for (const v of [figure.title, figure.caption]) {
    const t = normalise(v);
    if (t) known.add(t);
  }

  const [{ data: columns }, { data: rows }, { data: elements }] = await Promise.all([
    supabase
      .from('impact_canvas_columns')
      .select('heading, guideline')
      .eq('proposal_id', proposalId)
      .eq('figure_id', figure.id),
    supabase
      .from('impact_canvas_rows')
      .select('content')
      .eq('proposal_id', proposalId)
      .eq('figure_id', figure.id),
    supabase
      .from('impact_canvas_elements')
      .select('content')
      .eq('proposal_id', proposalId)
      .eq('figure_id', figure.id),
  ]);

  for (const c of columns || []) {
    for (const v of [c.heading, c.guideline]) {
      const t = normalise(v);
      if (t) known.add(t);
    }
  }

  const harvest = (value: unknown) => {
    if (typeof value === 'string') {
      for (const t of textsFromHtml(value)) known.add(t);
      return;
    }
    if (value && typeof value === 'object') {
      for (const v of Object.values(value as Record<string, unknown>)) harvest(v);
    }
  };
  for (const r of rows || []) harvest(r.content);
  for (const e of elements || []) harvest((e.content as Record<string, unknown> | null)?.html);

  return known;
}

/**
 * Remove the baked canvas text run that precedes every overview-canvas slot.
 * Must run BEFORE the canvas React component is mounted into the slot.
 */
export async function stripBakedOverviewCanvasText(
  container: HTMLElement,
  proposalId: string,
): Promise<number> {
  const slots = Array.from(
    container.querySelectorAll<HTMLElement>('div[data-overview-canvas-slot]'),
  );
  if (slots.length === 0) return 0;

  let known: Set<string>;
  try {
    known = await loadCanvasTexts(proposalId);
  } catch {
    return 0;
  }
  if (known.size === 0) return 0;

  let removed = 0;
  for (const slot of slots) {
    // Walk backwards over the contiguous run of paragraphs that duplicate
    // canvas content. Stop at the first paragraph that is genuine prose.
    let guard = 0;
    let prev = slot.previousElementSibling as HTMLElement | null;
    while (prev && guard++ < 80) {
      const tag = prev.tagName.toLowerCase();
      if (tag !== 'p') break;
      const text = normalise(prev.textContent);
      const isEmpty = text.length === 0;
      const isCanvasText =
        known.has(text) ||
        // Partial cell bakes (e.g. a truncated acronym shape) — match when the
        // paragraph text is a prefix of a known canvas fragment.
        (text.length >= 3 && Array.from(known).some((k) => k.startsWith(text)));
      if (!isEmpty && !isCanvasText) break;
      const toRemove = prev;
      prev = prev.previousElementSibling as HTMLElement | null;
      toRemove.remove();
      removed++;
    }
  }
  return removed;
}
