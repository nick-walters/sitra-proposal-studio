import { useEffect, useMemo } from 'react';
import { ParticipantBubble, WPBubble } from '@/components/B31Pill';
import { CollapsibleHeader, lsCollapseStorageKey, useLsCollapse } from '@/components/LumpSumDepreciationSection';
import { formatCurrency } from '@/lib/formatNumber';
import { useLumpSumPersonnel } from '@/hooks/useLumpSumPersonnel';
import { useLumpSumCosts } from '@/hooks/useLumpSumCosts';
import { useLumpSumDepreciation } from '@/hooks/useLumpSumDepreciation';
import { useLumpSumTotals } from '@/hooks/useLumpSumTotals';
import { buildWpInputs, computeWpTotals, personMonthsForRoles, roundCents } from '@/lib/lumpSumFigures';
import { LS_COL, LS_FIGURE_CELL } from '@/lib/lumpSumLayout';

/**
 * Consortium-wide, read-only overview of the lump sum budget: every participant
 * and every work package at once. Every figure comes from the shared module in
 * src/lib/lumpSumFigures.ts — nothing is calculated here.
 */

const PARTICIPANT_COL = 220;
const CELL = 'px-1.5 py-1';

type OverviewRow = {
  participantId: string;
  participantNumber: number | null;
  shortName: string;
  byWp: Record<string, { total: number; requested: number; personMonths: number }>;
  total: number;
  requested: number;
  personMonths: number;
};

function formatPM(value: number) {
  return value.toFixed(1);
}

export function LumpSumOverview({ proposalId, userId }: { proposalId: string; userId?: string }) {
  const personnel = useLumpSumPersonnel(proposalId);
  const costs = useLumpSumCosts(proposalId);
  const depreciation = useLumpSumDepreciation(proposalId);
  const totals = useLumpSumTotals(proposalId);
  const { isCollapsed, toggle, setAll } = useLsCollapse(userId, proposalId);

  useEffect(() => {
    const key = lsCollapseStorageKey(userId, proposalId);
    try {
      if (localStorage.getItem(key) == null) setAll(false);
    } catch {
      // Collapse preferences are optional and local-only.
    }
  }, [proposalId, setAll, userId]);

  const workPackages = personnel.data?.workPackages ?? [];
  const participants = personnel.data?.participants ?? [];
  const efforts = personnel.data?.efforts ?? [];
  const allRoles = personnel.data?.roles ?? [];
  const costItems = costs.data?.items ?? [];
  const depreciationItems = depreciation.data?.items ?? [];
  const indirectRate = totals.data?.indirectCostRate ?? 0;
  const defaultFundingRate = totals.data?.defaultFundingRate ?? 0;

  const rows = useMemo<OverviewRow[]>(() => participants.map(participant => {
    const roles = allRoles.filter(role => role.participant_id === participant.id);
    const items = costItems.filter(item => item.participant_id === participant.id);
    const depreciationRows = depreciationItems.filter(item => item.participant_id === participant.id);
    const a4UnitCost = Number(personnel.data?.participantBudgets.find(budget => budget.participant_id === participant.id)?.a4_unit_cost ?? 0);
    const fundingRate = totals.data?.participantBudgets.find(budget => budget.participant_id === participant.id)?.funding_rate_override
      ?? defaultFundingRate;
    const inputs = buildWpInputs(roles, efforts, workPackages, a4UnitCost, items, depreciationRows);

    const byWp: OverviewRow['byWp'] = {};
    let total = 0;
    let requested = 0;
    let personMonths = 0;
    for (const wp of workPackages) {
      const stored = totals.data?.wpBudgets.find(row => row.participant_id === participant.id && row.wp_draft_id === wp.id)?.requested_eu_contribution ?? null;
      const wpTotals = computeWpTotals(inputs[wp.id] ?? { personnel: 0, subcontracting: 0, purchase: 0, other: 0 }, indirectRate, fundingRate, stored);
      const pm = personMonthsForRoles(roles, efforts, workPackages, wp.id);
      byWp[wp.id] = { total: wpTotals.totalCosts, requested: wpTotals.requestedEuContribution, personMonths: pm };
      total += wpTotals.totalCosts;
      requested += wpTotals.requestedEuContribution;
      personMonths += pm;
    }

    return {
      participantId: participant.id,
      participantNumber: participant.participant_number,
      shortName: participant.organisation_short_name || participant.organisation_name || '',
      byWp,
      total: roundCents(total),
      requested: roundCents(requested),
      personMonths,
    };
  }), [allRoles, costItems, defaultFundingRate, depreciationItems, efforts, indirectRate, participants, personnel.data?.participantBudgets, totals.data?.participantBudgets, totals.data?.wpBudgets, workPackages]);

  if (personnel.isLoading || costs.isLoading || depreciation.isLoading || totals.isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading consortium overview…</div>;
  }
  if (!participants.length) return <div className="p-4 text-sm text-muted-foreground">No participants found for this proposal.</div>;

  const table = (
    id: string,
    heading: string,
    pick: (cell: { total: number; requested: number; personMonths: number }) => number,
    pickRowTotal: (row: OverviewRow) => number,
    format: (value: number) => string,
    footLabel: string,
  ) => {
    const columnTotal = (wpId: string) => rows.reduce((sum, row) => sum + pick(row.byWp[wpId] ?? { total: 0, requested: 0, personMonths: 0 }), 0);
    const grandTotal = rows.reduce((sum, row) => sum + pickRowTotal(row), 0);
    const collapsed = isCollapsed(`ls-overview:${id}`);
    return <section className="border-b border-border">
      <CollapsibleHeader collapsed={collapsed} onToggle={() => toggle(`ls-overview:${id}`)} label={heading} level="major" className="gap-2 px-1">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">{heading}</span>
        {collapsed && <span className="shrink-0 text-sm font-semibold leading-none tabular-nums text-muted-foreground">{format(grandTotal)}</span>}
      </CollapsibleHeader>
      {!collapsed && <div className="overflow-x-auto pb-3">
        <table className="border-collapse text-xs" style={{ minWidth: PARTICIPANT_COL + (workPackages.length + 1) * LS_COL.summaryMoney }}>
          <colgroup>
            <col style={{ width: PARTICIPANT_COL }} />
            {workPackages.map(wp => <col key={wp.id} style={{ width: LS_COL.summaryMoney }} />)}
            <col style={{ width: LS_COL.figure }} />
          </colgroup>
          <thead>
            <tr className="border-b border-border">
              <th className={`sticky left-0 z-10 bg-background text-left font-semibold ${CELL}`}>Participant</th>
              {workPackages.map(wp => <th key={wp.id} className={`${CELL} text-right font-semibold`}>
                <span className="inline-flex" title={wp.short_name ? `WP${wp.number}: ${wp.short_name}` : (wp.title ?? `WP${wp.number}`)}>
                  <WPBubble wpNumber={wp.number} wpColor={wp.color} />
                </span>
              </th>)}
              <th className={`${LS_FIGURE_CELL} font-semibold`}>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => <tr key={row.participantId} className="border-b border-border/60">
              <td className={`sticky left-0 z-10 bg-background ${CELL}`}>
                <ParticipantBubble number={row.participantNumber} shortName={row.shortName} />
              </td>
              {workPackages.map(wp => <td key={wp.id} className={`${CELL} text-right tabular-nums`}>
                {format(pick(row.byWp[wp.id] ?? { total: 0, requested: 0, personMonths: 0 }))}
              </td>)}
              <td className={`${LS_FIGURE_CELL} font-semibold`}>{format(pickRowTotal(row))}</td>
            </tr>)}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-foreground/40">
              <td className={`sticky left-0 z-10 bg-background font-semibold ${CELL}`}>{footLabel}</td>
              {workPackages.map(wp => <td key={wp.id} className={`${CELL} text-right font-semibold tabular-nums`}>{format(columnTotal(wp.id))}</td>)}
              <td className={`${LS_FIGURE_CELL} font-semibold`}>{format(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>}
    </section>;
  };

  return <div className="space-y-2">
    <div className="text-xs text-muted-foreground">Read-only. The whole consortium at once; figures come from each participant's lump sum budget.</div>
    {table('total-costs', 'Total costs (F) by participant and work package', cell => cell.total, row => row.total, formatCurrency, 'Consortium total')}
    {table('requested', 'Lump sum breakdown — requested EU contribution (H)', cell => cell.requested, row => row.requested, formatCurrency, 'Total requested lump sum')}
    {table('person-months', 'Person months by participant and work package', cell => cell.personMonths, row => row.personMonths, formatPM, 'Consortium total')}
  </div>;
}
