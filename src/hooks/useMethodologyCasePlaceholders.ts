import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Keeps methodology_items rows with kind = 'case_placeholder' in sync with the
 * case types that qualify for a cases table in B1.2.
 *
 * Qualifying rule — identical to useB12CasesTableReconciler.reconcile():
 *   a case type qualifies when at least one case_draft references it
 *   (case_type_id non-null AND the type still exists).
 *
 * Best-effort, idempotent, debounced, and never throws out of the effect.
 */

export interface CaseTypeLite {
  id: string;
  type_code: string | null;
  custom_type_name: string | null;
  order_index: number | null;
}

export function useMethodologyCasePlaceholders({
  proposalId,
  canEdit,
}: {
  proposalId: string | undefined | null;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const active = !!proposalId;

  // Same query shapes as useB12CasesTableReconciler, distinct query keys.
  const { data: types } = useQuery({
    queryKey: ['proposal-case-types-methodology-placeholders', proposalId],
    enabled: active,
    queryFn: async () => {
      const { data } = await supabase
        .from('proposal_case_types')
        .select('id, type_code, custom_type_name, order_index')
        .eq('proposal_id', proposalId as string)
        .order('order_index', { ascending: true, nullsFirst: false });
      return (data ?? []) as CaseTypeLite[];
    },
  });

  const { data: cases } = useQuery({
    queryKey: ['case-drafts-methodology-placeholders', proposalId],
    enabled: active,
    queryFn: async () => {
      const { data } = await supabase
        .from('case_drafts')
        .select('id, case_type_id')
        .eq('proposal_id', proposalId as string);
      return (data ?? []) as { id: string; case_type_id: string | null }[];
    },
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    if (!active || !canEdit || !types || !cases) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void (async () => {
        if (runningRef.current) return;
        runningRef.current = true;
        try {
          const typeById = new Map(types.map((t) => [t.id, t]));
          const shouldExist = new Set<string>();
          for (const c of cases) {
            if (c.case_type_id && typeById.has(c.case_type_id)) {
              shouldExist.add(c.case_type_id);
            }
          }

          const { data: rows, error } = await supabase
            .from('methodology_items')
            .select('id, kind, case_type_id, order_index')
            .eq('proposal_id', proposalId as string);
          if (error || !rows) return;

          const placeholders = rows.filter((r) => r.kind === 'case_placeholder');
          const existing = new Set(
            placeholders.map((r) => r.case_type_id).filter(Boolean) as string[],
          );

          const toDelete = placeholders
            .filter((r) => !r.case_type_id || !shouldExist.has(r.case_type_id))
            .map((r) => r.id);

          const toInsertTypes = types
            .filter((t) => shouldExist.has(t.id) && !existing.has(t.id))
            .slice()
            .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));

          if (toDelete.length === 0 && toInsertTypes.length === 0) return;

          let changed = false;

          if (toDelete.length > 0) {
            const { error: delErr } = await supabase
              .from('methodology_items')
              .delete()
              .in('id', toDelete);
            if (!delErr) changed = true;
          }

          if (toInsertTypes.length > 0) {
            let next = rows.length
              ? Math.max(...rows.map((r) => r.order_index ?? 0)) + 1
              : 0;
            const payload = toInsertTypes.map((t) => ({
              proposal_id: proposalId as string,
              kind: 'case_placeholder',
              case_type_id: t.id,
              heading: '',
              order_index: next++,
            }));
            const { error: insErr } = await supabase
              .from('methodology_items')
              .upsert(payload, {
                onConflict: 'proposal_id,case_type_id',
                ignoreDuplicates: true,
              });
            if (!insErr) changed = true;
          }

          if (changed) {
            queryClient.invalidateQueries({
              queryKey: ['methodology-items', proposalId],
            });
          }
        } catch {
          // best-effort — never throw out of an effect
        } finally {
          runningRef.current = false;
        }
      })();
    }, 300);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [active, canEdit, types, cases, proposalId, queryClient]);

  return { caseTypes: types ?? [] };
}
