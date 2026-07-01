import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Participant } from '@/types/proposal';

export interface ExpertiseRow {
  id: string;
  proposal_id: string;
  order_index: number;
  label: string;
  is_default: boolean;
}

export interface ExpertiseColumn {
  id: string;
  proposal_id: string;
  kind: 'participant' | 'custom';
  participant_id: string | null;
  header_text: string | null;
  order_index: number;
}

export interface ExpertiseCell {
  row_id: string;
  column_id: string;
  checked: boolean;
}

export function useExpertiseMatrix(proposalId: string, participants: Participant[]) {
  const qc = useQueryClient();
  const rowsKey = ['expertise-matrix-rows', proposalId];
  const colsKey = ['expertise-matrix-cols', proposalId];
  const cellsKey = ['expertise-matrix-cells', proposalId];
  const enabledKey = ['expertise-matrix-enabled', proposalId];

  const rowsQ = useQuery({
    queryKey: rowsKey,
    enabled: !!proposalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expertise_matrix_rows')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('order_index');
      if (error) throw error;
      return (data || []) as ExpertiseRow[];
    },
  });

  const colsQ = useQuery({
    queryKey: colsKey,
    enabled: !!proposalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expertise_matrix_columns')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('order_index');
      if (error) throw error;
      return (data || []) as ExpertiseColumn[];
    },
  });

  const cellsQ = useQuery({
    queryKey: cellsKey,
    enabled: !!proposalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expertise_matrix_cells')
        .select('*, expertise_matrix_rows!inner(proposal_id)')
        .eq('expertise_matrix_rows.proposal_id', proposalId);
      if (error) throw error;
      return (data || []).map((c: any) => ({
        row_id: c.row_id,
        column_id: c.column_id,
        checked: c.checked,
      })) as ExpertiseCell[];
    },
  });

  const enabledQ = useQuery({
    queryKey: enabledKey,
    enabled: !!proposalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select('expertise_matrix_enabled')
        .eq('id', proposalId)
        .maybeSingle();
      if (error) throw error;
      return (data?.expertise_matrix_enabled ?? true) as boolean;
    },
  });

  // Reconcile participant columns (insert missing, delete orphans)
  const reconcileRanRef = useRef<string>('');
  useEffect(() => {
    if (!proposalId || !colsQ.data || !participants) return;
    const partIds = participants.map((p) => p.id).sort().join(',');
    const colsSig = colsQ.data.filter((c) => c.kind === 'participant').map((c) => c.participant_id).sort().join(',');
    const sig = `${partIds}||${colsSig}`;
    if (reconcileRanRef.current === sig) return;
    reconcileRanRef.current = sig;

    const partColumns = colsQ.data.filter((c) => c.kind === 'participant');
    const existingPartIds = new Set(partColumns.map((c) => c.participant_id));
    const livePartIds = new Set(participants.map((p) => p.id));
    const ordered = [...participants].sort((a, b) => a.participantNumber - b.participantNumber);

    const toInsert = ordered
      .filter((p) => !existingPartIds.has(p.id))
      .map((p, i) => ({
        proposal_id: proposalId,
        kind: 'participant' as const,
        participant_id: p.id,
        header_text: null,
        order_index: i, // placeholder; effective sort is by participant_number on render
      }));
    const orphanIds = partColumns.filter((c) => c.participant_id && !livePartIds.has(c.participant_id)).map((c) => c.id);

    (async () => {
      let changed = false;
      if (toInsert.length) {
        const { error } = await supabase
          .from('expertise_matrix_columns')
          .upsert(toInsert, { onConflict: 'proposal_id,participant_id', ignoreDuplicates: true });
        if (!error) changed = true;
      }
      if (orphanIds.length) {
        const { error } = await supabase.from('expertise_matrix_columns').delete().in('id', orphanIds);
        if (!error) changed = true;
      }
      if (changed) {
        qc.invalidateQueries({ queryKey: colsKey });
        qc.invalidateQueries({ queryKey: cellsKey });
      }
    })();
  }, [proposalId, colsQ.data, participants, qc]);

  // Sort columns: participants by participantNumber, then custom by order_index
  const sortedColumns = useMemo(() => {
    if (!colsQ.data) return [];
    const partByPid = new Map(participants.map((p) => [p.id, p.participantNumber]));
    const parts = colsQ.data
      .filter((c) => c.kind === 'participant' && c.participant_id && partByPid.has(c.participant_id))
      .sort((a, b) => (partByPid.get(a.participant_id!) ?? 0) - (partByPid.get(b.participant_id!) ?? 0));
    const customs = colsQ.data.filter((c) => c.kind === 'custom').sort((a, b) => a.order_index - b.order_index);
    return [...parts, ...customs];
  }, [colsQ.data, participants]);

  const cellMap = useMemo(() => {
    const m = new Map<string, boolean>();
    (cellsQ.data || []).forEach((c) => m.set(`${c.row_id}::${c.column_id}`, c.checked));
    return m;
  }, [cellsQ.data]);

  const broadcast = () => window.dispatchEvent(new CustomEvent('cross-ref-data-changed', { detail: { type: 'expertise-matrix' } }));

  // Mutations
  const setEnabled = async (v: boolean) => {
    qc.setQueryData(enabledKey, v);
    const { error } = await supabase.from('proposals').update({ expertise_matrix_enabled: v }).eq('id', proposalId);
    if (error) qc.invalidateQueries({ queryKey: enabledKey });
    broadcast();
  };

  const addRow = async () => {
    const max = Math.max(-1, ...(rowsQ.data || []).map((r) => r.order_index));
    const { error } = await supabase.from('expertise_matrix_rows').insert({
      proposal_id: proposalId,
      order_index: max + 1,
      label: '',
      is_default: false,
    });
    if (!error) {
      qc.invalidateQueries({ queryKey: rowsKey });
      broadcast();
    }
  };

  const deleteRow = async (id: string) => {
    const { error } = await supabase.from('expertise_matrix_rows').delete().eq('id', id);
    if (!error) {
      qc.invalidateQueries({ queryKey: rowsKey });
      qc.invalidateQueries({ queryKey: cellsKey });
      broadcast();
    }
  };

  const updateRowLabel = async (id: string, label: string) => {
    const { error } = await supabase.from('expertise_matrix_rows').update({ label }).eq('id', id);
    if (!error) {
      qc.invalidateQueries({ queryKey: rowsKey });
      broadcast();
    }
  };

  const reorderRows = async (orderedIds: string[]) => {
    // Optimistic update
    qc.setQueryData(rowsKey, (prev: ExpertiseRow[] | undefined) => {
      if (!prev) return prev;
      const byId = new Map(prev.map((r) => [r.id, r]));
      return orderedIds.map((id, i) => ({ ...(byId.get(id) as ExpertiseRow), order_index: i }));
    });
    // Two-phase write to avoid uniqueness collisions (no unique here, but safe)
    await Promise.all(
      orderedIds.map((id, i) =>
        supabase.from('expertise_matrix_rows').update({ order_index: i }).eq('id', id),
      ),
    );
    qc.invalidateQueries({ queryKey: rowsKey });
    broadcast();
  };

  const addCustomColumn = async () => {
    const max = Math.max(-1, ...((colsQ.data || []).filter((c) => c.kind === 'custom').map((c) => c.order_index)));
    const { error } = await supabase.from('expertise_matrix_columns').insert({
      proposal_id: proposalId,
      kind: 'custom',
      participant_id: null,
      header_text: '',
      order_index: max + 1,
    });
    if (!error) {
      qc.invalidateQueries({ queryKey: colsKey });
      broadcast();
    }
  };

  const deleteCustomColumn = async (id: string) => {
    const { error } = await supabase.from('expertise_matrix_columns').delete().eq('id', id);
    if (!error) {
      qc.invalidateQueries({ queryKey: colsKey });
      qc.invalidateQueries({ queryKey: cellsKey });
      broadcast();
    }
  };

  const updateColumnHeader = async (id: string, header_text: string) => {
    const { error } = await supabase.from('expertise_matrix_columns').update({ header_text }).eq('id', id);
    if (!error) {
      qc.invalidateQueries({ queryKey: colsKey });
      broadcast();
    }
  };

  const setCell = async (row_id: string, column_id: string, checked: boolean) => {
    // Optimistic
    qc.setQueryData(cellsKey, (prev: ExpertiseCell[] | undefined) => {
      const others = (prev || []).filter((c) => !(c.row_id === row_id && c.column_id === column_id));
      return [...others, { row_id, column_id, checked }];
    });
    const { error } = await supabase
      .from('expertise_matrix_cells')
      .upsert({ row_id, column_id, checked }, { onConflict: 'row_id,column_id' });
    if (error) qc.invalidateQueries({ queryKey: cellsKey });
    else broadcast();
  };

  return {
    enabled: enabledQ.data ?? true,
    rows: rowsQ.data || [],
    columns: sortedColumns,
    cellMap,
    loading: rowsQ.isLoading || colsQ.isLoading || cellsQ.isLoading,
    setEnabled,
    addRow,
    deleteRow,
    updateRowLabel,
    reorderRows,
    addCustomColumn,
    deleteCustomColumn,
    updateColumnHeader,
    setCell,
  };
}
