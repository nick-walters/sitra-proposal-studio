import { useMemo, type ReactNode } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency } from '@/lib/formatNumber';
import type { LumpSumEffort, LumpSumRole, LumpSumWorkPackage } from '@/hooks/useLumpSumPersonnel';

const CATEGORIES = [
  ['senior_scientist', 'Senior Scientists (or equivalent in the private sector)'],
  ['junior_scientist', 'Junior Scientists (or equivalent in the private sector)'],
  ['technical', 'Technical Personnel (or equivalent in the private sector)'],
  ['administrative', 'Administrative Personnel (or equivalent in the private sector)'],
  ['others', 'Others'],
] as const;

const CATEGORY_ORDER = new Map(CATEGORIES.map(([value], index) => [value, index]));

function formatPM(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function numberValue(value: string) {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
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
    return [...map.entries()].sort(([a], [b]) => (CATEGORY_ORDER.get(a as typeof CATEGORIES[number][0]) ?? 99) - (CATEGORY_ORDER.get(b as typeof CATEGORIES[number][0]) ?? 99)).map(([key, groupRoles]) => ({
      key,
      label: CATEGORIES.find(([value]) => value === key)?.[1] ?? 'Category required',
      roles: [...groupRoles].sort((a, b) => a.order_index - b.order_index),
    }));
  }, [isA1, roles]);

  const roleTotalPm = (role: LumpSumRole) => workPackages.reduce((sum, wp) => sum + (effortByKey.get(`${role.id}:${wp.id}`) ?? 0), 0);
  const roleCost = (role: LumpSumRole) => roleTotalPm(role) * (isA1 || costLine !== 'A.4' ? Number(role.pm_rate || 0) : a4UnitCost);
  const blockTotalPm = roles.reduce((sum, role) => sum + roleTotalPm(role), 0);
  const blockCost = roles.reduce((sum, role) => sum + roleCost(role), 0);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragEnd = (event: DragEndEvent, groupRoles: LumpSumRole[]) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = groupRoles.findIndex(role => role.id === active.id);
    const to = groupRoles.findIndex(role => role.id === over.id);
    if (from < 0 || to < 0) return;
    const next = [...groupRoles];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorder(next.map(role => role.id));
  };

  return <div className="space-y-3">
    <div className="flex items-center justify-between">
      <div className="text-sm font-semibold">{costLine} Personnel costs <span className="font-normal text-muted-foreground">· {formatCurrency(blockCost)}</span></div>
      {editable && <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={onAdd}><Plus className="h-3.5 w-3.5" /> Add role</Button>}
    </div>
    <div className="overflow-x-auto border border-border rounded-md">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={event => {
        const group = grouped.find(item => item.roles.some(role => role.id === event.active.id));
        if (group) handleDragEnd(event, group.roles);
      }}>
        <table className="w-full min-w-[760px] text-xs">
          <thead className="bg-muted/50"><tr className="text-left">
            <th className="w-9 px-2 py-2" aria-label="Reorder" /><th className="min-w-40 px-2 py-2">Role name</th>
            {isA1 && <th className="min-w-56 px-2 py-2">HE subcategory</th>}
            <th className="w-28 px-2 py-2 text-right">{costLine === 'A.4' ? 'Unit cost (€)' : 'PM rate (€)'}</th>
            {workPackages.map(wp => <th key={wp.id} className="w-24 px-2 py-2 text-right" title={wp.title ?? undefined}>WP{wp.number}{wp.short_name ? ` · ${wp.short_name}` : ''}</th>)}
            <th className="w-20 px-2 py-2 text-right">Total PMs</th><th className="w-28 px-2 py-2 text-right">Cost (€)</th><th className="w-10 px-2 py-2" aria-label="Delete" />
          </tr></thead>
          <tbody>
            {grouped.map(group => <>
              <SortableContext key={group.key} items={group.roles.map(role => role.id)} strategy={verticalListSortingStrategy}>
                {group.roles.map(role => <SortableRow key={role.id} id={role.id} disabled={!editable}>{(attributes, listeners) => <>
                  <td className="px-1 py-1 text-center"><button type="button" className="p-1 text-primary disabled:opacity-30" disabled={!editable} {...attributes} {...listeners} aria-label="Drag to reorder" title="Drag to reorder"><GripVertical className="h-3.5 w-3.5" /></button></td>
                  <td className="px-2 py-1"><Input className="h-8 min-w-32" defaultValue={role.role_name} disabled={!editable} onBlur={event => onUpdateRole(role.id, 'role_name', event.target.value)} /></td>
                  {isA1 && <td className="px-2 py-1 align-top"><Select value={role.he_category ?? ''} onValueChange={value => onUpdateRole(role.id, 'he_category', value)} disabled={!editable}><SelectTrigger className={role.he_category ? 'h-8' : 'h-8 border-destructive'}><SelectValue placeholder="Select category" /></SelectTrigger><SelectContent>{CATEGORIES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>{!role.he_category && <div className="mt-1 text-[11px] text-destructive">Category required</div>}</td>}
                  <td className="px-2 py-1"><Input className="h-8 text-right" type="number" min="0" step="0.01" value={costLine === 'A.4' ? a4UnitCost : role.pm_rate} disabled={!editable || costLine === 'A.4'} onChange={event => costLine === 'A.4' ? undefined : onUpdateRole(role.id, 'pm_rate', numberValue(event.target.value))} /></td>
                  {workPackages.map(wp => <td key={wp.id} className="px-2 py-1"><Input className="h-8 text-right" type="number" min="0" step="0.1" value={effortByKey.get(`${role.id}:${wp.id}`) ?? 0} disabled={!editable} onChange={event => onSetEffort(role.id, wp.id, numberValue(event.target.value))} /></td>)}
                  <td className="px-2 py-1 text-right font-medium">{formatPM(roleTotalPm(role))}</td><td className="px-2 py-1 text-right font-medium">{formatCurrency(roleCost(role))}</td><td className="px-2 py-1 text-center">{editable && <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => onDelete(role.id)} aria-label="Delete role" title="Delete role"><Trash2 className="h-4 w-4" /></Button>}</td>
                </>}</SortableRow>)}
              </SortableContext>
              {isA1 && group.roles.length > 0 && <SubtotalRow roles={group.roles} label={group.label} efforts={efforts} workPackages={workPackages} effortByKey={effortByKey} />}
            </>)}
            <tr className="border-t-2 border-foreground/30 bg-muted/30 font-semibold"><td colSpan={isA1 ? 3 : 2} className="px-2 py-2">{costLine} total</td><td /><td colSpan={workPackages.length} /><td className="px-2 py-2 text-right">{formatPM(blockTotalPm)}</td><td className="px-2 py-2 text-right">{formatCurrency(blockCost)}</td><td /></tr>
          </tbody>
        </table>
      </DndContext>
    </div>
    {isA1 && <p className="text-[11px] text-muted-foreground">Subtotals use the rounded average rate, matching the portal&apos;s own calculation.</p>}
    {costLine === 'A.4' && <p className="text-xs text-muted-foreground">The applicable unit cost is set by the portal. Enter the value shown there for this participant&apos;s country.</p>}
  </div>;
}

function SubtotalRow({ roles, label, efforts, workPackages, effortByKey }: { roles: LumpSumRole[]; label: string; efforts: LumpSumEffort[]; workPackages: LumpSumWorkPackage[]; effortByKey: Map<string, number> }) {
  const result = subtotal(roles, efforts, workPackages);
  const difference = result.cost - result.trueCost;
  return <tr className="bg-muted/20 text-muted-foreground"><td colSpan={2} className="px-2 py-2 italic">{label} — average weighted PM rate</td><td className="px-2 py-2 text-right">{result.roundedAverage.toFixed(2)}</td>{result.pms.map((pm, index) => <td key={workPackages[index]?.id ?? index} className="px-2 py-2 text-right">{formatPM(pm)}</td>)}<td className="px-2 py-2 text-right">{formatPM(result.totalPm)}</td><td className="px-2 py-2 text-right">{formatCurrency(result.cost)}{Math.abs(difference) >= 0.005 && <span className="ml-1 text-[10px]">({difference >= 0 ? '+' : ''}{formatCurrency(difference)})</span>}</td><td /></tr>;
}
