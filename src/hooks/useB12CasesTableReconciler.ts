import { useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCaseTypeLabel } from '@/lib/caseTypeLabels';

/**
 * B1.2 cases-table reconciler — Stage 3a.
 *
 * For each proposal_case_type that has ≥1 case_draft, maintains an atomic
 * UNIT in the B1.2 editor doc consisting of three sibling nodes:
 *
 *   <h3 data-default-subheading="true"
 *       data-case-type-heading-id="{typeId}">{Plural type name}</h3>
 *   <p></p>                                       (one empty line)
 *   <casesTable caseTypeId="{typeId}">
 *
 * Rules:
 *   - Matching is by ID (heading: data-case-type-heading-id, table:
 *     caseTypeId) — the heading and table do NOT need to be adjacent and
 *     the user can drag either piece without breaking the bind.
 *   - INSERT: if a type has ≥1 case and is missing pieces, append whatever's
 *     missing at the end of the doc (heading + empty <p> + table, or just
 *     the missing half — preserving any half the user kept).
 *   - REMOVE: if a type has 0 cases (or was deleted), delete its heading,
 *     the heading's immediately-following empty <p> (only if empty), and
 *     its table, found by ID even if the user moved them apart.
 *   - DEDUPE: same typeId twice → keep first, drop extras.
 *   - HEADING TEXT freshness: if the type's plural name changed, rewrite
 *     just the heading's text (no recreate).
 *   - Untyped legacy casesTable nodes are ignored (Stage 3 final migration).
 *   - All transactions: addToHistory:false + trackChangesInternal:true.
 */
export function useB12CasesTableReconciler({
  editor,
  proposalId,
  sectionNumber,
  isReady,
}: {
  editor: Editor | null;
  proposalId: string | undefined | null;
  sectionNumber: string | undefined | null;
  isReady: boolean;
}) {
  const active =
    !!editor && !!proposalId && isReady && sectionNumber === 'B1.2';

  const { data: types } = useQuery({
    queryKey: ['proposal-case-types-reconciler', proposalId],
    enabled: active,
    queryFn: async () => {
      const { data } = await supabase
        .from('proposal_case_types')
        .select('id, type_code, custom_type_name, order_index')
        .eq('proposal_id', proposalId as string)
        .order('order_index', { ascending: true, nullsFirst: false });
      return (data ?? []) as TypeRow[];
    },
  });

  // Distinct queryKey from the nav's ['case-drafts', proposalId] —
  // they select different column shapes and must NOT share a cache entry.
  const { data: cases } = useQuery({
    queryKey: ['case-drafts-reconciler', proposalId],
    enabled: active,
    queryFn: async () => {
      const { data } = await supabase
        .from('case_drafts')
        .select('id, case_type_id')
        .eq('proposal_id', proposalId as string);
      return (data ?? []) as { id: string; case_type_id: string | null }[];
    },
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active || !editor || !types || !cases) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        if (!editor || editor.isDestroyed || !editor.schema) return;
        reconcile(editor, types, cases);
      } catch {
        // best-effort — never throw out of an effect
      }
    }, 300);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [active, editor, types, cases]);
}

interface TypeRow {
  id: string;
  type_code: string | null;
  custom_type_name: string | null;
  order_index: number | null;
}

function pluralFor(t: TypeRow): string {
  return getCaseTypeLabel(t.type_code, t.custom_type_name, { plural: true });
}

function reconcile(
  editor: Editor,
  typeRows: TypeRow[],
  caseRows: { id: string; case_type_id: string | null }[],
) {
  const typeById = new Map(typeRows.map((t) => [t.id, t]));
  const shouldExist = new Set<string>();
  for (const c of caseRows) {
    if (c.case_type_id && typeById.has(c.case_type_id)) {
      shouldExist.add(c.case_type_id);
    }
  }

  const doc = editor.state.doc;
  // Guard against running before the section content has been loaded.
  if (doc.content.size <= 2) return;

  const schema = editor.state.schema;
  const headingType = schema.nodes.heading;
  const paragraphType = schema.nodes.paragraph;
  const casesNodeType = schema.nodes.casesTable;
  if (!headingType || !paragraphType || !casesNodeType) return;

  // Scan top-level (and one level deep for safety) for matching nodes.
  type Hit = { pos: number; size: number; node: any };
  const headingsByType = new Map<string, Hit>(); // typeId -> first heading
  const tablesByType = new Map<string, Hit>(); // typeId -> first table
  const dupRemovals: { pos: number; size: number }[] = [];

  doc.descendants((node, pos) => {
    if (node.type?.name === 'heading') {
      const tid =
        (node.attrs?.['data-case-type-heading-id'] as string | null) || null;
      if (tid) {
        if (!shouldExist.has(tid) || !typeById.has(tid)) {
          dupRemovals.push({ pos, size: node.nodeSize });
        } else if (headingsByType.has(tid)) {
          dupRemovals.push({ pos, size: node.nodeSize });
        } else {
          headingsByType.set(tid, { pos, size: node.nodeSize, node });
        }
      }
      return false;
    }
    if (node.type?.name === 'casesTable') {
      const tid = (node.attrs?.caseTypeId as string | null) || null;
      if (!tid) return false; // legacy untyped — leave alone
      if (!shouldExist.has(tid)) {
        dupRemovals.push({ pos, size: node.nodeSize });
      } else if (tablesByType.has(tid)) {
        dupRemovals.push({ pos, size: node.nodeSize });
      } else {
        tablesByType.set(tid, { pos, size: node.nodeSize, node });
      }
      return false;
    }
    return true;
  });

  // For each heading we're removing, also mark its immediately-following
  // empty paragraph for removal.
  const headingsToRemovePositions = new Set(
    dupRemovals
      .filter((r) => {
        const n = doc.nodeAt(r.pos);
        return n?.type?.name === 'heading';
      })
      .map((r) => r.pos),
  );
  const extraEmptyParaRemovals: { pos: number; size: number }[] = [];
  for (const hp of headingsToRemovePositions) {
    const h = doc.nodeAt(hp);
    if (!h) continue;
    const after = hp + h.nodeSize;
    const next = doc.nodeAt(after);
    if (next?.type?.name === 'paragraph' && next.content.size === 0) {
      extraEmptyParaRemovals.push({ pos: after, size: next.nodeSize });
    }
  }

  // Headings whose text drifted from the current plural name.
  const headingTextUpdates: { pos: number; newText: string; node: any }[] = [];
  for (const [tid, hit] of headingsByType) {
    const t = typeById.get(tid);
    if (!t) continue;
    const desired = pluralFor(t);
    const current = (hit.node.textContent || '').trim();
    if (desired && current !== desired) {
      headingTextUpdates.push({ pos: hit.pos, newText: desired, node: hit.node });
    }
  }

  // Build insertion list: ordered by proposal_case_types.order_index for
  // a stable initial appearance.
  const orderedTypes = typeRows
    .filter((t) => shouldExist.has(t.id))
    .slice()
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));

  type Insert =
    | { kind: 'unit'; tid: string }
    | { kind: 'heading'; tid: string }
    | { kind: 'table'; tid: string };
  const inserts: Insert[] = [];
  for (const t of orderedTypes) {
    const hasH = headingsByType.has(t.id);
    const hasT = tablesByType.has(t.id);
    if (!hasH && !hasT) inserts.push({ kind: 'unit', tid: t.id });
    else if (!hasH) inserts.push({ kind: 'heading', tid: t.id });
    else if (!hasT) inserts.push({ kind: 'table', tid: t.id });
  }

  if (
    dupRemovals.length === 0 &&
    extraEmptyParaRemovals.length === 0 &&
    headingTextUpdates.length === 0 &&
    inserts.length === 0
  ) {
    return;
  }

  let tr = editor.state.tr;

  // 1. Heading text rewrites (preserve attrs; replace text content).
  for (const u of headingTextUpdates) {
    const textNode = schema.text(u.newText);
    tr = tr.replaceWith(u.pos + 1, u.pos + 1 + u.node.content.size, textNode);
  }

  // 2. Removals — combine + sort in reverse document order.
  const allRemovals = [...dupRemovals, ...extraEmptyParaRemovals].sort(
    (a, b) => b.pos - a.pos,
  );
  for (const r of allRemovals) {
    // Map positions through prior steps (text rewrites can shift).
    const from = tr.mapping.map(r.pos);
    const to = tr.mapping.map(r.pos + r.size);
    if (to > from) tr = tr.delete(from, to);
  }

  // 3. Insertions — append at end of doc.
  for (const ins of inserts) {
    const t = typeById.get(ins.tid);
    if (!t) continue;
    const plural = pluralFor(t) || 'Cases';
    const nodes: any[] = [];
    if (ins.kind === 'unit' || ins.kind === 'heading') {
      nodes.push(
        headingType.create(
          {
            level: 3,
            'data-default-subheading': 'true',
            'data-case-type-heading-id': ins.tid,
          },
          schema.text(plural),
        ),
      );
      if (ins.kind === 'unit') {
        nodes.push(paragraphType.create());
      }
    }
    if (ins.kind === 'unit' || ins.kind === 'table') {
      nodes.push(
        casesNodeType.create({
          caseTypeId: ins.tid,
          caseIds: [],
          caption: null,
        }),
      );
    }
    for (const n of nodes) {
      tr = tr.insert(tr.doc.content.size, n);
    }
  }

  tr.setMeta('addToHistory', false);
  tr.setMeta('trackChangesInternal', true);
  editor.view.dispatch(tr);
}
