import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { WPBubble } from '@/components/B31Pill';
import { formatCurrency, formatNumber } from '@/lib/formatNumber';
import { LS_COL, LS_FIGURE_CELL, LS_TABLE } from '@/lib/lumpSumLayout';
import { CollapsibleHeader, LINE_INDENT, useLsCollapse } from '@/components/LumpSumDepreciationSection';
import { WP_COMMENT_LIMIT, useLumpSumTotals, type LumpSumWpInputs } from '@/hooks/useLumpSumTotals';
import { computeWpTotals, requestedPercentage, roundCents } from '@/lib/lumpSumFigures';

/** Collapse ids are namespaced so they never clash with the A–D line ids. */
const COLLAPSE_TOTALS = 'ls-F';
const COLLAPSE_COMMENTS = 'ls-wp-comments';

const READ_CELL = `${LS_FIGURE_CELL} inline-flex h-7 w-full items-center justify-end rounded-md border border-transparent text-xs md:text-sm`;
/**
 * H is editable even while it is only showing its default of G, so its
 * placeholder is rendered in the normal text colour rather than the muted
 * placeholder grey — a grey figure reads as calculated, not typeable.
 */
const FIELD = 'h-7 w-full px-1.5 text-right text-xs tabular-nums placeholder:text-foreground md:text-sm';

/** Rates read naturally: 25 -> "25", 7.5 -> "7.5", never "25.00". */
function formatRate(rate: number) {
  return String(Number(rate.toFixed(2)));
}

/** H as a share of G, to two decimals; null when G is zero. */
const requestedPercent = requestedPercentage;


/** Digits and a single decimal separator, capped at two places. */
function sanitizeNumeric(raw: string) {
  let cleaned = raw.replace(/,/g, '').replace(/[^0-9.]/g, '');
  const first = cleaned.indexOf('.');
  if (first >= 0) cleaned = `${cleaned.slice(0, first + 1)}${cleaned.slice(first + 1).replace(/\./g, '')}`;
  const dot = cleaned.indexOf('.');
  if (dot >= 0 && cleaned.length - dot - 1 > 2) cleaned = cleaned.slice(0, dot + 3);
  return cleaned;
}

function numberOrNull(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Local state, 350ms debounce plus commit on blur, re-seeded from the server
 * only when the field is unfocused with no pending change.
 */
function DebouncedNumberField({ value, placeholder, disabled, decimals, max, warningText, prefix, onCommit }: {
  value: number | null;
  placeholder?: string;
  disabled: boolean;
  decimals: number;
  max?: number;
  warningText?: string;
  prefix?: string;
  onCommit: (value: number | null) => void;
}) {
  const serverValue = value == null ? '' : String(value);
  const [local, setLocal] = useState(serverValue);
  const [dirty, setDirty] = useState(false);
  const [focused, setFocused] = useState(false);
  const [exceededMax, setExceededMax] = useState(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!focused && !dirty) setLocal(serverValue);
  }, [dirty, focused, serverValue]);
  useEffect(() => () => { if (pending.current) clearTimeout(pending.current); }, []);

  const commit = (next: string) => {
    if (pending.current) clearTimeout(pending.current);
    const parsed = numberOrNull(next);
    const clamped = parsed != null && max != null ? Math.min(max, parsed) : parsed;
    setExceededMax(parsed != null && max != null && parsed > max);
    onCommit(clamped);
  };

  const display = focused
    ? local
    : (local.trim() ? formatNumber(Number(local), decimals) : '');

  /**
   * The prefix sits immediately left of the right-aligned digits rather than at
   * the field's left edge, so it reads like the calculated cells. Its offset is
   * the measured width of the rendered text, taken from an invisible mirror
   * span with identical typography, so it tracks any figure length exactly.
   */
  const mirror = useRef<HTMLSpanElement | null>(null);
  const [textWidth, setTextWidth] = useState(0);
  const measured = display || placeholder || '';
  useLayoutEffect(() => {
    if (mirror.current) setTextWidth(mirror.current.offsetWidth);
  }, [measured]);

  return <div className="space-y-0.5">
    <div className="relative">
      {prefix && <>
        <span ref={mirror} aria-hidden className="pointer-events-none invisible absolute left-0 top-0 whitespace-pre text-xs tabular-nums md:text-sm">{measured}</span>
        <span aria-hidden className="pointer-events-none absolute inset-y-0 flex items-center text-xs text-muted-foreground md:text-sm" style={{ right: 6 + textWidth }}>{prefix}</span>
      </>}
      <Input
      className={`${FIELD} ${exceededMax ? 'border-destructive focus-visible:ring-destructive' : ''}`}
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      disabled={disabled}
      value={display}
      onFocus={() => setFocused(true)}
      onChange={event => {
        const next = sanitizeNumeric(event.target.value);
        setLocal(next);
        setDirty(true);
        if (pending.current) clearTimeout(pending.current);
        pending.current = setTimeout(() => { commit(next); setDirty(false); }, 350);
      }}
      onBlur={() => {
        setFocused(false);
        if (dirty) { commit(local); setDirty(false); }
      }}
      />
    </div>
    {exceededMax && warningText && <span className="text-[10px] text-destructive" role="alert">{warningText}</span>}
  </div>;
}

function DebouncedComment({ value, disabled, onCommit }: { value: string; disabled: boolean; onCommit: (value: string) => void }) {
  const [local, setLocal] = useState(value);
  const [dirty, setDirty] = useState(false);
  const [focused, setFocused] = useState(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!focused && !dirty) setLocal(value);
  }, [dirty, focused, value]);
  useEffect(() => () => { if (pending.current) clearTimeout(pending.current); }, []);

  return <div className="space-y-0.5">
    <Textarea
      className="min-h-16 text-xs md:text-sm"
      value={local}
      disabled={disabled}
      maxLength={WP_COMMENT_LIMIT}
      onFocus={() => setFocused(true)}
      onChange={event => {
        const next = event.target.value.slice(0, WP_COMMENT_LIMIT);
        setLocal(next);
        setDirty(true);
        if (pending.current) clearTimeout(pending.current);
        pending.current = setTimeout(() => { onCommit(next); setDirty(false); }, 350);
      }}
      onBlur={() => {
        setFocused(false);
        if (dirty) { if (pending.current) clearTimeout(pending.current); onCommit(local); setDirty(false); }
      }}
    />
    <div className="text-right text-[10px] text-muted-foreground tabular-nums">{local.length}/{WP_COMMENT_LIMIT}</div>
  </div>;
}

export function LumpSumTotalsSection({ proposalId, participantId, userId, editable, budgetInputsByWp }: {
  proposalId: string;
  participantId: string;
  userId?: string;
  editable: boolean;
  /** A–D per work package, supplied by the panel's existing budget calculations. */
  budgetInputsByWp: Record<string, LumpSumWpInputs>;
}) {
  const totals = useLumpSumTotals(proposalId);
  const { isCollapsed, toggle } = useLsCollapse(userId, proposalId);

  if (totals.isLoading) return <div className="pt-3 text-sm text-muted-foreground">Loading totals…</div>;
  if (totals.error) return <div className="pt-3 text-sm text-destructive">Unable to load the budget totals.</div>;
  if (!totals.data) return null;

  const { workPackages, indirectCostRate, defaultFundingRate } = totals.data;
  const participantBudget = totals.data.participantBudgets.find(row => row.participant_id === participantId);
  const fundingOverride = participantBudget?.funding_rate_override == null ? null : Number(participantBudget.funding_rate_override);
  const fundingRate = fundingOverride ?? defaultFundingRate;

  const rows = workPackages.map(wp => {
    const inputs = budgetInputsByWp[wp.id] ?? { personnel: 0, subcontracting: 0, purchase: 0, other: 0 };
    const stored = totals.data?.wpBudgets.find(row => row.participant_id === participantId && row.wp_draft_id === wp.id);
    return {
      wp,
      stored,
      ...computeWpTotals(inputs, indirectCostRate, fundingRate, stored?.requested_eu_contribution == null ? null : Number(stored.requested_eu_contribution)),
    };
  });

  const sum = (pick: (row: typeof rows[number]) => number) => rows.reduce((total, row) => total + pick(row), 0);
  const grand = {
    personnel: sum(row => row.personnel),
    subcontracting: sum(row => row.subcontracting),
    purchase: sum(row => row.purchase),
    other: sum(row => row.other),
    indirect: sum(row => row.indirect),
    totalCosts: sum(row => row.totalCosts),
    maxEuContribution: sum(row => row.maxEuContribution),
    requestedEuContribution: sum(row => row.requestedEuContribution),
  };
  const exceeded = rows.filter(row => row.storedExceedsMax != null);

  const wpBadge = (wp: typeof workPackages[number]) => <span title={wp.short_name ? `WP${wp.number}: ${wp.short_name}` : (wp.title ?? undefined)}>
    <WPBubble wpNumber={wp.number} wpColor={wp.color} />
  </span>;

  const fCollapsed = isCollapsed(COLLAPSE_TOTALS);
  const commentsCollapsed = isCollapsed(COLLAPSE_COMMENTS);
  const grandPercent = requestedPercent(grand.requestedEuContribution, grand.maxEuContribution);
  const heading = 'E. Indirect costs | F. Total costs | G. Maximum EU contribution | H. Requested EU contribution';

  return <>
    <section className="border-b border-border">
      <CollapsibleHeader collapsed={fCollapsed} onToggle={() => toggle(COLLAPSE_TOTALS)} label={heading} level="major">
        <span className="min-w-0 flex-1 truncate text-base font-semibold leading-none">{heading}</span>
        {fCollapsed && <span className="shrink-0 text-sm font-semibold leading-none tabular-nums text-muted-foreground">{formatCurrency(grand.totalCosts)}</span>}
      </CollapsibleHeader>
      {!fCollapsed && <div className={`space-y-2 pb-2 ${LINE_INDENT}`}>
        <div className="overflow-x-auto">
          <table className={`${LS_TABLE} text-sm`}>
            <colgroup>
              <col style={{ width: LS_COL.summaryWp }} />
              {/*
                G, H and the percentage sit to the right of F, so F itself cannot
                occupy the shared figure position. Instead the spacer sits directly
                after the work-package column: every fixed column to its right —
                ending in the same trailing gutter — makes this table's right edge
                coincide with every other lump-sum table.
              */}
              <col style={{ width: LS_COL.summaryNarrow }} />
              <col style={{ width: LS_COL.summaryNarrow }} />
              <col style={{ width: LS_COL.summaryNarrow }} />
              <col style={{ width: LS_COL.summaryNarrow }} />
              <col style={{ width: LS_COL.summaryNarrow }} />
              <col style={{ width: LS_COL.summaryMoney }} />
              <col style={{ width: LS_COL.summaryMoney }} />
              <col style={{ width: LS_COL.request }} />
              <col />
              <col style={{ width: LS_COL.figure }} />
              <col style={{ width: LS_COL.gutter }} />
            </colgroup>
            <thead className="bg-muted/50"><tr className="text-[11px]">
              <th className="px-1 py-1.5 text-left">Work package</th>
              <th className="px-1 py-1.5 text-right">A</th>
              <th className="px-1 py-1.5 text-right">B</th>
              <th className="px-1 py-1.5 text-right">C</th>
              <th className="px-1 py-1.5 text-right">D</th>
              <th className="px-1 py-1.5 text-right">E</th>
              <th className="px-1 py-1.5 text-right">F. Total costs</th>
              <th className="px-1 py-1.5 text-right">G. Max EU contribution</th>
              <th className="px-1 py-1.5 text-right">H. Requested EU contribution</th>
              <th aria-hidden="true" />
              <th className="px-1 py-1.5 text-right">% requested</th>
              <th aria-label="Actions" />
            </tr></thead>
            <tbody>
              {rows.map(row => <tr key={row.wp.id} className="border-t border-border/70">
                <td className="px-1 py-0.5">{wpBadge(row.wp)}</td>
                <td className="px-1 py-0.5"><div className={READ_CELL}>{formatCurrency(row.personnel)}</div></td>
                <td className="px-1 py-0.5"><div className={READ_CELL}>{formatCurrency(row.subcontracting)}</div></td>
                <td className="px-1 py-0.5"><div className={READ_CELL}>{formatCurrency(row.purchase)}</div></td>
                <td className="px-1 py-0.5"><div className={READ_CELL}>{formatCurrency(row.other)}</div></td>
                <td className="px-1 py-0.5"><div className={READ_CELL}>{formatCurrency(row.indirect)}</div></td>
                <td className="px-1 py-0.5"><div className={`${READ_CELL} font-semibold`}>{formatCurrency(row.totalCosts)}</div></td>
                <td className="px-1 py-0.5"><div className={READ_CELL}>{formatCurrency(row.maxEuContribution)}</div></td>
                <td className="px-1 py-0.5">
                  <DebouncedNumberField
                    value={row.stored?.requested_eu_contribution == null ? null : Number(row.stored.requested_eu_contribution)}
                    placeholder={formatNumber(row.maxEuContribution, 2)}
                    disabled={!editable}
                    decimals={2}
                    prefix="€"
                    onCommit={value => totals.setRequestedContribution(participantId, row.wp.id, value)}
                  />
                </td>
                <td aria-hidden="true" />
                {/* The percentage is derived from H over G; editing it writes H back. */}
                <td className={`${LS_FIGURE_CELL} py-0.5`}>
                  <DebouncedNumberField
                    key={`pct-${row.wp.id}-${row.requestedEuContribution}`}
                    value={requestedPercent(row.requestedEuContribution, row.maxEuContribution)}
                    placeholder={row.maxEuContribution > 0 ? '100.00' : ''}
                    disabled={!editable || !(row.maxEuContribution > 0)}
                    decimals={2}
                    max={100}
                    warningText="The requested EU contribution cannot exceed the maximum; the percentage is capped at 100%."
                    onCommit={value => totals.setRequestedContribution(
                      participantId,
                      row.wp.id,
                      value == null ? null : roundCents(row.maxEuContribution * value / 100),
                    )}
                  />
                </td>
                <td />
              </tr>)}
              <tr className="border-t-2 border-foreground/30 bg-muted/30 font-semibold">
                <td className="px-1 py-0.5">Total</td>
                <td className="px-1 py-0.5"><div className={`${READ_CELL} font-semibold`}>{formatCurrency(grand.personnel)}</div></td>
                <td className="px-1 py-0.5"><div className={`${READ_CELL} font-semibold`}>{formatCurrency(grand.subcontracting)}</div></td>
                <td className="px-1 py-0.5"><div className={`${READ_CELL} font-semibold`}>{formatCurrency(grand.purchase)}</div></td>
                <td className="px-1 py-0.5"><div className={`${READ_CELL} font-semibold`}>{formatCurrency(grand.other)}</div></td>
                <td className="px-1 py-0.5"><div className={`${READ_CELL} font-semibold`}>{formatCurrency(grand.indirect)}</div></td>
                <td className="px-1 py-0.5"><div className={`${READ_CELL} font-semibold`}>{formatCurrency(grand.totalCosts)}</div></td>
                <td className="px-1 py-0.5"><div className={`${READ_CELL} font-semibold`}>{formatCurrency(grand.maxEuContribution)}</div></td>
                <td className="px-1 py-0.5"><div className={`${READ_CELL} font-semibold`}>{formatCurrency(grand.requestedEuContribution)}</div></td>
                <td aria-hidden="true" />
                <td data-ls-measure="summary-percent-total" className={`${LS_FIGURE_CELL} py-0.5`}><div className={`${READ_CELL} font-semibold`}>{grandPercent == null ? '' : `${formatNumber(grandPercent, 2)}%`}</div></td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Indirect costs are charged at {formatRate(indirectCostRate)}% of A + C only. Subcontracting (B),
          financial support to third parties (D.1) and internally invoiced goods and services (D.2) are excluded from the base.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Funding rate for this participant</span>
          <div className="w-24">
            <DebouncedNumberField
              value={fundingOverride}
              placeholder={formatNumber(defaultFundingRate, 2)}
              disabled={!editable}
              decimals={2}
              onCommit={value => totals.setFundingRateOverride(participantId, value)}
            />
          </div>
          <span className="text-muted-foreground">
            {fundingOverride == null
              ? `% — no override; the proposal default of ${formatNumber(defaultFundingRate, 2)}% applies.`
              : `% — override in use; the proposal default is ${formatNumber(defaultFundingRate, 2)}%.`}
          </span>
        </div>
        {exceeded.length > 0 && <p className="text-xs text-destructive">
          The requested EU contribution exceeds the maximum for {exceeded.map(row => `WP${row.wp.number}`).join(', ')}. The figure shown is capped at G.
        </p>}
      </div>}
    </section>

    <section className="border-b border-border">
      <CollapsibleHeader collapsed={commentsCollapsed} onToggle={() => toggle(COLLAPSE_COMMENTS)} label="Comments per work package" level="major">
        <span className="min-w-0 flex-1 truncate text-base font-semibold leading-none">Comments per work package</span>
      </CollapsibleHeader>
      {!commentsCollapsed && <div className={`space-y-2 pb-2 ${LINE_INDENT}`}>
        <p className="text-[11px] text-muted-foreground">
          Income generated by the action (O), financial contributions (Q) and own resources (R) are declared here, as the portal has no separate fields for them.
        </p>
        {rows.map(row => <div key={row.wp.id} className="space-y-1">
          <div className="flex items-center gap-2">{wpBadge(row.wp)}<span className="truncate text-xs text-muted-foreground">{row.wp.short_name ?? row.wp.title ?? ''}</span></div>
          <DebouncedComment
            value={row.stored?.comments ?? ''}
            disabled={!editable}
            onCommit={value => totals.setComments(participantId, row.wp.id, value)}
          />
        </div>)}
        <div className="flex flex-wrap items-center gap-4 border-t border-border/70 pt-2 text-xs">
          <span><span className="text-muted-foreground">F. Total costs: </span><span className="font-semibold tabular-nums">{formatCurrency(grand.totalCosts)}</span></span>
          <span><span className="text-muted-foreground">H. Requested EU contribution: </span><span className="font-semibold tabular-nums">{formatCurrency(grand.requestedEuContribution)}</span></span>
          <span className="text-muted-foreground">
            H + O + Q + R should equal F. The difference of {formatCurrency(grand.totalCosts - grand.requestedEuContribution)} must be accounted for in the comments above.
          </span>
        </div>
      </div>}
    </section>
  </>;
}
