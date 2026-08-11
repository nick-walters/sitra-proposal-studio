import { useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active || !editor || !rows) return;
    const schedule = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        try {
          if (!editor || editor.isDestroyed || !editor.schema) return;
          reconcile(editor, rows);
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
  }, [active, editor, rows]);
}

function reconcile(editor: Editor, rows: Row[]) {
  const doc = editor.state.doc;
  if (doc.content.size <= 2) return;

  const schema = editor.state.schema;
  const headingType = schema.nodes.heading;
  const slotType = schema.nodes.b12MirrorSlot;
  if (!headingType || !slotType) return;

  const desired = rows
    .filter((r) => r.is_visible)
    .slice()
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  const titleByKey = new Map(desired.map((r) => [r.key, r.title]));

  type Hit = { pos: number; size: number; node: any };
  const headingByKey = new Map<string, Hit>();
  const slotByKey = new Map<string, Hit>();
  const removals: { pos: number; size: number }[] = [];
  const managedPositions: number[] = [];
  const docOrder: { key: string; kind: 'heading' | 'slot'; pos: number }[] = [];

  doc.descendants((node, pos) => {
    if (node.type?.name === 'heading') {
      const key = (node.attrs?.['data-b12-subsection-key'] as string | null) || null;
      if (key) {
        managedPositions.push(pos);
        if (!titleByKey.has(key) || headingByKey.has(key)) {
          removals.push({ pos, size: node.nodeSize });
        } else {
          headingByKey.set(key, { pos, size: node.nodeSize, node });
          docOrder.push({ key, kind: 'heading', pos });
        }
      }
      return false;
    }
    if (node.type?.name === 'b12MirrorSlot') {
      const key = (node.attrs?.slotKey as string | null) || null;
      managedPositions.push(pos);
      if (!key || !titleByKey.has(key) || slotByKey.has(key)) {
        removals.push({ pos, size: node.nodeSize });
      } else {
        slotByKey.set(key, { pos, size: node.nodeSize, node });
        docOrder.push({ key, kind: 'slot', pos });
      }
      return false;
    }
    return true;
  });

  // Is the surviving managed sequence exactly heading/slot pairs in order?
  const expectedSeq: string[] = [];
  for (const r of desired) expectedSeq.push(`${r.key}:heading`, `${r.key}:slot`);
  const actualSeq = docOrder
    .slice()
    .sort((a, b) => a.pos - b.pos)
    .map((e) => `${e.key}:${e.kind}`);
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
    if (updates.length === 0 && removals.length === 0) return;

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
      slotType.create({ slotKey: r.key }),
    );
  }
  let at = anchor;
  for (const n of nodes) {
    tr = tr.insert(at, n);
    at += n.nodeSize;
  }

  tr.setMeta('addToHistory', false);
  tr.setMeta('trackChangesInternal', true);
  editor.view.dispatch(tr);
}
