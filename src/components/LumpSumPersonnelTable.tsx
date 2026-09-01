import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency, formatNumber } from '@/lib/formatNumber';
import type { LumpSumEffort, LumpSumRole, LumpSumWorkPackage } from '@/hooks/useLumpSumPersonnel';

const CATEGORIES = [
  ['senior_scientist', 'Senior expert'],
  ['junior_scientist', 'Junior expert'],
  ['technical', 'Technical role'],
  ['administrative', 'Administrative role'],
  ['others', 'Others'],
] as const;
const CATEGORY_ORDER = new Map(CATEGORIES.map(([value], index) => [value, index]));

function formatPM(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

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
  return <span className="ml-1 text-[10px] font-normal">({difference >= 0 ? '+' : '−'}{formatCurrency(Math.abs(difference))})</span>;
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
    <div className="overflow-x-auto rounded-md border border-border">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={event => {
        const group = grouped.find(item => item.roles.some(role => role.id === event.active.id));
        if (group) handleDragEnd(event, group.roles);
      }}>
        <table className="w-full min-w-[900px] text-xs">
          <thead className="bg-muted/50"><tr className="text-left">
            <th className="w-8 px-1 py-1.5" aria-label="Reorder" />
            <th className="min-w-44 px-1.5 py-1.5">Role name</th>
            {isA1 && <th className="min-w-56 px-1.5 py-1.5">F&amp;TP category</th>}
            <th className="w-20 px-1.5 py-1.5 text-right">{costLine === 'A.4' ? 'Unit cost (€)' : 'PM rate (€)'}</th>
            {workPackages.map(wp => <th key={wp.id} className="w-8 px-1.5 py-1.5 text-right" title={wp.title ?? undefined}>WP{wp.number}{wp.short_name ? ` · ${wp.short_name}` : ''}</th>)}
            <th className="w-20 px-1.5 py-1.5 text-right">Total PMs</th>
            <th className="w-28 px-1.5 py-1.5 text-right">Cost (€)</th>
            <th className="w-9 px-1 py-1.5" aria-label="Delete" />
          </tr></thead>
          <tbody>
            {grouped.map(group => <Fragment key={group.key}>
              <SortableContext items={group.roles.map(role => role.id)} strategy={verticalListSortingStrategy}>
                {group.roles.map(role => <SortableRow key={role.id} id={role.id} disabled={!editable}>{(attributes, listeners) => <>
                  <td className="px-1 py-0.5 text-center"><Button type="button" variant="ghost" size="icon" className="h-7 w-7 p-0.5 text-primary disabled:opacity-30" disabled={!editable} {...attributes} {...listeners} aria-label="Drag to reorder" title="Drag to reorder"><GripVertical className="h-3.5 w-3.5" /></Button></td>
                  <td className="px-1.5 py-0.5"><Input className="h-7 min-w-44 px-1.5 text-xs" defaultValue={role.role_name} disabled={!editable} onBlur={event => onUpdateRole(role.id, 'role_name', event.target.value)} /></td>
                  {isA1 && <td className="px-1.5 py-0.5 align-middle"><Select value={role.he_category ?? ''} onValueChange={value => onUpdateRole(role.id, 'he_category', value)} disabled={!editable}><SelectTrigger className={`h-7 px-1.5 text-xs ${role.he_category ? '' : 'border-destructive'}`}><SelectValue placeholder="Select category" /></SelectTrigger><SelectContent>{CATEGORIES.map(([value, label]) => <SelectItem key={value} value={value} className="pl-2 [&>span:first-child]:hidden">{label}</SelectItem>)}</SelectContent></Select>{!role.he_category && <div className="mt-0.5 text-[11px] text-destructive">Category required</div>}</td>}
                  <td className="px-1.5 py-0.5 align-middle"><NumericInput value={costLine === 'A.4' ? a4UnitCost : role.pm_rate} disabled={!editable || costLine === 'A.4'} step="0.01" decimals={2} className="h-7 w-20 px-1.5 text-right text-xs" onCommit={value => onUpdateRole(role.id, 'pm_rate', value)} /></td>
                  {workPackages.map(wp => <td key={wp.id} className="px-1.5 py-0.5 align-middle"><NumericInput value={effortByKey.get(`${role.id}:${wp.id}`)} disabled={!editable} step="0.1" decimals={1} className="h-7 w-10 px-1.5 text-right text-xs" onCommit={value => onSetEffort(role.id, wp.id, value)} /></td>)}
                  <td className="px-1.5 py-0.5 text-right font-medium">{formatPM(roleTotalPm(role))}</td><td className="px-1.5 py-0.5 text-right font-medium">{formatCurrency(roleCost(role))}</td><td className="px-1 py-0.5 text-center">{editable && <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(role.id)} aria-label="Delete role" title="Delete role"><Trash2 className="h-3.5 w-3.5" /></Button>}</td>
                </>}</SortableRow>)}
              </SortableContext>
              {isA1 && group.roles.length > 0 && <SubtotalRow roles={group.roles} label={group.label} efforts={efforts} workPackages={workPackages} />}
            </Fragment>)}
            <tr className="border-t-2 border-foreground/30 bg-muted/30 font-semibold"><td colSpan={isA1 ? 3 : 2} className="px-1.5 py-1.5">{costLine} total</td><td /><td colSpan={workPackages.length} /><td className="px-1.5 py-1.5 text-right">{formatPM(blockTotalPm)}</td><td className="px-1.5 py-1.5 text-right">{formatCurrency(blockCost)}<DifferenceNote difference={portalTotals.difference} /></td><td /></tr>
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
  return <tr className="bg-muted/20 font-semibold"><td /><td colSpan={2} className="px-1.5 py-1.5">{label} — average weighted PM rate</td><td className="px-1.5 py-1.5 text-right">{formatNumber(result.roundedAverage, 2)}</td>{result.pms.map((pm, index) => <td key={workPackages[index]?.id ?? index} className="px-1.5 py-1.5 text-right">{formatPM(pm)}</td>)}<td className="px-1.5 py-1.5 text-right">{formatPM(result.totalPm)}</td><td className="px-1.5 py-1.5 text-right">{formatCurrency(result.cost)}<DifferenceNote difference={difference} /></td><td /></tr>;
}
