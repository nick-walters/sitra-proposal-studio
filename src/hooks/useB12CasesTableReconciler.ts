import { useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * B1.2 cases-table reconciler — Stage 2.
 *
 * Maintains exactly one <casesTable caseTypeId="..."> node per
 * proposal_case_type that has >= 1 case in the proposal.
 *
 * Rules:
 *   - shouldExist = case_type_id values that have >= 1 case_draft AND
 *     whose proposal_case_types row still exists.
 *   - present     = caseTypeId attribute of every casesTable node in the
 *                   B1.2 editor doc (untyped/null nodes — legacy
 *                   placeholders — are IGNORED here; Stage 3 owns them).
 *   - INSERT (shouldExist − present): one new casesTable node at the end
 *     of the doc, keyed by caseTypeId — membership test prevents duplicates
 *     on re-runs/reload.
 *   - REMOVE (present − shouldExist): delete the node(s). Also dedupes if
 *     the same caseTypeId somehow appears twice.
 *   - Never repositions an existing node — user repositioning is preserved.
 *   - All edits dispatch with addToHistory:false + trackChangesInternal so
 *     they don't pollute undo or track-changes.
 *   - Gated on a ready, mounted editor with a real schema; debounced 300 ms.
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
    queryKey: ['proposal-case-types', proposalId],
    enabled: active,
    queryFn: async () => {
      const { data } = await supabase
        .from('proposal_case_types')
        .select('id')
        .eq('proposal_id', proposalId as string);
      return (data ?? []) as { id: string }[];
    },
  });

  // NOTE: distinct queryKey from the nav's ['case-drafts', proposalId] —
  // they select different column shapes and must NOT share a cache entry,
  // otherwise whichever fetch settles last overwrites the other's shape
  // (the nav loses `number`/`short_name`/`color`/`case_type` and starts
  // rendering "undefined" black badges).
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

function reconcile(
  editor: Editor,
  typeRows: { id: string }[],
  caseRows: { id: string; case_type_id: string | null }[],
) {
  const knownTypeIds = new Set(typeRows.map((t) => t.id));
  const shouldExist = new Set<string>();
  for (const c of caseRows) {
    if (c.case_type_id && knownTypeIds.has(c.case_type_id)) {
      shouldExist.add(c.case_type_id);
    }
  }

  const doc = editor.state.doc;
  // Guard against running before the section content has been loaded.
  if (doc.content.size <= 2) return;

  const present = new Map<string, number>(); // caseTypeId -> first pos
  const toRemove: { pos: number; size: number }[] = [];

  doc.descendants((node, pos) => {
    if (node.type?.name !== 'casesTable') return true;
    const tid = (node.attrs?.caseTypeId as string | null) || null;
    if (!tid) return true; // legacy untyped placeholder — leave alone
    if (!shouldExist.has(tid)) {
      toRemove.push({ pos, size: node.nodeSize });
    } else if (present.has(tid)) {
      toRemove.push({ pos, size: node.nodeSize }); // duplicate — drop
    } else {
      present.set(tid, pos);
    }
    return true;
  });

  const toInsert: string[] = [];
  for (const tid of shouldExist) {
    if (!present.has(tid)) toInsert.push(tid);
  }

  if (toRemove.length === 0 && toInsert.length === 0) return;

  const schema = editor.state.schema;
  const casesNodeType = schema.nodes.casesTable;
  if (!casesNodeType) return;

  let tr = editor.state.tr;

  // Remove in reverse document order so earlier positions stay valid.
  toRemove.sort((a, b) => b.pos - a.pos);
  for (const r of toRemove) {
    tr = tr.delete(r.pos, r.pos + r.size);
  }

  // Append new tables at end of section doc (default position; user can move).
  for (const tid of toInsert) {
    const node = casesNodeType.create({
      caseTypeId: tid,
      caseIds: [],
      caption: null,
    });
    tr = tr.insert(tr.doc.content.size, node);
  }

  tr.setMeta('addToHistory', false);
  tr.setMeta('trackChangesInternal', true);
  editor.view.dispatch(tr);
}
