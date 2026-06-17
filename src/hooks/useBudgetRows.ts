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
  financialSupportThirdParties: number;
  internallyInvoiced: number;
  procurement: number;
  indirectCostsOverride: number | null;
  fundingRateOverride: number | null;
  requestedEuContributionOverride: number | null;
  incomeGenerated: number;
  financialContributions: number;
  ownResources: number;
  isLocked: boolean;
  lockedBy: string | null;
  lockedAt: string | null;
  pmRate: number | null;
  totalPersonMonths: number;
  purchaseEquipmentJustification: string;
  hasInKind: boolean;
  requestedPersonnelCosts: number | null;
  requestedSubcontracting: number | null;
  requestedTravel: number | null;
  requestedEquipment: number | null;
  requestedOtherGoods: number | null;
  requestedFstp: number | null;
  requestedInternallyInvoiced: number | null;
  requestedIndirectCosts: number | null;
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

export interface SubcontractingItem {
  id: string;
  budgetRowId: string;
  description: string;
  amount: number;
  justification: string;
  orderIndex: number;
}

export interface EquipmentItem {
  id: string;
  budgetRowId: string;
  description: string;
  amount: number;
  justification: string;
  orderIndex: number;
}

export interface PersonnelBreakdownItem {
  id: string;
  budgetRowId: string;
  category: string;
  pmCount: number;
  pmRate: number;
  orderIndex: number;
}

function computeRow(row: BudgetRowData, proposalType: string | null): ComputedBudgetRow {
  const personnelCosts = row.pmRate != null && row.pmRate > 0
    ? Math.round(row.pmRate * row.totalPersonMonths)
    : row.personnelCosts;

  const directCosts =
    personnelCosts +
    row.subcontractingCosts +
    row.purchaseTravel +
    row.purchaseEquipment +
    row.purchaseOtherGoods +
    row.financialSupportThirdParties +
    row.internallyInvoiced +
    row.procurement;

  const indirectCostsBase = directCosts - row.subcontractingCosts - row.financialSupportThirdParties;
  const indirectCosts = row.indirectCostsOverride ?? Math.round(indirectCostsBase * 0.25 * 100) / 100;
  const totalEligibleCosts = directCosts + indirectCosts;

  // Funding rate: RIA = 100% all; IA = 100% except PRC (private companies) = 70%
  let fundingRate = row.fundingRateOverride ?? 100;
  if (row.fundingRateOverride == null) {
    if (proposalType === 'IA' && row.organisationCategory === 'PRC') {
      fundingRate = 70;
    }
  }

  const maxEuContribution = Math.round(totalEligibleCosts * (fundingRate / 100) * 100) / 100;
  let requestedEuContribution: number;
  if (row.hasInKind) {
    // Sum per-category requested amounts
    const reqPersonnel = row.requestedPersonnelCosts ?? personnelCosts;
    const reqSub = row.requestedSubcontracting ?? row.subcontractingCosts;
    const reqTravel = row.requestedTravel ?? row.purchaseTravel;
    const reqEquip = row.requestedEquipment ?? row.purchaseEquipment;
    const reqOther = row.requestedOtherGoods ?? row.purchaseOtherGoods;
    const reqFstp = row.requestedFstp ?? row.financialSupportThirdParties;
    const reqInternally = row.requestedInternallyInvoiced ?? row.internallyInvoiced;
    const reqDirectTotal = reqPersonnel + reqSub + reqTravel + reqEquip + reqOther + reqFstp + reqInternally;
    const reqIndirect = Math.round((reqDirectTotal - reqSub - reqFstp) * 0.25 * 100) / 100;
    requestedEuContribution = Math.min(
      reqDirectTotal + reqIndirect,
      maxEuContribution
    );
  } else {
    requestedEuContribution = row.requestedEuContributionOverride != null
      ? Math.min(row.requestedEuContributionOverride, maxEuContribution)
      : maxEuContribution;
  }
  const totalEstimatedIncome = requestedEuContribution + row.incomeGenerated + row.financialContributions + row.ownResources;

  return {
    ...row,
    personnelCosts,
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
  const [subcontractingItems, setSubcontractingItems] = useState<SubcontractingItem[]>([]);
  const [equipmentItems, setEquipmentItems] = useState<EquipmentItem[]>([]);
  const [personnelBreakdown, setPersonnelBreakdown] = useState<PersonnelBreakdownItem[]>([]);
  const [personnelLoaded, setPersonnelLoaded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const hasLoadedRef = useRef(false);
  const personnelRef = useRef<PersonnelBreakdownItem[]>([]);
  const seedingRef = useRef<Set<string>>(new Set());
  useEffect(() => { personnelRef.current = personnelBreakdown; }, [personnelBreakdown]);

  const fetchRows = useCallback(async () => {
    if (!proposalId) return;
    if (!hasLoadedRef.current) setLoading(true);

    const [{ data, error }, { data: effortData }] = await Promise.all([
      supabase
        .from('budget_rows')
        .select('*, participants!inner(participant_number, organisation_name, organisation_short_name, country, organisation_category)')
        .eq('proposal_id', proposalId)
        .order('participants(participant_number)'),
      supabase
        .from('wp_draft_effort')
        .select('participant_id, person_months, wp_drafts!inner(proposal_id)')
        .eq('wp_drafts.proposal_id', proposalId),
    ]);

    if (error) {
      console.error('Error fetching budget rows:', error);
      setLoading(false);
      return;
    }

    const pmTotals = new Map<string, number>();
    (effortData || []).forEach((e: any) => {
      pmTotals.set(e.participant_id, (pmTotals.get(e.participant_id) || 0) + Number(e.person_months || 0));
    });

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
      financialSupportThirdParties: Number(r.financial_support_third_parties) || 0,
      internallyInvoiced: Number(r.internally_invoiced) || 0,
      procurement: Number(r.procurement) || 0,
      indirectCostsOverride: r.indirect_costs_override != null ? Number(r.indirect_costs_override) : null,
      fundingRateOverride: r.funding_rate_override != null ? Number(r.funding_rate_override) : null,
      requestedEuContributionOverride: r.requested_eu_contribution != null ? Number(r.requested_eu_contribution) : null,
      incomeGenerated: Number(r.income_generated) || 0,
      financialContributions: Number(r.financial_contributions) || 0,
      ownResources: Number(r.own_resources) || 0,
      isLocked: r.is_locked,
      lockedBy: r.locked_by,
      lockedAt: r.locked_at,
      pmRate: r.pm_rate != null ? Number(r.pm_rate) : null,
      totalPersonMonths: pmTotals.get(r.participant_id) || 0,
      purchaseEquipmentJustification: r.purchase_equipment_justification || '',
      participantNumber: r.participants.participant_number,
      participantName: r.participants.organisation_name,
      participantShortName: r.participants.organisation_short_name,
      country: r.participants.country,
      organisationCategory: r.participants.organisation_category,
      hasInKind: r.has_in_kind ?? false,
      requestedPersonnelCosts: r.requested_personnel_costs != null ? Number(r.requested_personnel_costs) : null,
      requestedSubcontracting: r.requested_subcontracting != null ? Number(r.requested_subcontracting) : null,
      requestedTravel: r.requested_travel != null ? Number(r.requested_travel) : null,
      requestedEquipment: r.requested_equipment != null ? Number(r.requested_equipment) : null,
      requestedOtherGoods: r.requested_other_goods != null ? Number(r.requested_other_goods) : null,
      requestedFstp: r.requested_fstp != null ? Number(r.requested_fstp) : null,
      requestedInternallyInvoiced: r.requested_internally_invoiced != null ? Number(r.requested_internally_invoiced) : null,
      requestedIndirectCosts: r.requested_indirect_costs != null ? Number(r.requested_indirect_costs) : null,
    }));

    mapped.sort((a, b) => a.participantNumber - b.participantNumber);
    // Stabilise row references: reuse existing row objects whose data
    // hasn't changed, so React/memoized children can skip re-rendering.
    setRows(prev => {
      const existingByParticipant = new Map(prev.map(r => [r.participantId, r]));
      let anyChanged = prev.length !== mapped.length;
      const stabilised = mapped.map(newRow => {
        const existing = existingByParticipant.get(newRow.participantId);
        if (existing && JSON.stringify(existing) === JSON.stringify(newRow)) {
          return existing;
        }
        anyChanged = true;
        return newRow;
      });
      return anyChanged ? stabilised : prev;
    });
    hasLoadedRef.current = true;
    setLoading(false);
  }, [proposalId]);

  const fetchSubcontractingItems = useCallback(async () => {
    if (!proposalId || rows.length === 0) return;
    const rowIds = rows.map(r => r.id);
    const { data, error } = await supabase
      .from('budget_subcontracting_items')
      .select('*')
      .in('budget_row_id', rowIds)
      .order('order_index');

    if (error) {
      console.error('Error fetching subcontracting items:', error);
      return;
    }

    setSubcontractingItems((data || []).map((item: any) => ({
      id: item.id,
      budgetRowId: item.budget_row_id,
      description: item.description,
      amount: Number(item.amount) || 0,
      justification: item.justification,
      orderIndex: item.order_index,
    })));
  }, [proposalId, rows.map(r => r.id).join(',')]);

  const fetchEquipmentItems = useCallback(async () => {
    if (!proposalId || rows.length === 0) return;
    const rowIds = rows.map(r => r.id);
    const { data, error } = await supabase
      .from('budget_equipment_items')
      .select('*')
      .in('budget_row_id', rowIds)
      .order('order_index');

    if (error) {
      console.error('Error fetching equipment items:', error);
      return;
    }

    setEquipmentItems((data || []).map((item: any) => ({
      id: item.id,
      budgetRowId: item.budget_row_id,
      description: item.description,
      amount: Number(item.amount) || 0,
      justification: item.justification,
      orderIndex: item.order_index,
    })));
  }, [proposalId, rows.map(r => r.id).join(',')]);

  const fetchPersonnelBreakdown = useCallback(async () => {
    if (!proposalId || rows.length === 0) return;
    const rowIds = rows.map(r => r.id);
    const { data, error } = await supabase
      .from('budget_personnel_breakdown')
      .select('*')
      .in('budget_row_id', rowIds)
      .order('order_index');

    if (error) {
      console.error('Error fetching personnel breakdown:', error);
      return;
    }

    // Detect orphan duplicate rows: same budget_row_id + order_index, empty
    // values (no category, pm_count=0, pm_rate=0). Keep the first, drop the rest.
    const seen = new Map<string, any>();
    const orphanIds: string[] = [];
    for (const it of (data || [])) {
      const key = `${it.budget_row_id}::${it.order_index}`;
      const isEmpty = (!it.category || it.category === '') && Number(it.pm_count) === 0 && Number(it.pm_rate) === 0;
      if (seen.has(key) && isEmpty) {
        orphanIds.push(it.id);
      } else if (!seen.has(key)) {
        seen.set(key, it);
      }
    }
    if (orphanIds.length > 0) {
      await supabase.from('budget_personnel_breakdown').delete().in('id', orphanIds);
    }

    const cleaned = (data || []).filter((it: any) => !orphanIds.includes(it.id));
    const items: PersonnelBreakdownItem[] = cleaned.map((item: any) => ({
      id: item.id,
      budgetRowId: item.budget_row_id,
      category: item.category || '',
      pmCount: Number(item.pm_count) || 0,
      pmRate: Number(item.pm_rate) || 0,
      orderIndex: item.order_index,
    }));

    // Seed a default row for any budget row that ended up empty and where the
    // current user can edit (unlocked or locked by them). Runs exactly once
    // per fetch, with full DB knowledge — no race with the component.
    const rowsWithItems = new Set(items.map(i => i.budgetRowId));
    const editableRowIds = rowIds.filter(rid => {
      const r = rows.find(x => x.id === rid);
      if (!r) return false;
      if (!r.isLocked) return true;
      return r.lockedBy === user?.id;
    });
    const toSeed = editableRowIds.filter(
      rid => !rowsWithItems.has(rid) && !seedingRef.current.has(rid)
    );

    for (const rid of toSeed) {
      seedingRef.current.add(rid);
      const { data: inserted, error: insErr } = await supabase
        .from('budget_personnel_breakdown')
        .insert({
          budget_row_id: rid,
          category: 'Average weighted PM',
          pm_count: 0,
          pm_rate: 0,
          order_index: 0,
        })
        .select()
        .single();
      seedingRef.current.delete(rid);
      if (!insErr && inserted) {
        items.push({
          id: inserted.id,
          budgetRowId: inserted.budget_row_id,
          category: inserted.category || '',
          pmCount: Number(inserted.pm_count) || 0,
          pmRate: Number(inserted.pm_rate) || 0,
          orderIndex: inserted.order_index,
        });
      }
    }

    setPersonnelBreakdown(items);
    setPersonnelLoaded(new Set(rowIds));
  }, [proposalId, rows.map(r => r.id).join(','), user?.id]);

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

  // Re-fetch when effort data changes (e.g. from A3 effort matrix edits).
  // The source event in A3EffortMatrix is already coalesced behind an 800ms
  // flush timer, so fetch immediately here — no second debounce needed.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.proposalId !== proposalId) return;
      fetchRows();
    };
    window.addEventListener('effort-data-changed', handler);
    return () => {
      window.removeEventListener('effort-data-changed', handler);
    };
  }, [proposalId, fetchRows]);


  useEffect(() => {
    if (!loading && proposalId) {
      initializeRows();
    }
  }, [loading, proposalId]);

  useEffect(() => {
    if (rows.length > 0) {
      fetchJustifications();
      fetchSubcontractingItems();
      fetchEquipmentItems();
      fetchPersonnelBreakdown();
    }
  }, [rows.length > 0, fetchJustifications, fetchSubcontractingItems, fetchPersonnelBreakdown]);

  // Sync subcontracting_costs on budget_rows from line items
  const syncSubcontractingTotal = useCallback(async (budgetRowId: string) => {
    const items = subcontractingItems.filter(i => i.budgetRowId === budgetRowId);
    const total = items.reduce((sum, i) => sum + i.amount, 0);
    
    setRows(prev => prev.map(r => r.id === budgetRowId ? { ...r, subcontractingCosts: total } : r));
    
    await supabase.from('budget_rows').update({ subcontracting_costs: total }).eq('id', budgetRowId);
  }, [subcontractingItems]);

  const addSubcontractingItem = useCallback(async (budgetRowId: string) => {
    const existing = subcontractingItems.filter(i => i.budgetRowId === budgetRowId);
    const nextIndex = existing.length;

    const { data, error } = await supabase
      .from('budget_subcontracting_items')
      .insert({
        budget_row_id: budgetRowId,
        description: '',
        amount: 0,
        justification: '',
        order_index: nextIndex,
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to add subcontracting item');
      return;
    }

    setSubcontractingItems(prev => [...prev, {
      id: data.id,
      budgetRowId: data.budget_row_id,
      description: data.description,
      amount: Number(data.amount) || 0,
      justification: data.justification,
      orderIndex: data.order_index,
    }]);
  }, [subcontractingItems]);

  const updateSubcontractingItem = useCallback((itemId: string, field: string, value: string | number) => {
    setSubcontractingItems(prev => prev.map(i => i.id === itemId ? { ...i, [field]: value } : i));

    if (debounceTimers.current[`sub-${itemId}`]) {
      clearTimeout(debounceTimers.current[`sub-${itemId}`]);
    }

    debounceTimers.current[`sub-${itemId}`] = setTimeout(async () => {
      setSaving(true);
      const { error } = await supabase
        .from('budget_subcontracting_items')
        .update({ [field]: value })
        .eq('id', itemId);

      if (error) {
        toast.error('Failed to save subcontracting item');
      }

      // If amount changed, sync total
      if (field === 'amount') {
        const item = subcontractingItems.find(i => i.id === itemId);
        if (item) {
          const budgetRowId = item.budgetRowId;
          const otherItems = subcontractingItems.filter(i => i.budgetRowId === budgetRowId && i.id !== itemId);
          const total = otherItems.reduce((sum, i) => sum + i.amount, 0) + Number(value);
          setRows(prev => prev.map(r => r.id === budgetRowId ? { ...r, subcontractingCosts: total } : r));
          await supabase.from('budget_rows').update({ subcontracting_costs: total }).eq('id', budgetRowId);
        }
      }

      setSaving(false);
    }, 300);
  }, [subcontractingItems]);

  const deleteSubcontractingItem = useCallback(async (itemId: string) => {
    const item = subcontractingItems.find(i => i.id === itemId);
    if (!item) return;

    const { error } = await supabase.from('budget_subcontracting_items').delete().eq('id', itemId);
    if (error) {
      toast.error('Failed to delete subcontracting item');
      return;
    }

    const remaining = subcontractingItems.filter(i => i.id !== itemId);
    setSubcontractingItems(remaining);

    // Sync total
    const budgetRowId = item.budgetRowId;
    const total = remaining.filter(i => i.budgetRowId === budgetRowId).reduce((sum, i) => sum + i.amount, 0);
    setRows(prev => prev.map(r => r.id === budgetRowId ? { ...r, subcontractingCosts: total } : r));
    await supabase.from('budget_rows').update({ subcontracting_costs: total }).eq('id', budgetRowId);
  }, [subcontractingItems]);

  // Equipment item CRUD
  const syncEquipmentTotal = useCallback(async (budgetRowId: string, items: EquipmentItem[]) => {
    const total = items.filter(i => i.budgetRowId === budgetRowId).reduce((sum, i) => sum + i.amount, 0);
    setRows(prev => prev.map(r => r.id === budgetRowId ? { ...r, purchaseEquipment: total } : r));
    await supabase.from('budget_rows').update({ purchase_equipment: total }).eq('id', budgetRowId);
  }, []);

  const addEquipmentItem = useCallback(async (budgetRowId: string) => {
    const existing = equipmentItems.filter(i => i.budgetRowId === budgetRowId);
    const nextIndex = existing.length;

    const { data, error } = await supabase
      .from('budget_equipment_items')
      .insert({
        budget_row_id: budgetRowId,
        description: '',
        amount: 0,
        justification: '',
        order_index: nextIndex,
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to add equipment item');
      return;
    }

    setEquipmentItems(prev => [...prev, {
      id: data.id,
      budgetRowId: data.budget_row_id,
      description: data.description,
      amount: Number(data.amount) || 0,
      justification: data.justification,
      orderIndex: data.order_index,
    }]);
  }, [equipmentItems]);

  const updateEquipmentItem = useCallback((itemId: string, field: string, value: string | number) => {
    setEquipmentItems(prev => prev.map(i => i.id === itemId ? { ...i, [field]: value } : i));

    if (debounceTimers.current[`equip-${itemId}`]) {
      clearTimeout(debounceTimers.current[`equip-${itemId}`]);
    }

    debounceTimers.current[`equip-${itemId}`] = setTimeout(async () => {
      setSaving(true);
      const { error } = await supabase
        .from('budget_equipment_items')
        .update({ [field]: value })
        .eq('id', itemId);

      if (error) {
        toast.error('Failed to save equipment item');
      }

      if (field === 'amount') {
        const item = equipmentItems.find(i => i.id === itemId);
        if (item) {
          const budgetRowId = item.budgetRowId;
          const otherItems = equipmentItems.filter(i => i.budgetRowId === budgetRowId && i.id !== itemId);
          const total = otherItems.reduce((sum, i) => sum + i.amount, 0) + Number(value);
          setRows(prev => prev.map(r => r.id === budgetRowId ? { ...r, purchaseEquipment: total } : r));
          await supabase.from('budget_rows').update({ purchase_equipment: total }).eq('id', budgetRowId);
        }
      }

      setSaving(false);
    }, 300);
  }, [equipmentItems]);

  const deleteEquipmentItem = useCallback(async (itemId: string) => {
    const item = equipmentItems.find(i => i.id === itemId);
    if (!item) return;

    const { error } = await supabase.from('budget_equipment_items').delete().eq('id', itemId);
    if (error) {
      toast.error('Failed to delete equipment item');
      return;
    }

    const remaining = equipmentItems.filter(i => i.id !== itemId);
    setEquipmentItems(remaining);

    const budgetRowId = item.budgetRowId;
    const total = remaining.filter(i => i.budgetRowId === budgetRowId).reduce((sum, i) => sum + i.amount, 0);
    setRows(prev => prev.map(r => r.id === budgetRowId ? { ...r, purchaseEquipment: total } : r));
    await supabase.from('budget_rows').update({ purchase_equipment: total }).eq('id', budgetRowId);
  }, [equipmentItems]);

  // Personnel breakdown CRUD with weighted PM rate sync
  const syncWeightedPmRate = useCallback(async (budgetRowId: string, items: PersonnelBreakdownItem[]) => {
    const rowItems = items.filter(i => i.budgetRowId === budgetRowId);
    let newRate: number | null = null;
    if (rowItems.length > 0) {
      const totalPm = rowItems.reduce((s, i) => s + (i.pmCount || 0), 0);
      const totalCost = rowItems.reduce((s, i) => s + (i.pmCount || 0) * (i.pmRate || 0), 0);
      newRate = totalPm > 0 ? Math.round((totalCost / totalPm) * 100) / 100 : 0;
    }
    setRows(prev => prev.map(r => r.id === budgetRowId ? { ...r, pmRate: newRate } : r));
    await supabase.from('budget_rows').update({ pm_rate: newRate }).eq('id', budgetRowId);
  }, []);

  const addPersonnelBreakdownItem = useCallback(async (budgetRowId: string) => {
    const existing = personnelRef.current.filter(i => i.budgetRowId === budgetRowId);
    const nextIndex = existing.length;
    const { data, error } = await supabase
      .from('budget_personnel_breakdown')
      .insert({ budget_row_id: budgetRowId, category: '', pm_count: 0, pm_rate: 0, order_index: nextIndex })
      .select()
      .single();
    if (error) {
      toast.error('Failed to add personnel row');
      return;
    }
    const mapped: PersonnelBreakdownItem = {
      id: data.id,
      budgetRowId: data.budget_row_id,
      category: data.category || '',
      pmCount: Number(data.pm_count) || 0,
      pmRate: Number(data.pm_rate) || 0,
      orderIndex: data.order_index,
    };
    let snapshot: PersonnelBreakdownItem[] = [];
    setPersonnelBreakdown(prev => {
      snapshot = [...prev, mapped];
      return snapshot;
    });
    await syncWeightedPmRate(budgetRowId, snapshot);
  }, [syncWeightedPmRate]);

  const updatePersonnelBreakdownItem = useCallback((itemId: string, field: 'category' | 'pmCount' | 'pmRate', value: string | number) => {
    setPersonnelBreakdown(prev => prev.map(i => i.id === itemId ? { ...i, [field]: value } : i));
    if (debounceTimers.current[`pb-${itemId}`]) clearTimeout(debounceTimers.current[`pb-${itemId}`]);
    debounceTimers.current[`pb-${itemId}`] = setTimeout(async () => {
      setSaving(true);
      const dbField = field === 'pmCount' ? 'pm_count' : field === 'pmRate' ? 'pm_rate' : 'category';
      const { error } = await supabase
        .from('budget_personnel_breakdown')
        .update({ [dbField]: value })
        .eq('id', itemId);
      if (error) toast.error('Failed to save personnel row');
      if (field === 'pmCount' || field === 'pmRate') {
        const item = personnelBreakdown.find(i => i.id === itemId);
        if (item) {
          const updated = personnelBreakdown.map(i => i.id === itemId ? { ...i, [field]: Number(value) } : i);
          await syncWeightedPmRate(item.budgetRowId, updated);
        }
      }
      setSaving(false);
    }, 300);
  }, [personnelBreakdown, syncWeightedPmRate]);

  const deletePersonnelBreakdownItem = useCallback(async (itemId: string) => {
    const item = personnelBreakdown.find(i => i.id === itemId);
    if (!item) return;
    const { error } = await supabase.from('budget_personnel_breakdown').delete().eq('id', itemId);
    if (error) {
      toast.error('Failed to delete personnel row');
      return;
    }
    const remaining = personnelBreakdown.filter(i => i.id !== itemId);
    setPersonnelBreakdown(remaining);
    await syncWeightedPmRate(item.budgetRowId, remaining);
  }, [personnelBreakdown, syncWeightedPmRate]);


  const updateRow = useCallback((rowId: string, field: string, value: number | string | boolean) => {
    // For hasInKind, ensure local state gets a boolean
    const localValue = field === 'hasInKind' ? Boolean(value) : value;
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, [field]: localValue } : r));

    if (debounceTimers.current[rowId]) {
      clearTimeout(debounceTimers.current[rowId]);
    }

    debounceTimers.current[rowId] = setTimeout(async () => {
      const row = rows.find(r => r.id === rowId);
      if (!row) return;

      // Map camelCase field to snake_case DB column
      const fieldToDbMap: Record<string, string> = {
        requestedEuContributionOverride: 'requested_eu_contribution',
      };
      const dbField = fieldToDbMap[field] ?? field.replace(/([A-Z])/g, '_$1').toLowerCase();
      const dbValue = field === 'hasInKind' ? Boolean(value) : value;
      setSaving(true);
      const { error } = await supabase
        .from('budget_rows')
        .update({ [dbField]: dbValue })
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

  const lockAllRows = useCallback(async () => {
    if (!user) return;
    const ids = rows.filter(r => !r.isLocked).map(r => r.id);
    if (ids.length === 0) return;
    const { error } = await supabase
      .from('budget_rows')
      .update({ is_locked: true, locked_by: user.id, locked_at: new Date().toISOString() })
      .eq('proposal_id', proposalId)
      .in('id', ids);
    if (error) {
      toast.error('Failed to lock all rows');
      return;
    }
    setRows(prev => prev.map(r => ids.includes(r.id) ? { ...r, isLocked: true, lockedBy: user.id, lockedAt: new Date().toISOString() } : r));
    toast.success('All participant budgets locked');
  }, [user, rows, proposalId]);

  const unlockAllRows = useCallback(async () => {
    const ids = rows.filter(r => r.isLocked).map(r => r.id);
    if (ids.length === 0) return;
    const { error } = await supabase
      .from('budget_rows')
      .update({ is_locked: false, locked_by: null, locked_at: null })
      .eq('proposal_id', proposalId)
      .in('id', ids);
    if (error) {
      toast.error('Failed to unlock all rows');
      return;
    }
    setRows(prev => prev.map(r => ids.includes(r.id) ? { ...r, isLocked: false, lockedBy: null, lockedAt: null } : r));
    toast.success('All participant budgets unlocked');
  }, [rows, proposalId]);

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
      financialSupportThirdParties: 0,
      internallyInvoiced: 0,
      procurement: 0,
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
      sums.financialSupportThirdParties += r.financialSupportThirdParties;
      sums.internallyInvoiced += r.internallyInvoiced;
      sums.procurement += r.procurement;
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
    subcontractingItems,
    equipmentItems,
    personnelBreakdown,
    grandTotals,
    loading,
    saving,
    updateRow,
    updateRoleLabel,
    lockRow,
    unlockRow,
    lockAllRows,
    unlockAllRows,
    saveJustification,
    addSubcontractingItem,
    updateSubcontractingItem,
    deleteSubcontractingItem,
    addEquipmentItem,
    updateEquipmentItem,
    deleteEquipmentItem,
    addPersonnelBreakdownItem,
    updatePersonnelBreakdownItem,
    deletePersonnelBreakdownItem,
    refetch: fetchRows,
  };
}
