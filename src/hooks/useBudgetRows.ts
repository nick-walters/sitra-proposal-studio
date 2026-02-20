import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface BudgetRowData {
  id: string;
  proposalId: string;
  participantId: string;
  roleLabel: string;
  personnelCosts: number;
  subcontractingCosts: number;
  purchaseTravel: number;
  purchaseEquipment: number;
  purchaseOtherGoods: number;
  internallyInvoiced: number;
  indirectCostsOverride: number | null;
  fundingRateOverride: number | null;
  incomeGenerated: number;
  financialContributions: number;
  ownResources: number;
  isLocked: boolean;
  lockedBy: string | null;
  lockedAt: string | null;
  // Joined participant info
  participantNumber: number;
  participantName: string;
  participantShortName: string | null;
  country: string | null;
  organisationCategory: string | null;
}

export interface ComputedBudgetRow extends BudgetRowData {
  directCosts: number;
  indirectCosts: number;
  totalEligibleCosts: number;
  fundingRate: number;
  maxEuContribution: number;
  requestedEuContribution: number;
  totalEstimatedIncome: number;
}

export interface BudgetJustification {
  id: string;
  budgetRowId: string;
  category: string;
  justificationText: string;
  updatedBy: string | null;
  updatedAt: string;
}

function computeRow(row: BudgetRowData, proposalType: string | null): ComputedBudgetRow {
  const directCosts =
    row.personnelCosts +
    row.subcontractingCosts +
    row.purchaseTravel +
    row.purchaseEquipment +
    row.purchaseOtherGoods +
    row.internallyInvoiced;

  const indirectCostsBase = directCosts - row.subcontractingCosts - row.internallyInvoiced;
  const indirectCosts = row.indirectCostsOverride ?? Math.round(indirectCostsBase * 0.25);
  const totalEligibleCosts = directCosts + indirectCosts;

  // Funding rate logic
  let fundingRate = row.fundingRateOverride ?? 100;
  if (row.fundingRateOverride == null) {
    if (proposalType === 'IA' && row.organisationCategory !== 'PUB' && row.organisationCategory !== 'REC' && row.organisationCategory !== 'HES') {
      fundingRate = 70;
    }
  }

  const maxEuContribution = Math.round(totalEligibleCosts * (fundingRate / 100));
  const requestedEuContribution = Math.min(maxEuContribution, totalEligibleCosts);
  const totalEstimatedIncome = requestedEuContribution + row.incomeGenerated + row.financialContributions + row.ownResources;

  return {
    ...row,
    directCosts,
    indirectCosts,
    totalEligibleCosts,
    fundingRate,
    maxEuContribution,
    requestedEuContribution,
    totalEstimatedIncome,
  };
}

export function useBudgetRows(proposalId: string, proposalType: string | null) {
  const { user } = useAuth();
  const [rows, setRows] = useState<BudgetRowData[]>([]);
  const [justifications, setJustifications] = useState<BudgetJustification[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const fetchRows = useCallback(async () => {
    if (!proposalId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('budget_rows')
      .select('*, participants!inner(participant_number, organisation_name, organisation_short_name, country, organisation_category)')
      .eq('proposal_id', proposalId)
      .order('participants(participant_number)');

    if (error) {
      console.error('Error fetching budget rows:', error);
      setLoading(false);
      return;
    }

    const mapped: BudgetRowData[] = (data || []).map((r: any) => ({
      id: r.id,
      proposalId: r.proposal_id,
      participantId: r.participant_id,
      roleLabel: r.role_label,
      personnelCosts: Number(r.personnel_costs) || 0,
      subcontractingCosts: Number(r.subcontracting_costs) || 0,
      purchaseTravel: Number(r.purchase_travel) || 0,
      purchaseEquipment: Number(r.purchase_equipment) || 0,
      purchaseOtherGoods: Number(r.purchase_other_goods) || 0,
      internallyInvoiced: Number(r.internally_invoiced) || 0,
      indirectCostsOverride: r.indirect_costs_override != null ? Number(r.indirect_costs_override) : null,
      fundingRateOverride: r.funding_rate_override != null ? Number(r.funding_rate_override) : null,
      incomeGenerated: Number(r.income_generated) || 0,
      financialContributions: Number(r.financial_contributions) || 0,
      ownResources: Number(r.own_resources) || 0,
      isLocked: r.is_locked,
      lockedBy: r.locked_by,
      lockedAt: r.locked_at,
      participantNumber: r.participants.participant_number,
      participantName: r.participants.organisation_name,
      participantShortName: r.participants.organisation_short_name,
      country: r.participants.country,
      organisationCategory: r.participants.organisation_category,
    }));

    mapped.sort((a, b) => a.participantNumber - b.participantNumber);
    setRows(mapped);
    setLoading(false);
  }, [proposalId]);

  const fetchJustifications = useCallback(async () => {
    if (!proposalId) return;
    const { data, error } = await supabase
      .from('budget_cost_justifications')
      .select('*')
      .in('budget_row_id', rows.map(r => r.id));

    if (error) {
      console.error('Error fetching justifications:', error);
      return;
    }

    setJustifications((data || []).map((j: any) => ({
      id: j.id,
      budgetRowId: j.budget_row_id,
      category: j.category,
      justificationText: j.justification_text,
      updatedBy: j.updated_by,
      updatedAt: j.updated_at,
    })));
  }, [proposalId, rows.map(r => r.id).join(',')]);

  // Auto-initialize rows for participants that don't have one
  const initializeRows = useCallback(async () => {
    if (!proposalId) return;

    const { data: participants, error: pError } = await supabase
      .from('participants')
      .select('id, participant_number, organisation_name, organisation_short_name, country, organisation_category')
      .eq('proposal_id', proposalId)
      .order('participant_number');

    if (pError || !participants) return;

    const existingParticipantIds = rows.map(r => r.participantId);
    const missing = participants.filter(p => !existingParticipantIds.includes(p.id));

    if (missing.length === 0) return;

    const inserts = missing.map(p => ({
      proposal_id: proposalId,
      participant_id: p.id,
      role_label: p.participant_number === 1 ? 'Coordinator' : 'Participant',
    }));

    const { error } = await supabase.from('budget_rows').insert(inserts);
    if (error) {
      console.error('Error initializing budget rows:', error);
      return;
    }

    await fetchRows();
  }, [proposalId, rows, fetchRows]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    if (!loading && rows.length === 0 && proposalId) {
      initializeRows();
    }
  }, [loading, rows.length, proposalId]);

  useEffect(() => {
    if (rows.length > 0) {
      fetchJustifications();
    }
  }, [rows.length > 0, fetchJustifications]);

  const updateRow = useCallback((rowId: string, field: string, value: number) => {
    // Optimistic update
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, [field]: value } : r));

    // Debounce save
    if (debounceTimers.current[rowId]) {
      clearTimeout(debounceTimers.current[rowId]);
    }

    debounceTimers.current[rowId] = setTimeout(async () => {
      const row = rows.find(r => r.id === rowId);
      if (!row) return;

      const dbField = field.replace(/([A-Z])/g, '_$1').toLowerCase();
      setSaving(true);
      const { error } = await supabase
        .from('budget_rows')
        .update({ [dbField]: value })
        .eq('id', rowId);

      if (error) {
        toast.error('Failed to save budget change');
        console.error(error);
      }
      setSaving(false);
    }, 300);
  }, [rows]);

  const updateRoleLabel = useCallback(async (rowId: string, label: string) => {
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, roleLabel: label } : r));
    const { error } = await supabase.from('budget_rows').update({ role_label: label }).eq('id', rowId);
    if (error) toast.error('Failed to update role');
  }, []);

  const lockRow = useCallback(async (rowId: string) => {
    if (!user) return;
    const { error } = await supabase
      .from('budget_rows')
      .update({ is_locked: true, locked_by: user.id, locked_at: new Date().toISOString() })
      .eq('id', rowId);
    if (error) {
      toast.error('Failed to lock row');
      return;
    }
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, isLocked: true, lockedBy: user.id, lockedAt: new Date().toISOString() } : r));
  }, [user]);

  const unlockRow = useCallback(async (rowId: string) => {
    const { error } = await supabase
      .from('budget_rows')
      .update({ is_locked: false, locked_by: null, locked_at: null })
      .eq('id', rowId);
    if (error) {
      toast.error('Failed to unlock row');
      return;
    }
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, isLocked: false, lockedBy: null, lockedAt: null } : r));
  }, []);

  const saveJustification = useCallback(async (budgetRowId: string, category: string, text: string) => {
    if (!user) return;
    const { error } = await supabase
      .from('budget_cost_justifications')
      .upsert({
        budget_row_id: budgetRowId,
        category,
        justification_text: text,
        updated_by: user.id,
      }, { onConflict: 'budget_row_id,category' });

    if (error) {
      toast.error('Failed to save justification');
      console.error(error);
      return;
    }

    // Refresh justifications
    await fetchJustifications();
  }, [user, fetchJustifications]);

  const computedRows = useMemo(() => {
    return rows.map(r => computeRow(r, proposalType));
  }, [rows, proposalType]);

  const grandTotals = useMemo(() => {
    const zero: Omit<ComputedBudgetRow, keyof BudgetRowData | 'fundingRate'> & { fundingRate: null } = {
      directCosts: 0,
      indirectCosts: 0,
      totalEligibleCosts: 0,
      fundingRate: null as any,
      maxEuContribution: 0,
      requestedEuContribution: 0,
      totalEstimatedIncome: 0,
    };
    const sums = {
      personnelCosts: 0,
      subcontractingCosts: 0,
      purchaseTravel: 0,
      purchaseEquipment: 0,
      purchaseOtherGoods: 0,
      internallyInvoiced: 0,
      incomeGenerated: 0,
      financialContributions: 0,
      ownResources: 0,
      ...zero,
    };
    for (const r of computedRows) {
      sums.personnelCosts += r.personnelCosts;
      sums.subcontractingCosts += r.subcontractingCosts;
      sums.purchaseTravel += r.purchaseTravel;
      sums.purchaseEquipment += r.purchaseEquipment;
      sums.purchaseOtherGoods += r.purchaseOtherGoods;
      sums.internallyInvoiced += r.internallyInvoiced;
      sums.directCosts += r.directCosts;
      sums.indirectCosts += r.indirectCosts;
      sums.totalEligibleCosts += r.totalEligibleCosts;
      sums.maxEuContribution += r.maxEuContribution;
      sums.requestedEuContribution += r.requestedEuContribution;
      sums.incomeGenerated += r.incomeGenerated;
      sums.financialContributions += r.financialContributions;
      sums.ownResources += r.ownResources;
      sums.totalEstimatedIncome += r.totalEstimatedIncome;
    }
    return sums;
  }, [computedRows]);

  return {
    rows: computedRows,
    justifications,
    grandTotals,
    loading,
    saving,
    updateRow,
    updateRoleLabel,
    lockRow,
    unlockRow,
    saveJustification,
    refetch: fetchRows,
  };
}
