import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WPBubble } from '@/components/B31Pill';
import { CollapseChevron } from '@/components/cards/CollapseChevron';
import { formatCurrency } from '@/lib/formatNumber';
import { useLumpSumPersonnel } from '@/hooks/useLumpSumPersonnel';
import { useLumpSumCosts } from '@/hooks/useLumpSumCosts';
import { useLumpSumDepreciation } from '@/hooks/useLumpSumDepreciation';
import { computeWpTotals, roundCents, useLumpSumTotals } from '@/hooks/useLumpSumTotals';

/**
 * Read-only mirror of the EU Funding and Tenders portal budget form. It reads
 * the same hooks the input surface reads and writes nothing: the only state it
 * owns is per-user copy progress in localStorage.
 */

/** Official portal wording for the A.1 sub-lines, in portal order. */
const A1_CATEGORIES: Array<[string, string]> = [
  ['senior_scientist', 'Senior Scientists (or equivalent in the private sector)'],
  ['junior_scientist', 'Junior Scientists (or equivalent in the private sector)'],
  ['technical', 'Technical Personnel (or equivalent in the private sector)'],
  ['administrative', 'Administrative Personnel (or equivalent in the private sector)'],
  ['others', 'Others'],
];

const C2_SUBLINES: Array<[string, string]> = [
  ['C.2.infrastructure', 'Infrastructure'],
  ['C.2.equipment', 'Equipment'],
  ['C.2.other_assets', 'Other assets'],
];

const C3_SUBLINES: Array<[string, string]> = [
  ['C.3.consumables', 'Consumables'],
  ['C.3.meetings', 'Services for meetings, seminars'],
  ['C.3.dissemination', 'Services for dissemination activities (including website)'],
  ['C.3.publication', 'Publication fees'],
  ['C.3.other', 'Other (shipment, insurance, translation, etc.)'],
];

/** Clipboard payload: digits and a decimal point only, never formatted money. */
function rawValue(value: number, decimals: number) {
  return value.toFixed(decimals);
}

function formatPM(value: number) {
  return value.toFixed(1);
}

const PROGRESS_KEY = (userId: string | undefined, proposalId: string, participantId: string) =>
  `ls-portal-copied:${userId ?? 'anon'}:${proposalId}:${participantId}`;

function useCopyProgress(userId: string | undefined, proposalId: string, participantId: string) {
  const key = PROGRESS_KEY(userId, proposalId, participantId);
  const [copied, setCopied] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      setCopied(new Set<string>(raw ? (JSON.parse(raw) as string[]) : []));
    } catch {
      setCopied(new Set<string>());
    }
  }, [key]);

  const persist = useCallback((next: Set<string>) => {
    setCopied(next);
    try {
      window.localStorage.setItem(key, JSON.stringify([...next]));
    } catch {
      /* storage unavailable: progress is a convenience only */
    }
  }, [key]);

  return {
    copied,
    mark: (id: string) => persist(new Set([...copied, id])),
    reset: () => persist(new Set<string>()),
  };
}

function CopyValue({ text, display, id, copied, onCopied, className }: {
  text: string;
  display: string;
  id: string;
  copied: boolean;
  onCopied: (id: string) => void;
  className?: string;
}) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard blocked: still mark progress so the user keeps their place */
    }
    onCopied(id);
  };
  return <span className={`inline-flex items-center justify-end gap-1 tabular-nums ${className ?? ''}`}>
    <span>{display}</span>
    <Button type="button" size="icon" variant="ghost" className="h-5 w-5 shrink-0" title={`Copy ${text}`} aria-label={`Copy ${text}`} onClick={copy}>
      {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
    </Button>
  </span>;
}

type Leaf = {
  id: string;
  label: string;
  indent: number;
  /** 'rate' rows carry quantity × unit rate = subtotal; 'amount' rows a single figure. */
  kind: 'rate' | 'amount';
  quantity?: number;
  quantityIsPm?: boolean;
  unitRate?: number;
  subtotal: number;
};

type Group = { heading: string; leaves: Leaf[] };

const CELL = 'px-1.5 py-1';

export function LumpSumPortalView({ proposalId, participantId, userId }: {
  proposalId: string;
  participantId: string;
  userId?: string;
}) {
  const personnel = useLumpSumPersonnel(proposalId);
  const costs = useLumpSumCosts(proposalId);
  const depreciation = useLumpSumDepreciation(proposalId);
  const totals = useLumpSumTotals(proposalId);
  const { copied, mark, reset } = useCopyProgress(userId, proposalId, participantId);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const workPackages = personnel.data?.workPackages ?? [];
  const efforts = personnel.data?.efforts ?? [];
  const roles = useMemo(
    () => (personnel.data?.roles ?? []).filter(role => role.participant_id === participantId),
    [personnel.data?.roles, participantId],
  );
  const a4UnitCost = Number(personnel.data?.participantBudgets.find(budget => budget.participant_id === participantId)?.a4_unit_cost ?? 0);
  const costItems = useMemo(
    () => (costs.data?.items ?? []).filter(item => item.participant_id === participantId),
    [costs.data?.items, participantId],
  );
  const depreciationItems = useMemo(
    () => (depreciation.data?.items ?? []).filter(item => item.participant_id === participantId && item.include_in_c2),
    [depreciation.data?.items, participantId],
  );
  const usesFstp = Boolean(costs.data?.usesFstp);
  const indirectRate = totals.data?.indirectCostRate ?? 0;
  const participantBudget = totals.data?.participantBudgets.find(budget => budget.participant_id === participantId);
  const fundingRate = participantBudget?.funding_rate_override ?? totals.data?.defaultFundingRate ?? 0;

  /** Person-months for a set of roles within one work package. */
  const pmFor = useCallback((roleIds: string[], wpId: string) => roleIds.reduce(
    (sum, roleId) => sum + Number(efforts.find(effort => effort.role_id === roleId && effort.wp_draft_id === wpId)?.person_months || 0),
    0,
  ), [efforts]);

  /**
   * The portal-rounded average weighted rate for a group of roles, over all of
   * the participant's work packages. This is the figure the portal stores, so
   * every per-work-package subtotal is derived from it rather than from the raw
   * role-by-role sum.
   */
  const groupRate = useCallback((groupRoles: typeof roles) => {
    const ids = groupRoles.map(role => role.id);
    const pm = workPackages.reduce((sum, wp) => sum + pmFor(ids, wp.id), 0);
    if (!pm) return 0;
    const trueCost = groupRoles.reduce((sum, role) => {
      const rate = role.cost_line === 'A.4' ? a4UnitCost : Number(role.pm_rate || 0);
      const rolePm = workPackages.reduce((inner, wp) => inner + pmFor([role.id], wp.id), 0);
      return sum + rate * rolePm;
    }, 0);
    return Math.round((trueCost / pm) * 100) / 100;
  }, [a4UnitCost, pmFor, roles, workPackages]);

  const lineTotal = useCallback((costLine: string, wpId: string) => costItems
    .filter(item => item.cost_line === costLine && item.wp_draft_id === wpId)
    .reduce((sum, item) => sum + Number(item.amount ?? 0), 0), [costItems]);

  const depreciationTotal = useCallback((costLine: string, wpId: string) => depreciationItems
    .filter(item => `C.2.${item.resource_type}` === costLine && item.wp_draft_id === wpId)
    .reduce((sum, item) => sum + Number(item.charged_depreciation ?? 0), 0), [depreciationItems]);

  const blocks = useMemo(() => workPackages.map(wp => {
    const groups: Group[] = [];

    // A.1: one line per official category, each at its rounded average rate.
    const a1Roles = roles.filter(role => role.cost_line === 'A.1');
    const a1Leaves: Leaf[] = A1_CATEGORIES.map(([value, label]) => {
      const groupRoles = a1Roles.filter(role => (role.he_category || 'blank') === value);
      const rate = groupRate(groupRoles);
      const pm = pmFor(groupRoles.map(role => role.id), wp.id);
      return { id: `${wp.id}:A1:${value}`, label, indent: 1, kind: 'rate' as const, quantity: pm, quantityIsPm: true, unitRate: rate, subtotal: roundCents(rate * pm) };
    });
    const a1Total = roundCents(a1Leaves.reduce((sum, leaf) => sum + leaf.subtotal, 0));

    const otherALines: Leaf[] = (['A.2', 'A.3', 'A.4'] as const).map((line, index) => {
      const groupRoles = roles.filter(role => role.cost_line === line);
      const rate = groupRate(groupRoles);
      const pm = pmFor(groupRoles.map(role => role.id), wp.id);
      const labels = [
        'A.2 Natural persons under direct contract (a2)',
        'A.3 Seconded persons (a3)',
        'A.4 SME owners and natural person beneficiaries (a4)',
      ];
      return { id: `${wp.id}:${line}`, label: labels[index], indent: 0, kind: 'rate' as const, quantity: pm, quantityIsPm: true, unitRate: rate, subtotal: roundCents(rate * pm) };
    });

    groups.push({
      heading: 'A. Direct personnel costs',
      leaves: [
        { id: `${wp.id}:A.1`, label: 'A.1 Employees (a1)', indent: 0, kind: 'amount', subtotal: a1Total },
        ...a1Leaves,
        ...otherALines,
      ],
    });

    const b1 = roundCents(lineTotal('B.1', wp.id));
    groups.push({
      heading: 'B. Direct subcontracting costs',
      leaves: [{ id: `${wp.id}:B.1`, label: 'Subcontracting (b1)', indent: 0, kind: 'rate', quantity: 1, unitRate: b1, subtotal: b1 }],
    });

    const c1 = roundCents(lineTotal('C.1', wp.id));
    const c2Leaves: Leaf[] = C2_SUBLINES.map(([key, label]) => {
      const value = roundCents(lineTotal(key, wp.id) + depreciationTotal(key, wp.id));
      return { id: `${wp.id}:${key}`, label, indent: 1, kind: 'rate' as const, quantity: 1, unitRate: value, subtotal: value };
    });
    const c2Total = roundCents(c2Leaves.reduce((sum, leaf) => sum + leaf.subtotal, 0));
    const c3Leaves: Leaf[] = C3_SUBLINES.map(([key, label]) => {
      const value = roundCents(lineTotal(key, wp.id));
      return { id: `${wp.id}:${key}`, label, indent: 1, kind: 'rate' as const, quantity: 1, unitRate: value, subtotal: value };
    });
    const c3Total = roundCents(c3Leaves.reduce((sum, leaf) => sum + leaf.subtotal, 0));
    groups.push({
      heading: 'C. Direct purchase costs',
      leaves: [
        { id: `${wp.id}:C.1`, label: 'C.1 Travel and subsistence (c1)', indent: 0, kind: 'rate', quantity: 1, unitRate: c1, subtotal: c1 },
        { id: `${wp.id}:C.2`, label: 'C.2 Equipment (c2)', indent: 0, kind: 'amount', subtotal: c2Total },
        ...c2Leaves,
        { id: `${wp.id}:C.3`, label: 'C.3 Other goods, works and services (c3)', indent: 0, kind: 'amount', subtotal: c3Total },
        ...c3Leaves,
      ],
    });

    const d1 = roundCents(lineTotal('D.1', wp.id));
    const d2 = roundCents(lineTotal('D.2', wp.id));
    groups.push({
      heading: 'D. Other cost categories',
      leaves: [
        ...(usesFstp ? [{ id: `${wp.id}:D.1`, label: 'D.1 Financial support to third parties (d1)', indent: 0, kind: 'amount' as const, subtotal: d1 }] : []),
        { id: `${wp.id}:D.2`, label: 'D.2 Internally invoiced goods and services (d2)', indent: 0, kind: 'amount', subtotal: d2 },
      ],
    });

    const wpTotals = computeWpTotals(
      {
        personnel: roundCents(a1Total + otherALines.reduce((sum, leaf) => sum + leaf.subtotal, 0)),
        subcontracting: b1,
        purchase: roundCents(c1 + c2Total + c3Total),
        other: roundCents(d1 + d2),
      },
      indirectRate,
      fundingRate,
      totals.data?.wpBudgets.find(row => row.participant_id === participantId && row.wp_draft_id === wp.id)?.requested_eu_contribution ?? null,
    );

    groups.push({
      heading: 'E. Indirect costs',
      leaves: [{ id: `${wp.id}:E`, label: 'E. Indirect costs (e)', indent: 0, kind: 'amount', subtotal: wpTotals.indirect }],
    });
    groups.push({
      heading: 'Total costs',
      leaves: [
        { id: `${wp.id}:F`, label: 'Total costs (f)', indent: 0, kind: 'amount', subtotal: wpTotals.totalCosts },
        { id: `${wp.id}:G`, label: 'Maximum EU contribution (g)', indent: 0, kind: 'amount', subtotal: wpTotals.maxEuContribution },
        { id: `${wp.id}:H`, label: 'Requested EU contribution (h)', indent: 0, kind: 'amount', subtotal: wpTotals.requestedEuContribution },
      ],
    });

    const comments = totals.data?.wpBudgets.find(row => row.participant_id === participantId && row.wp_draft_id === wp.id)?.comments ?? '';
    const fieldIds = [`${wp.id}:comments`, ...groups.flatMap(group => group.leaves.flatMap(leaf =>
      leaf.kind === 'amount' ? [leaf.id] : [`${leaf.id}:qty`, `${leaf.id}:rate`, `${leaf.id}:sub`]))];

    return { wp, groups, comments, fieldIds, fTotal: wpTotals.totalCosts };
  }), [depreciationTotal, fundingRate, groupRate, indirectRate, lineTotal, participantId, pmFor, roles, totals.data?.wpBudgets, usesFstp, workPackages]);

  if (personnel.isLoading || costs.isLoading || depreciation.isLoading || totals.isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading portal copy view…</div>;
  }

  const toggle = (id: string) => setExpanded(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return <div className="space-y-2">
    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>Read-only. Figures are laid out in the order the EU portal asks for them; each value copies as a raw number.</span>
      <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 px-2 text-xs" onClick={reset}>
        <RotateCcw className="mr-1 h-3 w-3" />Reset progress
      </Button>
    </div>

    {blocks.map(block => {
      const open = expanded.has(block.wp.id);
      const done = block.fieldIds.filter(id => copied.has(id)).length;
      return <section key={block.wp.id} className="border-b border-border">
        <div className="flex h-9 items-center gap-2 px-1">
          <CollapseChevron collapsed={!open} onToggle={() => toggle(block.wp.id)} label={`Work package ${block.wp.number}`} />
          <WPBubble wpNumber={block.wp.number} wpColor={block.wp.color} />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{block.wp.short_name || block.wp.title || ''}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{done} of {block.fieldIds.length} fields copied</span>
          <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(block.fTotal)}</span>
        </div>

        {open && <div className="space-y-3 pb-3 pl-6 pr-1">
          <div>
            <div className="text-xs font-semibold">Comments</div>
            <div className="mt-1 flex items-start gap-2 rounded-md border border-border p-2">
              <p className="min-w-0 flex-1 whitespace-pre-wrap text-xs">{block.comments || <span className="text-muted-foreground">No comment entered.</span>}</p>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-5 w-5 shrink-0"
                title="Copy comment"
                aria-label="Copy comment"
                onClick={async () => {
                  try { await navigator.clipboard.writeText(block.comments); } catch { /* clipboard blocked */ }
                  mark(`${block.wp.id}:comments`);
                }}
              >
                {copied.has(`${block.wp.id}:comments`) ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
              </Button>
            </div>
          </div>

          {block.groups.map(group => <div key={group.heading}>
            <div className="text-xs font-semibold">{group.heading}</div>
            <table className="w-full table-fixed border-collapse text-xs">
              <colgroup>
                <col />
                <col style={{ width: 130 }} />
                <col style={{ width: 16 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 16 }} />
                <col style={{ width: 170 }} />
              </colgroup>
              <tbody>
                {group.leaves.map(leaf => <tr key={leaf.id} className="border-t border-border/50">
                  <td className={CELL} style={{ paddingLeft: 6 + leaf.indent * 16 }}>{leaf.label}</td>
                  {leaf.kind === 'rate' ? <>
                    <td className={`${CELL} text-right`}>
                      <CopyValue
                        id={`${leaf.id}:qty`}
                        copied={copied.has(`${leaf.id}:qty`)}
                        onCopied={mark}
                        text={rawValue(leaf.quantity ?? 0, leaf.quantityIsPm ? 1 : 0)}
                        display={leaf.quantityIsPm ? formatPM(leaf.quantity ?? 0) : String(leaf.quantity ?? 0)}
                      />
                    </td>
                    <td className="text-center text-muted-foreground">×</td>
                    <td className={`${CELL} text-right`}>
                      <CopyValue
                        id={`${leaf.id}:rate`}
                        copied={copied.has(`${leaf.id}:rate`)}
                        onCopied={mark}
                        text={rawValue(leaf.unitRate ?? 0, 2)}
                        display={formatCurrency(leaf.unitRate ?? 0)}
                      />
                    </td>
                    <td className="text-center text-muted-foreground">=</td>
                    <td className={`${CELL} text-right`}>
                      <CopyValue
                        id={`${leaf.id}:sub`}
                        copied={copied.has(`${leaf.id}:sub`)}
                        onCopied={mark}
                        text={rawValue(leaf.subtotal, 2)}
                        display={formatCurrency(leaf.subtotal)}
                        className="font-semibold"
                      />
                    </td>
                  </> : <>
                    <td /><td /><td /><td />
                    <td className={`${CELL} text-right`}>
                      <CopyValue
                        id={leaf.id}
                        copied={copied.has(leaf.id)}
                        onCopied={mark}
                        text={rawValue(leaf.subtotal, 2)}
                        display={formatCurrency(leaf.subtotal)}
                        className="font-semibold"
                      />
                    </td>
                  </>}
                </tr>)}
              </tbody>
            </table>
          </div>)}
        </div>}
      </section>;
    })}
  </div>;
}
