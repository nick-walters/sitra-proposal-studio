import { useEffect, useMemo } from 'react';
import { ParticipantBubble, WPBubble } from '@/components/B31Pill';
import { CollapsibleHeader, lsCollapseStorageKey, useLsCollapse } from '@/components/LumpSumDepreciationSection';
import { Checkbox } from '@/components/ui/checkbox';
import { formatCurrency } from '@/lib/formatNumber';
import { useProposalData } from '@/hooks/useProposalData';
import { useLumpSumPersonnel } from '@/hooks/useLumpSumPersonnel';
import { useLumpSumCosts } from '@/hooks/useLumpSumCosts';
import { useLumpSumDepreciation } from '@/hooks/useLumpSumDepreciation';
import { useLumpSumTotals } from '@/hooks/useLumpSumTotals';
import { buildWpInputs, computeWpTotals, personMonthsForRoles, roundCents } from '@/lib/lumpSumFigures';
import { LS_COL, LS_FIGURE_CELL } from '@/lib/lumpSumLayout';

/**
 * Mirroring is stored on (proposal_id, cost_line) — it is a proposal-wide
 * setting, which is why it lives here rather than on a participant tab.
 */
const MIRROR_ROWS: { key: string; label: string; children?: { key: string; label: string }[] }[] = [
  { key: 'C.1', label: 'C.1 Travel and subsistence' },
  {
    key: 'C.2',
    label: 'C.2 Equipment',
    children: [
      { key: 'C.2.infrastructure', label: 'Infrastructure' },
      { key: 'C.2.equipment', label: 'Equipment' },
      { key: 'C.2.other_assets', label: 'Other assets' },
    ],
  },
  {
    key: 'C.3',
    label: 'C.3 Other goods, works and services',
    children: [
      { key: 'C.3.consumables', label: 'Consumables' },
      { key: 'C.3.meetings', label: 'Services for meetings, seminars' },
      { key: 'C.3.dissemination', label: 'Services for dissemination activities (including website)' },
      { key: 'C.3.publication', label: 'Publication fees' },
      { key: 'C.3.other', label: 'Other (shipment, insurance, translation, etc.)' },
    ],
  },
];

const C2_HELPER = 'Ticked mirrors all equipment; unticked mirrors only participants whose equipment exceeds 15% of their personnel costs.';

/** Coordinator-and-above only. The overview itself stays visible to everyone. */
function MirrorSettingsBlock({ proposalId, collapsed, onToggle }: { proposalId: string; collapsed: boolean; onToggle: () => void }) {
  const { data, setMirror, setMirrors } = useLumpSumCosts(proposalId);
  // Same proposal-level role check the checkboxes used before, mapping
  // owner/admin/coordinator exactly as the is_proposal_admin policy does.
  const { isCoordinator: canChangeMirroring } = useProposalData(proposalId);
  if (!canChangeMirroring) return null;
  const settings = data?.mirrorSettings ?? {};
  const hasC2SublineSettings = ['C.2.infrastructure', 'C.2.equipment', 'C.2.other_assets'].some(key => settings[key] !== undefined);
  const isChecked = (key: string) => Boolean(settings[key] || (key.startsWith('C.2.') && settings['C.2'] && !hasC2SublineSettings));

  const row = (key: string, label: string, checked: boolean | 'indeterminate', onChange: (next: boolean) => void, nested: boolean, helper?: string) =>
    <div key={key} className={nested ? 'pl-8' : ''}>
      <label className="flex items-center gap-2 py-1 text-xs">
        <Checkbox className="h-3.5 w-3.5" checked={checked} onCheckedChange={value => onChange(value === true)} />
        <span className={nested ? '' : 'font-semibold'}>{label}</span>
      </label>
      {helper && <p className="pb-1 pl-[22px] text-[11px] text-muted-foreground">{helper}</p>}
    </div>;

  return <section className="border-b border-border">
    <CollapsibleHeader collapsed={collapsed} onToggle={onToggle} label="Mirrored to Part B Table 3.1.h" level="major" className="gap-2 px-1">
      <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none">Mirrored to Part B Table 3.1.h</span>
    </CollapsibleHeader>
    {!collapsed && <div className="px-1 pb-3">
      <p className="pb-2 text-xs text-muted-foreground">These settings apply to the whole proposal, not to a single participant.</p>
      {MIRROR_ROWS.map(line => {
        if (!line.children) return row(line.key, line.label, isChecked(line.key), next => setMirror(line.key, next), false);
        const childStates = line.children.map(child => isChecked(child.key));
        const checked = childStates.every(Boolean);
        const indeterminate = childStates.some(Boolean) && !checked;
        const childKeys = line.children.map(child => child.key);
        return <div key={line.key}>
          {row(line.key, line.label, indeterminate ? 'indeterminate' : checked, next => setMirrors(childKeys, next), false, line.key === 'C.2' ? C2_HELPER : undefined)}
          {line.children.map(child => row(child.key, child.label, isChecked(child.key), next => setMirror(child.key, next), true))}
        </div>;
      })}
    </div>}
  </section>;
}

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
  // Read-only for everyone, so nothing here can be reseeded mid-edit.
  useLumpSumRealtime(proposalId, true);
  const { isCollapsed, toggle } = useLsCollapse(userId, proposalId);

  useEffect(() => {
    const key = lsCollapseStorageKey(userId, proposalId);
    try {
      if (localStorage.getItem(key) == null) {
        ['total-costs', 'requested', 'person-months'].forEach(id => toggle(`ls-overview:${id}`));
      }
    } catch {
      // Collapse preferences are optional and local-only.
    }
  }, [proposalId, toggle, userId]);

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
    <MirrorSettingsBlock proposalId={proposalId} collapsed={isCollapsed('ls-overview:mirrors')} onToggle={() => toggle('ls-overview:mirrors')} />
  </div>;
}
