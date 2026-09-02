import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WPBubble } from '@/components/B31Pill';
import { formatCurrency, formatNumber } from '@/lib/formatNumber';
import { LS_COL, LS_FIGURE_CELL, LS_PERSONNEL_MIN_WIDTH, LS_TABLE } from '@/lib/lumpSumLayout';
import type { LumpSumEffort, LumpSumRole, LumpSumWorkPackage } from '@/hooks/useLumpSumPersonnel';

const CATEGORIES = [
  ['senior_scientist', 'Senior expert'],
  ['junior_scientist', 'Junior expert'],
  ['technical', 'Technical role'],
  ['administrative', 'Administrative role'],
  ['others', 'Others'],
] as const;
const CATEGORY_ORDER = new Map(CATEGORIES.map(([value], index) => [value, index]));

/** Person-months always display with one decimal place: 3 -> "3.0", 42.3 -> "42.3". */
export function formatPM(value: number) {
  return value.toFixed(1);
}

/** Shared cell padding per column type, applied identically to every row kind. */
const CELL = 'px-1.5';
const NUM_CELL = `${CELL} text-right tabular-nums`;
/** The figure column: shared with every other lump-sum table. */
const COST_CELL = LS_FIGURE_CELL;
/** Every field fills its column; the colgroup governs width, not the input. */
const FIELD = 'h-7 w-full px-1.5 text-xs md:text-sm';
const NUM_FIELD = `${FIELD} text-right tabular-nums`;
/**
 * Calculated values occupy exactly the same box as the editable input above
 * them — same height, padding, radius, font size and border box — but are flat
 * (no visible border) so they read as computed, not typeable. Keeping the
 * 1px transparent border matters: it is what makes the right edges coincide.
 */
export const READ_FIELD = `${FIELD} inline-flex items-center rounded-md border border-transparent`;
export const NUM_READ_FIELD = `${READ_FIELD} justify-end text-right tabular-nums`;
/**
 * Same box as NUM_READ_FIELD but auto-width, for total rows that are laid out
 * with flex rather than a colgroup: the right edge is set by the row's padding.
 */
export const NUM_READ_BOX = 'inline-flex h-7 items-center justify-end rounded-md border border-transparent px-1.5 text-right text-xs tabular-nums md:text-sm';


/** Column widths come from the single shared layout module. */
export const COL_WIDTH = LS_COL;


/** Keeps only digits and a single decimal separator, capped at `decimals` places. */
export function sanitizeNumeric(raw: string, decimals: number) {
  let cleaned = raw.replace(/,/g, '').replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot >= 0) cleaned = `${cleaned.slice(0, firstDot + 1)}${cleaned.slice(firstDot + 1).replace(/\./g, '')}`;
  if (decimals <= 0) return cleaned.split('.')[0] ?? '';
  const dot = cleaned.indexOf('.');
  if (dot >= 0 && cleaned.length - dot - 1 > decimals) cleaned = cleaned.slice(0, dot + 1 + decimals);
  return cleaned;
}

function numberValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function inputValue(value: string) {
  return value.trim() ? String(numberValue(value)) : '';
}

/**
 * Portal-equivalent totals for a cost line: each category subtotal is
 * ROUND(weighted average rate, 2) × total person-months for that category.
 */
export function costLineTotals(
  costLine: string,
  roles: LumpSumRole[],
  efforts: LumpSumEffort[],
  workPackages: LumpSumWorkPackage[],
  a4UnitCost: number,
) {
  const rateOf = (role: LumpSumRole) => (costLine === 'A.4' ? a4UnitCost : Number(role.pm_rate || 0));
  const pmByRoleWp = new Map(efforts.map(effort => [`${effort.role_id}:${effort.wp_draft_id}`, Number(effort.person_months || 0)]));
  const pmOf = (role: LumpSumRole) => workPackages.reduce((sum, wp) => sum + (pmByRoleWp.get(`${role.id}:${wp.id}`) ?? 0), 0);
  const groups = new Map<string, LumpSumRole[]>();
  for (const role of roles) {
    const key = costLine === 'A.1' ? (role.he_category || 'blank') : 'all';
    groups.set(key, [...(groups.get(key) ?? []), role]);
  }
  let portalCost = 0;
  let trueCost = 0;
  let totalPm = 0;
  for (const groupRoles of groups.values()) {
    const groupPm = groupRoles.reduce((sum, role) => sum + pmOf(role), 0);
    const groupTrue = groupRoles.reduce((sum, role) => sum + pmOf(role) * rateOf(role), 0);
    const rounded = groupPm ? Math.round((groupTrue / groupPm) * 100) / 100 : 0;
    portalCost += rounded * groupPm;
    trueCost += groupTrue;
    totalPm += groupPm;
  }
  return { portalCost, trueCost, totalPm, difference: portalCost - trueCost };
}

export function DifferenceNote({ difference }: { difference: number }) {
  if (Math.abs(difference) < 0.005) return null;
  return <span className="text-[10px] font-normal">({difference >= 0 ? '+' : '−'}{formatCurrency(Math.abs(difference))})</span>;
}


export function NumericInput({
  value,
  disabled,
  step,
  decimals,
  className,
  onCommit,
}: {
  value: number | null | undefined;
  disabled: boolean;
  step: string;
  decimals: number;
  className?: string;
  onCommit: (value: number) => void;
}) {
  const serverValue = value != null && Number.isFinite(value) && value !== 0 ? String(value) : '';
  const [localValue, setLocalValue] = useState(serverValue);
  const [dirty, setDirty] = useState(false);
  const [focused, setFocused] = useState(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!focused && dirty && inputValue(localValue) === inputValue(serverValue)) setDirty(false);
    if (!focused && !dirty) setLocalValue(serverValue);
  }, [dirty, focused, localValue, serverValue]);

  useEffect(() => () => {
    if (pending.current) clearTimeout(pending.current);
  }, []);

  const commit = (nextValue = localValue) => {
    if (pending.current) clearTimeout(pending.current);
    setDirty(true);
    onCommit(numberValue(nextValue));
  };

  const schedule = (raw: string) => {
    const next = sanitizeNumeric(raw, decimals);
    setLocalValue(next);
    setDirty(true);
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => commit(next), 350);
  };


  const displayValue = focused
    ? localValue
    : dirty
      ? (localValue.trim() ? formatNumber(numberValue(localValue), decimals) : '')
      : (serverValue ? formatNumber(numberValue(serverValue), decimals) : '');

  return <Input
    className={className}
    type="text"
    inputMode="decimal"
    min="0"
    step={step}
    value={displayValue}
    disabled={disabled}
    onFocus={() => {
      setFocused(true);
      if (!dirty) setLocalValue(serverValue);
    }}
    onChange={event => schedule(event.target.value)}
    onBlur={() => {
      setFocused(false);
      if (dirty) commit();
    }}
  />;
}

type SortableRowChildren = (attributes: ReturnType<typeof useSortable>['attributes'], listeners: ReturnType<typeof useSortable>['listeners']) => ReactNode;

function SortableRow({ id, disabled, children }: { id: string; disabled: boolean; children: SortableRowChildren }) {
  const sortable = useSortable({ id, disabled });
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition, opacity: sortable.isDragging ? 0.55 : 1 };
  return <tr ref={sortable.setNodeRef} style={style} className="border-t border-border/70">{children(sortable.attributes, sortable.listeners)}</tr>;
}

function subtotal(roles: LumpSumRole[], efforts: LumpSumEffort[], workPackages: LumpSumWorkPackage[]) {
  const pmByRoleWp = new Map(efforts.map(effort => [`${effort.role_id}:${effort.wp_draft_id}`, Number(effort.person_months || 0)]));
  const pms = workPackages.map(wp => roles.reduce((sum, role) => sum + (pmByRoleWp.get(`${role.id}:${wp.id}`) ?? 0), 0));
  const totalPm = pms.reduce((sum, value) => sum + value, 0);
  const trueCost = roles.reduce((sum, role) => sum + workPackages.reduce((rolePm, wp) => rolePm + (pmByRoleWp.get(`${role.id}:${wp.id}`) ?? 0), 0) * Number(role.pm_rate || 0), 0);
  const roundedAverage = totalPm ? Math.round((trueCost / totalPm) * 100) / 100 : 0;
  return { pms, totalPm, trueCost, roundedAverage, cost: roundedAverage * totalPm };
}

interface Props {
  costLine: string;
  roles: LumpSumRole[];
  efforts: LumpSumEffort[];
  workPackages: LumpSumWorkPackage[];
  editable: boolean;
  a4UnitCost: number;
  onAdd: () => void;
  onUpdateRole: (roleId: string, field: 'role_name' | 'he_category' | 'pm_rate', value: string | number | null) => void;
  onDelete: (roleId: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onSetEffort: (roleId: string, wpDraftId: string, value: number) => void;
}

export function LumpSumPersonnelTable({ costLine, roles, efforts, workPackages, editable, a4UnitCost, onAdd, onUpdateRole, onDelete, onReorder, onSetEffort }: Props) {
  const isA1 = costLine === 'A.1';
  const effortByKey = useMemo(() => new Map(efforts.map(effort => [`${effort.role_id}:${effort.wp_draft_id}`, Number(effort.person_months || 0)])), [efforts]);
  const grouped = useMemo(() => {
    if (!isA1) return [{ key: 'all', label: '', roles }];
    const map = new Map<string, LumpSumRole[]>();
    for (const role of roles) {
      const key = role.he_category || 'blank';
      map.set(key, [...(map.get(key) ?? []), role]);
    }
    return [...map.entries()]
      .sort(([a], [b]) => (CATEGORY_ORDER.get(a as typeof CATEGORIES[number][0]) ?? 99) - (CATEGORY_ORDER.get(b as typeof CATEGORIES[number][0]) ?? 99))
      .map(([key, groupRoles]) => ({
        key,
        label: CATEGORIES.find(([value]) => value === key)?.[1] ?? 'Category required',
        roles: [...groupRoles].sort((a, b) => a.order_index - b.order_index),
      }));
  }, [isA1, roles]);
  const roleTotalPm = (role: LumpSumRole) => workPackages.reduce((sum, wp) => sum + (effortByKey.get(`${role.id}:${wp.id}`) ?? 0), 0);
  const roleCost = (role: LumpSumRole) => roleTotalPm(role) * (costLine === 'A.4' ? a4UnitCost : Number(role.pm_rate || 0));
  const blockTotalPm = roles.reduce((sum, role) => sum + roleTotalPm(role), 0);
  const portalTotals = costLineTotals(costLine, roles, efforts, workPackages, a4UnitCost);
  const blockCost = portalTotals.portalCost;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragEnd = (event: DragEndEvent, groupRoles: LumpSumRole[]) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = groupRoles.findIndex(role => role.id === active.id);
    const to = groupRoles.findIndex(role => role.id === over.id);
    if (from < 0 || to < 0) return;
    const next = [...groupRoles];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    onReorder(next.map(role => role.id));
  };

  return <div className="space-y-2">
    <div className="overflow-x-auto">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={event => {
        const group = grouped.find(item => item.roles.some(role => role.id === event.active.id));
        if (group) handleDragEnd(event, group.roles);
      }}>
        <table className={`${LS_TABLE} text-xs`} style={{ minWidth: LS_PERSONNEL_MIN_WIDTH(workPackages.length, isA1) }}>
          <colgroup>
            <col style={{ width: COL_WIDTH.grip }} />
            {/* The role name absorbs the remaining width; the shared right block remains fixed. */}
            <col />
            {isA1 && <col style={{ width: COL_WIDTH.category }} />}
            <col style={{ width: COL_WIDTH.rate }} />
            {workPackages.map(wp => <col key={wp.id} style={{ width: COL_WIDTH.wpPm }} />)}
            <col style={{ width: COL_WIDTH.totalPm }} />
            <col style={{ width: COL_WIDTH.figure }} />
            <col style={{ width: COL_WIDTH.gutter }} />
          </colgroup>
          <thead className="bg-muted/50"><tr className="text-left">
            <th className={`${CELL} py-1.5`} aria-label="Reorder" />
            <th className={`${CELL} py-1.5`}>Role name</th>
            {isA1 && <th className={`${CELL} py-1.5`}>F&amp;TP category</th>}
            <th className={`${NUM_CELL} py-1.5`}>{costLine === 'A.4' ? 'Unit cost (€)' : 'PM rate (€)'}</th>
            {/*
              The badge carries the number only: "WP6: Coordination" measures up to
              135px, which overflows the person-month column and paints across
              its neighbours. The full name stays available as the cell tooltip, and
              every work-package column keeps the same width.
            */}
             {workPackages.map(wp => <th key={wp.id} className={`${CELL} py-1.5 text-center`} title={wp.short_name ? `WP${wp.number}: ${wp.short_name}` : (wp.title ?? undefined)}><WPBubble wpNumber={wp.number} wpColor={wp.color} /></th>)}
              <th className={`${NUM_CELL} py-1.5`}>Total PMs</th>
              <th className={`${NUM_CELL} py-1.5 whitespace-nowrap`}>Cost (€)</th>
              <th className={`${CELL} py-1.5`} aria-label="Delete" />
            </tr></thead>
          <tbody>
            {grouped.map(group => <Fragment key={group.key}>
              <SortableContext items={group.roles.map(role => role.id)} strategy={verticalListSortingStrategy}>
                {group.roles.map(role => <SortableRow key={role.id} id={role.id} disabled={!editable}>{(attributes, listeners) => <>
                  <td className={`${CELL} py-0.5 text-center`}><Button type="button" variant="ghost" size="icon" className="h-7 w-7 p-0.5 text-primary disabled:opacity-30" disabled={!editable} {...attributes} {...listeners} aria-label="Drag to reorder" title="Drag to reorder"><GripVertical className="h-3.5 w-3.5" /></Button></td>
                  <td className={`${CELL} py-0.5`}><Input className={`${FIELD} min-w-0`} defaultValue={role.role_name} disabled={!editable} onBlur={event => onUpdateRole(role.id, 'role_name', event.target.value)} /></td>
                  {isA1 && <td className={`${CELL} py-0.5 align-middle`}><Select value={role.he_category ?? ''} onValueChange={value => onUpdateRole(role.id, 'he_category', value)} disabled={!editable}><SelectTrigger title={CATEGORIES.find(([value]) => value === role.he_category)?.[1]} className={`${FIELD} justify-start [&>span]:block [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate [&>span]:text-left [&>svg]:ml-2 [&>svg]:shrink-0 ${role.he_category ? '' : 'border-destructive'}`}><SelectValue placeholder="Select category" /></SelectTrigger><SelectContent>{CATEGORIES.map(([value, label]) => <SelectItem key={value} value={value} className="pl-2 [&>span:first-child]:hidden">{label}</SelectItem>)}</SelectContent></Select>{!role.he_category && <div className="mt-0.5 text-[11px] text-destructive">Category required</div>}</td>}
                   <td className={`${CELL} py-0.5 align-middle`}><NumericInput value={costLine === 'A.4' ? a4UnitCost : role.pm_rate} disabled={!editable || costLine === 'A.4'} step="0.01" decimals={2} className={NUM_FIELD} onCommit={value => onUpdateRole(role.id, 'pm_rate', value)} /></td>
                    {workPackages.map(wp => <td key={wp.id} className={`${CELL} py-0.5 align-middle`}><NumericInput value={effortByKey.get(`${role.id}:${wp.id}`)} disabled={!editable} step="0.1" decimals={1} className={NUM_FIELD} onCommit={value => onSetEffort(role.id, wp.id, value)} /></td>)}
                    <td className={`${CELL} py-0.5`}><div className={`${NUM_READ_FIELD} font-medium`}>{formatPM(roleTotalPm(role))}</div></td>
                    <td data-ls-measure={`${costLine}-item-cost`} className={`${COST_CELL} py-0.5`}><div className={`${NUM_READ_FIELD} whitespace-nowrap font-medium`}>{formatCurrency(roleCost(role))}</div></td>
                    <td className={`${CELL} py-0.5 text-center`}>{editable && <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(role.id)} aria-label="Delete role" title="Delete role"><Trash2 className="h-3.5 w-3.5" /></Button>}</td>
                  </>}</SortableRow>)}
              </SortableContext>
              {isA1 && group.roles.length > 0 && <SubtotalRow roles={group.roles} label={group.label} efforts={efforts} workPackages={workPackages} />}
            </Fragment>)}
             <tr className="border-t-2 border-foreground/30 bg-muted/30 text-xs font-semibold md:text-sm">
               <td className={`${CELL} py-0.5`} />
               <td colSpan={isA1 ? 2 : 1} className={`${CELL} py-0.5 text-right`}><div className={`${READ_FIELD} justify-end whitespace-nowrap`}>{costLine} total</div></td>
               <td className={`${CELL} py-0.5`} />
               <td colSpan={workPackages.length} />
               <td className={`${CELL} py-0.5`}><div className={NUM_READ_FIELD}>{formatPM(blockTotalPm)}</div></td>
               {/* Fixed figure column, anchored from the table's right edge. */}
               <td data-ls-measure={`${costLine}-line-total`} data-ls-cost-cell className={`${COST_CELL} py-0.5`}><div className={`${NUM_READ_FIELD} h-auto flex-col items-end whitespace-nowrap`}><span>{formatCurrency(blockCost)}</span><span data-ls-measure={`${costLine}-rounding-difference`}><DifferenceNote difference={portalTotals.difference} /></span></div></td>
               <td className={`${CELL} py-0.5`} />
             </tr>

          </tbody>
        </table>
      </DndContext>
    </div>
    {isA1 && <p className="text-[11px] text-muted-foreground">Subtotals use the rounded average rate, matching the portal&apos;s own calculation.</p>}
    {costLine === 'A.4' && <p className="text-xs text-muted-foreground">The applicable unit cost is set by the portal. Enter the value shown there for this participant&apos;s country.</p>}
  </div>;
}

function SubtotalRow({ roles, label, efforts, workPackages }: { roles: LumpSumRole[]; label: string; efforts: LumpSumEffort[]; workPackages: LumpSumWorkPackage[] }) {
  const result = subtotal(roles, efforts, workPackages);
  const difference = result.cost - result.trueCost;
  const hasCategoryColumn = roles.some(role => role.he_category !== undefined);
  return <tr className="bg-muted/20 text-xs font-semibold md:text-sm">
    <td className={`${CELL} py-0.5`} />
    <td colSpan={hasCategoryColumn ? 2 : 1} className={`${CELL} py-0.5`}><div className={`${READ_FIELD} truncate`} title={`${label} — average weighted PM rate`}>{label} — average weighted PM rate</div></td>
    <td className={`${CELL} py-0.5`}><div className={NUM_READ_FIELD}>{formatNumber(result.roundedAverage, 2)}</div></td>
    {result.pms.map((pm, index) => <td key={workPackages[index]?.id ?? index} className={`${CELL} py-0.5`}><div className={NUM_READ_FIELD}>{formatPM(pm)}</div></td>)}
    <td className={`${CELL} py-0.5`}><div className={NUM_READ_FIELD}>{formatPM(result.totalPm)}</div></td>
    <td data-ls-measure={`${label}-weighted-subtotal`} className={`${COST_CELL} py-0.5`}><div className={`${NUM_READ_FIELD} h-auto flex-col items-end whitespace-nowrap`}><span>{formatCurrency(result.cost)}</span><DifferenceNote difference={difference} /></div></td>
    <td className={`${CELL} py-0.5`} />
  </tr>;
}
