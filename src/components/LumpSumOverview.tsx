import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/formatNumber';
import { ParticipantBubble, WPBubble } from '@/components/B31Pill';
import { CollapsibleHeader } from '@/components/LumpSumDepreciationSection';
import { costLineTotals } from '@/components/LumpSumPersonnelTable';
import { useLumpSumPersonnel } from '@/hooks/useLumpSumPersonnel';
import { useLumpSumCosts } from '@/hooks/useLumpSumCosts';
import { useLumpSumDepreciation } from '@/hooks/useLumpSumDepreciation';
import { computeWpTotals, useLumpSumTotals } from '@/hooks/useLumpSumTotals';
import { LUMP_SUM_VALIDATION_QUERY_KEY } from '@/hooks/useLumpSumValidation';
import { LS_COL, LS_FIGURE_CELL, LS_LABEL_CELL } from '@/lib/lumpSumLayout';

/**
 * Consortium-wide, read-only overview of the lump sum budget.
 *
 * Every figure here comes from the existing hooks and the existing shared
 * calculations — costLineTotals for personnel, the generated ls_cost_items
 * amount and charged depreciation for B–D, and computeWpTotals for F and H.
 * Nothing is recomputed from source rows and nothing is written.
 */

const C_LINES = new Set(['C.1', 'C.2.infrastructure', 'C.2.equipment', 'C.2.other_assets', 'C.3.consumables', 'C.3.meetings', 'C.3.dissemination', 'C.3.publication', 'C.3.other']);
const D_LINES = new Set(['D.1', 'D.2']);
const PERSONNEL_LINES = ['A.1', 'A.2', 'A.3', 'A.4'];

const PARTICIPANT_COL = 220;

function formatPm(value: number) {
  return value.toFixed(1);
}

type Row = {
  participantId: string;
  participantNumber: number | null;
  shortName: string;
  byWp: Record<string, { totalCosts: number; requested: number; pm: number; matrixPm: number }>;
  totalCosts: number;
  requested: number;
  pm: number;
};

export function LumpSumOverview({ proposalId }: { proposalId: string }) {
  const personnel = useLumpSumPersonnel(proposalId);
  const costs = useLumpSumCosts(proposalId);
  const depreciation = useLumpSumDepreciation(proposalId);
  const totals = useLumpSumTotals(proposalId);
  const [open, setOpen] = useState({ costs: true, requested: true, pm: true });

  /**
   * Shares the validation hook's cache entry: the same read-only effort query,
   * so there is one wp_draft_effort fetch, not two. Nothing writes to it.
   */
  const effortQuery = useQuery({
    queryKey: LUMP_SUM_VALIDATION_QUERY_KEY(proposalId),
    enabled: Boolean(proposalId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wp_draft_effort')
        .select('wp_draft_id, participant_id, person_months, wp_drafts!inner(proposal_id)')
        .eq('wp_drafts.proposal_id', proposalId);
      if (error) throw error;
      return (data ?? []) as { wp_draft_id: string; participant_id: string; person_months: number }[];
    },
  });

  const isLoading = personnel.isLoading || costs.isLoading || depreciation.isLoading || totals.isLoading || effortQuery.isLoading;

  const workPackages = personnel.data?.workPackages ?? [];

  const rows = useMemo<Row[]>(() => {
    const pData = personnel.data;
    const tData = totals.data;
    if (!pData || !tData) return [];
    const costItems = costs.data?.items ?? [];
    const depItems = depreciation.data?.items ?? [];
    const matrixEffort = effortQuery.data ?? [];

    return pData.participants.map(participant => {
      const roles = pData.roles.filter(role => role.participant_id === participant.id);
      const efforts = pData.efforts;
      const a4UnitCost = Number(pData.participantBudgets.find(budget => budget.participant_id === participant.id)?.a4_unit_cost ?? 0);
      const inputs: Record<string, { personnel: number; subcontracting: number; purchase: number; other: number }> = {};
      for (const wp of pData.workPackages) inputs[wp.id] = { personnel: 0, subcontracting: 0, purchase: 0, other: 0 };

      const addPersonnelGroup = (line: string, groupRoles: typeof roles) => {
        const groupTotals = costLineTotals(line, groupRoles, efforts, pData.workPackages, a4UnitCost);
        const rate = groupTotals.totalPm ? groupTotals.portalCost / groupTotals.totalPm : 0;
        for (const wp of pData.workPackages) {
          const pm = groupRoles.reduce((sum, role) => sum + Number(efforts.find(effort => effort.role_id === role.id && effort.wp_draft_id === wp.id)?.person_months || 0), 0);
          inputs[wp.id].personnel += rate * pm;
        }
      };
      for (const line of PERSONNEL_LINES) {
        const lineRoles = roles.filter(role => role.cost_line === line);
        if (line === 'A.1') {
          const categories = [...new Set(lineRoles.map(role => role.he_category || 'blank'))];
          for (const category of categories) addPersonnelGroup(line, lineRoles.filter(role => (role.he_category || 'blank') === category));
        } else {
          addPersonnelGroup(line, lineRoles);
        }
      }
      for (const item of costItems) {
        if (item.participant_id !== participant.id) continue;
        const target = inputs[item.wp_draft_id];
        if (!target) continue;
        const amount = Number(item.amount ?? 0);
        if (item.cost_line === 'B.1') target.subcontracting += amount;
        else if (C_LINES.has(item.cost_line)) target.purchase += amount;
        else if (D_LINES.has(item.cost_line)) target.other += amount;
      }
      for (const item of depItems) {
        if (item.participant_id !== participant.id || !item.include_in_c2) continue;
        const target = inputs[item.wp_draft_id];
        if (target) target.purchase += Number(item.charged_depreciation ?? 0);
      }

      const fundingRate = Number(
        tData.participantBudgets.find(budget => budget.participant_id === participant.id)?.funding_rate_override
        ?? tData.defaultFundingRate,
      );

      const byWp: Row['byWp'] = {};
      let totalCosts = 0;
      let requested = 0;
      let pmTotal = 0;
      for (const wp of pData.workPackages) {
        const stored = tData.wpBudgets.find(row => row.participant_id === participant.id && row.wp_draft_id === wp.id)?.requested_eu_contribution ?? null;
        const wpTotals = computeWpTotals(inputs[wp.id], tData.indirectCostRate, fundingRate, stored);
        const pm = roles.reduce((sum, role) => sum + Number(efforts.find(effort => effort.role_id === role.id && effort.wp_draft_id === wp.id)?.person_months || 0), 0);
        const matrixPm = matrixEffort
          .filter(row => row.wp_draft_id === wp.id && row.participant_id === participant.id)
          .reduce((sum, row) => sum + Number(row.person_months || 0), 0);
        byWp[wp.id] = { totalCosts: wpTotals.totalCosts, requested: wpTotals.requestedEuContribution, pm, matrixPm };
        totalCosts += wpTotals.totalCosts;
        requested += wpTotals.requestedEuContribution;
        pmTotal += pm;
      }

      return {
        participantId: participant.id,
        participantNumber: participant.participant_number,
        shortName: participant.organisation_short_name || participant.organisation_name,
        byWp,
        totalCosts,
        requested,
        pm: pmTotal,
      };
    });
  }, [costs.data?.items, depreciation.data?.items, effortQuery.data, personnel.data, totals.data]);

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading consortium overview…</div>;
  if (!rows.length) return <div className="p-4 text-sm text-muted-foreground">No participants found for this proposal.</div>;

  const table = (
    kind: 'costs' | 'requested' | 'pm',
  ) => {
    const isMoney = kind !== 'pm';
    const value = (cell: Row['byWp'][string]) => kind === 'costs' ? cell.totalCosts : kind === 'requested' ? cell.requested : cell.pm;
    const rowTotal = (row: Row) => kind === 'costs' ? row.totalCosts : kind === 'requested' ? row.requested : row.pm;
    const render = (amount: number) => isMoney ? formatCurrency(amount) : formatPm(amount);
    const columnTotal = (wpId: string) => rows.reduce((sum, row) => sum + value(row.byWp[wpId]), 0);
    const grandTotal = rows.reduce((sum, row) => sum + rowTotal(row), 0);

    return <div className="overflow-x-auto">
      <table className="w-max table-fixed border-collapse text-xs">
        <colgroup>
          <col style={{ width: PARTICIPANT_COL }} />
          {workPackages.map(wp => <col key={wp.id} style={{ width: LS_COL.summaryNarrow }} />)}
          <col style={{ width: LS_COL.figure }} />
        </colgroup>
        <thead>
          <tr className="border-b border-border">
            <th className="sticky left-0 z-10 bg-background px-1 py-1 text-left font-semibold">Participant</th>
            {workPackages.map(wp => <th key={wp.id} className={`${LS_FIGURE_CELL} py-1 font-semibold`}>
              <span className="inline-flex" title={wp.short_name ? `WP${wp.number}: ${wp.short_name}` : (wp.title ?? `WP${wp.number}`)}>
                <WPBubble wpNumber={wp.number} wpColor={wp.color} />
              </span>
            </th>)}
            <th className={`${LS_FIGURE_CELL} py-1 font-semibold`}>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => <tr key={row.participantId} className="border-b border-border/60">
            <td className="sticky left-0 z-10 bg-background px-1 py-1">
              <ParticipantBubble number={row.participantNumber} shortName={row.shortName} />
            </td>
            {workPackages.map(wp => {
              const cell = row.byWp[wp.id];
              const mismatch = kind === 'pm' && Math.abs(cell.pm - cell.matrixPm) >= 0.05;
              return <td
                key={wp.id}
                className={`${LS_FIGURE_CELL} py-1 ${mismatch ? 'bg-amber-100 font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100' : ''}`}
                title={mismatch ? `Effort matrix: ${formatPm(cell.matrixPm)} PM` : undefined}
              >{render(value(cell))}</td>;
            })}
            <td className={`${LS_FIGURE_CELL} py-1 font-semibold`}>{render(rowTotal(row))}</td>
          </tr>)}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-foreground/40">
            <td className={`sticky left-0 z-10 bg-background ${LS_LABEL_CELL} py-1 font-semibold`}>
              {kind === 'costs' ? 'Consortium total' : kind === 'requested' ? 'Total requested lump sum' : 'Consortium person-months'}
            </td>
            {workPackages.map(wp => <td key={wp.id} className={`${LS_FIGURE_CELL} py-1 font-semibold`}>{render(columnTotal(wp.id))}</td>)}
            <td className={`${LS_FIGURE_CELL} py-1 font-semibold`}>{render(grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>;
  };

  const section = (kind: 'costs' | 'requested' | 'pm', heading: string) => <section className="border-b border-border">
    <CollapsibleHeader collapsed={!open[kind]} onToggle={() => setOpen(state => ({ ...state, [kind]: !state[kind] }))} label={heading} level="major">
      <span className="min-w-0 flex-1 truncate text-base font-semibold leading-none">{heading}</span>
    </CollapsibleHeader>
    {open[kind] && <div className="pb-3">{table(kind)}</div>}
  </section>;

  return <div className="space-y-2">
    {section('costs', 'Total costs (F) by participant and work package')}
    {section('requested', 'Lump sum breakdown — requested EU contribution (H)')}
    {section('pm', 'Person-months by participant and work package')}
  </div>;
}
