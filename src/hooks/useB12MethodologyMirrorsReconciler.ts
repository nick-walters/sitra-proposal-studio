import { useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { methodologyRunCount, METHODOLOGY_PLACEHOLDER_KIND } from '@/lib/b12MethodologyRuns';


/**
 * B1.2 Methodologies mirror reconciler — stage 5a.
 *
 * For each VISIBLE methodology_subsections row (ordered by order_index), the
 * B1.2 doc must contain, in order:
 *
 *   <h3 data-default-subheading="true" data-b12-subsection-key="{key}">{title}</h3>
 *   <b12MirrorSlot slotKey="{key}">
 *
 * Rules:
 *   - Hidden / deleted subsections: heading + slot removed.
 *   - Duplicates of a key: removed.
 *   - Renamed subsection: heading text rewritten in place.
 *   - Order / adjacency drift: managed blocks are rebuilt in the correct
 *     order at the position of the first managed block (or appended at doc
 *     end when none exist yet).
 *   - Everything that is not a managed heading or slot is left untouched, so
 *     user-written prose and the cases table survive.
 *   - All transactions: addToHistory:false + trackChangesInternal:true.
 */

interface Row {
  key: string;
  title: string;
  order_index: number;
  is_visible: boolean;
}

export function useB12MethodologyMirrorsReconciler({
  editor,
  proposalId,
  sectionNumber,
  isReady,
  readOnly = false,
}: {
  editor: Editor | null;
  proposalId: string | undefined | null;
  sectionNumber: string | undefined | null;
  isReady: boolean;
  readOnly?: boolean;
}) {
  const active =
    !!editor && !!proposalId && isReady && !readOnly && sectionNumber === 'B1.2';

  const { data: rows } = useQuery({
    queryKey: ['methodology-subsections-b12-reconciler', proposalId],
    enabled: active,
    queryFn: async (): Promise<Row[]> => {
      const { data } = await supabase
        .from('methodology_subsections')
        .select('key, title, order_index, is_visible')
        .eq('proposal_id', proposalId as string)
        .order('order_index');
      return (data ?? []) as Row[];
    },
  });

  /** Canonical shared query (camelCase rows) — same key as the Methodologies page. */
  const { data: items } = useMethodologyItemsQuery(proposalId, { enabled: active });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active || !editor || !rows) return;
    const ordered = items ?? [];
    const runCount = methodologyRunCount(ordered);
    const placeholderTypeIds = ordered
      .filter((i) => i.kind === METHODOLOGY_PLACEHOLDER_KIND)
      .map((i) => i.caseTypeId ?? null);

    const schedule = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        try {
          if (!editor || editor.isDestroyed || !editor.schema) return;
          reconcile(editor, rows, runCount, placeholderTypeIds);
        } catch {
          // best-effort — never throw out of an effect
        }
      }, 300);
    };
    schedule();
    editor.on('update', schedule);
    return () => {
      editor.off('update', schedule);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [active, editor, rows, items]);
}


function reconcile(
  editor: Editor,
  rows: Row[],
  methodologyRuns = 1,
  placeholderTypeIds: (string | null)[] = [],
) {
  const doc = editor.state.doc;
  if (doc.content.size <= 2) return;

  const schema = editor.state.schema;
  const headingType = schema.nodes.heading;
  const slotType = schema.nodes.b12MirrorSlot;
  if (!headingType || !slotType) return;

  // Self-healing cleanup first: orphan heading duplicates (and legacy seeded
  // subheadings) are H3s whose text matches a current subsection title but
  // which are NOT immediately followed by a b12MirrorSlot node.
  if (cleanupOrphanHeadings(editor, rows)) return;

  const runCount = Math.max(1, methodologyRuns);


  const desired = rows
    .filter((r) => r.is_visible)
    .slice()
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  const titleByKey = new Map(desired.map((r) => [r.key, r.title]));

  /** Slot identity: methodologies slots are (key, runIndex) pairs. */
  const slotId = (key: string, runIndex: number | null) =>
    key === 'methodologies' ? `${key}#${runIndex ?? ''}` : key;

  type Hit = { pos: number; size: number; node: any };
  const headingByKey = new Map<string, Hit>();
  const slotById = new Map<string, Hit>();
  const removals: { pos: number; size: number }[] = [];
  const managedPositions: number[] = [];
  const docOrder: { id: string; kind: 'heading' | 'slot'; pos: number }[] = [];

  doc.descendants((node, pos) => {
    if (node.type?.name === 'heading') {
      const key = (node.attrs?.['data-b12-subsection-key'] as string | null) || null;
      if (key) {
        managedPositions.push(pos);
        if (!titleByKey.has(key) || headingByKey.has(key)) {
          removals.push({ pos, size: node.nodeSize });
        } else {
          headingByKey.set(key, { pos, size: node.nodeSize, node });
          docOrder.push({ id: key, kind: 'heading', pos });
        }
      }
      return false;
    }
    if (node.type?.name === 'b12MirrorSlot') {
      const key = (node.attrs?.slotKey as string | null) || null;
      const runIndex =
        typeof node.attrs?.runIndex === 'number' ? (node.attrs.runIndex as number) : null;
      managedPositions.push(pos);
      const id = key ? slotId(key, runIndex) : '';
      const outOfRange =
        key === 'methodologies' && (runIndex === null || runIndex < 0 || runIndex >= runCount);
      if (!key || !titleByKey.has(key) || slotById.has(id) || outOfRange) {
        removals.push({ pos, size: node.nodeSize });
      } else {
        slotById.set(id, { pos, size: node.nodeSize, node });
        docOrder.push({ id, kind: 'slot', pos });
      }
      return false;
    }
    return true;
  });

  // Is the surviving managed sequence exactly the expected heading/slot(s)?
  const expectedSeq: string[] = [];
  for (const r of desired) {
    expectedSeq.push(`${r.key}:heading`);
    if (r.key === 'methodologies') {
      for (let i = 0; i < runCount; i++) expectedSeq.push(`${slotId(r.key, i)}:slot`);
    } else {
      expectedSeq.push(`${r.key}:slot`);
    }
  }
  const actualSeq = docOrder
    .slice()
    .sort((a, b) => a.pos - b.pos)
    .map((e) => `${e.id}:${e.kind}`);
  const needsRebuild = expectedSeq.join('|') !== actualSeq.join('|');


  if (!needsRebuild) {
    // Only heading-text refreshes may be needed.
    const updates: { pos: number; node: any; text: string }[] = [];
    for (const [key, hit] of headingByKey) {
      const title = titleByKey.get(key) || '';
      if (title && (hit.node.textContent || '').trim() !== title) {
        updates.push({ pos: hit.pos, node: hit.node, text: title });
      }
    }
    if (updates.length === 0 && removals.length === 0) {
      // Structure is settled — only then do we move the cases tables into
      // their placeholder positions.
      placeCasesTables(editor, placeholderTypeIds);
      return;
    }


    let tr = editor.state.tr;
    for (const u of updates) {
      tr = tr.replaceWith(u.pos + 1, u.pos + 1 + u.node.content.size, schema.text(u.text));
    }
    removals.sort((a, b) => b.pos - a.pos);
    for (const r of removals) {
      const from = tr.mapping.map(r.pos);
      const to = tr.mapping.map(r.pos + r.size);
      if (to > from) tr = tr.delete(from, to);
    }
    tr.setMeta('addToHistory', false);
    tr.setMeta('b12MirrorManaged', true);
    tr.setMeta('trackChangesInternal', true);
    editor.view.dispatch(tr);
    return;
  }

  // Rebuild: drop every managed node, then re-insert the ordered sequence at
  // the position of the first managed node (or at doc end when none exist).
  const allManaged: { pos: number; size: number }[] = [];
  doc.descendants((node, pos) => {
    if (node.type?.name === 'heading') {
      if (node.attrs?.['data-b12-subsection-key']) {
        allManaged.push({ pos, size: node.nodeSize });
      }
      return false;
    }
    if (node.type?.name === 'b12MirrorSlot') {
      allManaged.push({ pos, size: node.nodeSize });
      return false;
    }
    return true;
  });

  let tr = editor.state.tr;
  const anchorPos = allManaged.length > 0 ? allManaged[0].pos : doc.content.size;
  let anchor = anchorPos;

  const sorted = allManaged.slice().sort((a, b) => b.pos - a.pos);
  for (const r of sorted) {
    const from = tr.mapping.map(r.pos);
    const to = tr.mapping.map(r.pos + r.size);
    if (to > from) tr = tr.delete(from, to);
  }
  anchor = Math.min(tr.mapping.map(anchorPos), tr.doc.content.size);

  const nodes: any[] = [];
  for (const r of desired) {
    nodes.push(
      headingType.create(
        {
          level: 3,
          'data-default-subheading': 'true',
          'data-b12-subsection-key': r.key,
        },
        r.title ? schema.text(r.title) : undefined,
      ),
    );
    if (r.key === 'methodologies') {
      // One slot per run of consecutive methodology items, contiguous for now
      // (the cases tables are placed between them in a later stage).
      for (let i = 0; i < runCount; i++) {
        nodes.push(slotType.create({ slotKey: r.key, runIndex: i }));
      }
    } else {
      nodes.push(slotType.create({ slotKey: r.key, runIndex: null }));
    }
  }

  let at = anchor;
  for (const n of nodes) {
    tr = tr.insert(at, n);
    at += n.nodeSize;
  }

  tr.setMeta('addToHistory', false);
  tr.setMeta('b12MirrorManaged', true);
  tr.setMeta('trackChangesInternal', true);
  editor.view.dispatch(tr);
}

/**
 * Removes orphan H3 headings left behind by the pre-fix duplication bug and by
 * legacy seeded subheadings: an H3 whose text exactly matches a current
 * subsection title but which is NOT immediately followed by a b12MirrorSlot
 * node. The empty paragraph immediately after such a heading is removed too so
 * no blank gap is left. Idempotent — a clean document produces no removals.
 *
 * Returns true when a cleanup transaction was dispatched (the caller then
 * defers the rest of the reconcile to the next pass).
 */
function normaliseTitle(raw: string): string {
  // Decode HTML entities (stored orphans carry "&amp;") and normalise whitespace.
  let s = raw ?? '';
  if (s.includes('&')) {
    const el = typeof document !== 'undefined' ? document.createElement('textarea') : null;
    if (el) {
      el.innerHTML = s;
      s = el.value;
    }
  }
  return s.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function cleanupOrphanHeadings(editor: Editor, rows: Row[]): boolean {
  const doc = editor.state.doc;
  // Match against the CURRENT title of every subsection — visible or hidden.
  const titles = new Set(
    rows.map((r) => normaliseTitle(r.title || '')).filter(Boolean),
  );
  if (titles.size === 0) return false;

  const top: { node: any; pos: number }[] = [];
  doc.forEach((node, offset) => top.push({ node, pos: offset }));

  const removals: { pos: number; size: number }[] = [];
  let orphanHeadings = 0;
  let emptyParagraphs = 0;
  for (let i = 0; i < top.length; i++) {
    const { node, pos } = top[i];
    if (node.type?.name !== 'heading' || node.attrs?.level !== 3) continue;
    const text = normaliseTitle(node.textContent || '');
    if (!titles.has(text)) continue;

    const next = top[i + 1];
    // A correctly managed heading is immediately followed by its slot.
    if (next && next.node.type?.name === 'b12MirrorSlot') continue;

    removals.push({ pos, size: node.nodeSize });
    orphanHeadings += 1;

    // Also drop a trailing empty paragraph that belonged to the orphan.
    if (
      next &&
      next.node.type?.name === 'paragraph' &&
      (next.node.textContent || '').trim() === '' &&
      next.node.childCount === 0
    ) {
      removals.push({ pos: next.pos, size: next.node.nodeSize });
      emptyParagraphs += 1;
      i += 1;
    }
  }

  if (removals.length === 0) return false;
  if (removals.length > 60) {
    console.warn('[b12-mirror] refusing bulk removal', removals.length);
    console.info('[b12-mirror] cleanup', { orphanHeadings, emptyParagraphs, removed: false });
    return false;
  }
  console.info('[b12-mirror] cleanup', { orphanHeadings, emptyParagraphs, removed: true });


  let tr = editor.state.tr;
  removals.sort((a, b) => b.pos - a.pos);
  for (const r of removals) {
    const from = tr.mapping.map(r.pos);
    const to = tr.mapping.map(r.pos + r.size);
    if (to > from) tr = tr.delete(from, to);
  }
  tr.setMeta('addToHistory', false);
  tr.setMeta('b12MirrorManaged', true);
  tr.setMeta('trackChangesInternal', true);
  editor.view.dispatch(tr);
  return true;
}

/**
 * Moves each existing casesTable node to sit immediately after the mirror slot
 * whose runIndex equals the number of placeholders preceding it.
 *
 * - Never creates or deletes a casesTable: nodes are moved verbatim (same
 *   attrs, caseIds and caption), so caption numbering and cross-references
 *   survive.
 * - A placeholder whose type has no table yet is skipped (next pass places it).
 * - A casesTable whose type has no placeholder row is left untouched.
 * - IDEMPOTENT: it first compares the actual node following each slot with the
 *   desired table and returns without dispatching when they already match, and
 *   it performs at most ONE move per pass, so the sequence converges instead of
 *   ping-ponging.
 *
 * Returns true when a transaction was dispatched.
 */
function placeCasesTables(editor: Editor, placeholderTypeIds: (string | null)[]): boolean {
  if (placeholderTypeIds.length === 0) return false;
  const doc = editor.state.doc;

  // Top-level scan: slots by runIndex, cases tables by caseTypeId.
  const slotAt = new Map<number, { pos: number; size: number }>();
  const tableByType = new Map<string, { pos: number; size: number; node: any }>();
  doc.forEach((node, offset) => {
    if (node.type?.name === 'b12MirrorSlot') {
      const key = node.attrs?.slotKey;
      const runIndex = node.attrs?.runIndex;
      if (key === 'methodologies' && typeof runIndex === 'number') {
        if (!slotAt.has(runIndex)) slotAt.set(runIndex, { pos: offset, size: node.nodeSize });
      }
    } else if (node.type?.name === 'casesTable') {
      const tid = (node.attrs?.caseTypeId as string | null) || null;
      if (tid && !tableByType.has(tid)) {
        tableByType.set(tid, { pos: offset, size: node.nodeSize, node });
      }
    }
  });

  for (let i = 0; i < placeholderTypeIds.length; i++) {
    const tid = placeholderTypeIds[i];
    if (!tid) continue;
    const table = tableByType.get(tid);
    if (!table) continue; // not created yet — the cases reconciler owns that
    const slot = slotAt.get(i);
    if (!slot) continue; // slot missing — the structural pass will add it

    const targetPos = slot.pos + slot.size;
    if (table.pos === targetPos) continue; // already in place — no dispatch

    // Move exactly one table per pass, preserving the node verbatim.
    const copy = table.node;
    let tr = editor.state.tr;
    tr = tr.delete(table.pos, table.pos + table.size);
    const insertAt = tr.mapping.map(targetPos);
    tr = tr.insert(Math.min(insertAt, tr.doc.content.size), copy);
    tr.setMeta('addToHistory', false);
    tr.setMeta('b12MirrorManaged', true);
    tr.setMeta('trackChangesInternal', true);
    editor.view.dispatch(tr);
    return true;
  }
  return false;
}
