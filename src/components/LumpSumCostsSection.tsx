import { useEffect, useRef, useState } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WPBubble } from '@/components/B31Pill';
import { CollapseChevron } from '@/components/cards/CollapseChevron';
import { formatCurrency, formatNumber } from '@/lib/formatNumber';
import { type LumpSumCostItem, type LumpSumCostWorkPackage, useLumpSumCosts } from '@/hooks/useLumpSumCosts';
import { useLumpSumDepreciation, type DepreciationItem } from '@/hooks/useLumpSumDepreciation';
import LumpSumDepreciationSection, { DEPRECIATION_SECTION_ID } from '@/components/LumpSumDepreciationSection';
import { lineId, majorId, parentId, useLumpSumCollapse } from '@/lib/lumpSumCollapse';

/** C.2 Equipment is the only line that mirrors the depreciation register. */
const MIRROR_LINE_KEY = 'C.2.equipment';

function mirroredJustification(item: DepreciationItem) {
  const comments = (item.comments ?? '').trim();
  return comments ? `${item.short_name} — ${comments}` : item.short_name;
}

/** A read-only C.2 row computed from a depreciation item. Never stored. */
function MirroredCostRow({ item, workPackages }: { item: DepreciationItem; workPackages: LumpSumCostWorkPackage[] }) {
  const wp = workPackages.find(candidate => candidate.id === item.wp_draft_id);
  const charged = Number(item.charged_depreciation ?? 0);
  const jump = () => document.getElementById(DEPRECIATION_SECTION_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return <tr className="border-t border-border/70 bg-muted/40 align-middle">
    <td className="px-1" />
    <td className="px-1"><span title={wp?.title ?? wp?.short_name ?? ''}><WPBubble wpNumber={wp?.number} wpColor={wp?.color ?? 'hsl(var(--muted-foreground))'}>{wpLabel(wp)}</WPBubble></span></td>
    <td className="px-1 text-right tabular-nums"><div className={NUM_READ_FIELD}>{formatNumber(1, 2)}</div></td>
    <td className="px-1 text-right tabular-nums"><div className={NUM_READ_FIELD}>{formatNumber(charged, 2)}</div></td>
    <td className="px-1 text-right tabular-nums"><div className={`${NUM_READ_FIELD} font-semibold`}>{formatCurrency(charged)}</div></td>
    <td className="px-1">
      <div className={`${READ_FIELD} justify-between gap-2`}>
        <span className="truncate" title={mirroredJustification(item)}>{mirroredJustification(item)}</span>
        <Button type="button" variant="link" size="sm" className="h-5 shrink-0 px-0 text-[10px]" onClick={jump}>from depreciation register</Button>
      </div>

    </td>
    <td className="px-1" />
  </tr>;
}

type CostLine = { key: string; label: string; strict: boolean };

const LINES: { B: readonly CostLine[]; C: readonly CostLine[]; D: readonly CostLine[] } = {
  B: [{ key: 'B.1', label: 'B.1 Subcontracting', strict: true }],
  C: [
    { key: 'C.1', label: 'C.1 Travel and subsistence', strict: false },
    { key: 'C.2.infrastructure', label: 'Infrastructure', strict: true },
    { key: 'C.2.equipment', label: 'Equipment', strict: true },
    { key: 'C.2.other_assets', label: 'Other assets', strict: true },
    { key: 'C.3.consumables', label: 'Consumables', strict: false },
    { key: 'C.3.meetings', label: 'Services for meetings, seminars', strict: false },
    { key: 'C.3.dissemination', label: 'Services for dissemination activities (including website)', strict: false },
    { key: 'C.3.publication', label: 'Publication fees', strict: false },
    { key: 'C.3.other', label: 'Other (shipment, insurance, translation, etc.)', strict: false },
  ],
  D: [
    { key: 'D.1', label: 'D.1 Financial support to third parties', strict: false },
    { key: 'D.2', label: 'D.2 Internally invoiced goods and services', strict: false },
  ],
};

const CATEGORIES = [
  { key: 'B', label: 'B. Direct subcontracting costs', lines: LINES.B },
  { key: 'C', label: 'C. Direct purchase costs', lines: LINES.C },
  { key: 'D', label: 'D. Other cost categories', lines: LINES.D },
] as const;

/**
 * C is three levels deep: the major heading, then C.1 (a line with items) and
 * the C.2 / C.3 parents, which hold sub-lines and carry no items themselves.
 * Stored cost_line values are untouched — this is presentation only.
 */
const C_PARENTS = [
  { key: 'C.2', label: 'C.2 Equipment', childKeys: ['C.2.infrastructure', 'C.2.equipment', 'C.2.other_assets'] },
  { key: 'C.3', label: 'C.3 Other goods, works and services', childKeys: ['C.3.consumables', 'C.3.meetings', 'C.3.dissemination', 'C.3.publication', 'C.3.other'] },
] as const;

const FIELD = 'h-7 w-full rounded-md border bg-background px-1.5 text-xs md:text-sm';
/**
 * Calculated values occupy exactly the same box as the editable input above
 * them — same height, padding, radius and font size — but are flat: no border,
 * no field background, matching category A's READ_FIELD exactly. The 1px
 * transparent border is what keeps the right edges coincident.
 */
const READ_FIELD = 'inline-flex h-7 w-full items-center rounded-md border border-transparent px-1.5 text-xs md:text-sm';
const NUM_READ_FIELD = `${READ_FIELD} justify-end text-right tabular-nums`;
const MAJOR_HEADING_ROW = 'flex h-8 items-center gap-1';
const MAJOR_HEADING_TEXT = 'min-w-0 flex-1 text-base font-semibold';
const LINE_HEADING_ROW = 'flex h-7 items-center gap-1';
const LINE_HEADING_TEXT = 'min-w-0 flex-1 text-xs font-semibold';
const SUBTOTAL_LABEL = 'shrink-0 whitespace-nowrap text-muted-foreground';
const COL_WIDTH = { grip: 30, wp: 100, quantity: 88, unitCost: 112, amount: 120, delete: 34 };


function numericValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sanitizeNumeric(value: string, decimals: number) {
  let next = value.replace(/,/g, '').replace(/[^0-9.]/g, '');
  const dot = next.indexOf('.');
  if (dot >= 0) next = `${next.slice(0, dot + 1)}${next.slice(dot + 1).replace(/\./g, '')}`;
  if (dot >= 0 && next.length - dot - 1 > decimals) next = next.slice(0, dot + 1 + decimals);
  return next;
}

function LocalNumberInput({ value, decimals, disabled, onCommit, className = '' }: {
  value: number | null | undefined;
  decimals: number;
  disabled: boolean;
  onCommit: (value: number) => void;
  className?: string;
}) {
  const serverValue = value != null && Number.isFinite(value) && value !== 0 ? String(value) : '';
  const [localValue, setLocalValue] = useState(serverValue);
  const [dirty, setDirty] = useState(false);
  const [focused, setFocused] = useState(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!focused && dirty && numericValue(localValue) === numericValue(serverValue)) setDirty(false);
    if (!focused && !dirty) setLocalValue(serverValue);
  }, [dirty, focused, localValue, serverValue]);
  useEffect(() => () => { if (pending.current) clearTimeout(pending.current); }, []);

  const commit = (raw = localValue) => {
    if (pending.current) clearTimeout(pending.current);
    setDirty(true);
    onCommit(numericValue(raw));
  };
  const schedule = (raw: string) => {
    const next = sanitizeNumeric(raw, decimals);
    setLocalValue(next);
    setDirty(true);
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => commit(next), 350);
  };
  const displayValue = focused ? localValue : dirty ? (localValue ? formatNumber(numericValue(localValue), decimals) : '') : (serverValue ? formatNumber(numericValue(serverValue), decimals) : '');

  return <Input
    className={`${FIELD} text-right tabular-nums ${className}`}
    type="text"
    inputMode="decimal"
    value={displayValue}
    disabled={disabled}
    onFocus={() => { setFocused(true); if (!dirty) setLocalValue(serverValue); }}
    onChange={event => schedule(event.target.value)}
    onBlur={() => { setFocused(false); if (dirty) commit(); }}
  />;
}

function LocalTextInput({ value, disabled, onCommit, className = '' }: { value: string; disabled: boolean; onCommit: (value: string) => void; className?: string }) {
  const [localValue, setLocalValue] = useState(value);
  const [dirty, setDirty] = useState(false);
  const [focused, setFocused] = useState(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!focused && dirty && localValue === value) setDirty(false);
    if (!focused && !dirty) setLocalValue(value);
  }, [dirty, focused, localValue, value]);
  useEffect(() => () => { if (pending.current) clearTimeout(pending.current); }, []);
  const commit = (next = localValue) => {
    if (pending.current) clearTimeout(pending.current);
    setDirty(true);
    onCommit(next);
  };
  const schedule = (next: string) => {
    setLocalValue(next);
    setDirty(true);
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => commit(next), 350);
  };
  return <Input
    className={`${FIELD} ${className}`}
    value={focused || dirty ? localValue : value}
    disabled={disabled}
    onFocus={() => { setFocused(true); if (!dirty) setLocalValue(value); }}
    onChange={event => schedule(event.target.value)}
    onBlur={() => { setFocused(false); if (dirty) commit(); }}
  />;
}

function totalFor(items: LumpSumCostItem[]) {
  return items.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
}

function wpLabel(wp: LumpSumCostWorkPackage | undefined) {
  return wp ? `WP${wp.number}` : 'Select WP';
}

function warningClass(strict: boolean) {
  return strict ? 'border-destructive focus-visible:ring-destructive' : 'border-warning focus-visible:ring-warning';
}

function SortableCostRow({ item, workPackages, editable, strict, onChangeWp, onDelete, onQuantity, onUnitCost, onJustification }: {
  item: LumpSumCostItem;
  workPackages: LumpSumCostWorkPackage[];
  editable: boolean;
  strict: boolean;
  onChangeWp: (value: string) => void;
  onDelete: () => void;
  onQuantity: (value: number) => void;
  onUnitCost: (value: number) => void;
  onJustification: (value: string) => void;
}) {
  const sortable = useSortable({ id: item.id, disabled: !editable });
  const wp = workPackages.find(candidate => candidate.id === item.wp_draft_id);
  const missingJustification = Number(item.amount ?? 0) > 0 && !item.justification.trim();
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition, opacity: sortable.isDragging ? 0.55 : 1 };
  return <tr ref={sortable.setNodeRef} style={style} className="border-t border-border/70 align-middle">
    <td className="px-1"><Button type="button" variant="ghost" size="icon" className="h-7 w-7 cursor-grab" disabled={!editable} aria-label="Drag cost item" {...sortable.attributes} {...sortable.listeners}><GripVertical className="h-4 w-4 text-primary" /></Button></td>
    <td className="px-1"><Select value={item.wp_draft_id} onValueChange={onChangeWp} disabled={!editable}><SelectTrigger className="h-7 px-1.5 text-xs"><span title={wp?.title ?? wp?.short_name ?? ''}><WPBubble wpNumber={wp?.number} wpColor={wp?.color ?? 'hsl(var(--muted-foreground))'}>{wpLabel(wp)}</WPBubble></span><span className="sr-only"><SelectValue /></span></SelectTrigger><SelectContent>{workPackages.map(candidate => <SelectItem key={candidate.id} value={candidate.id} className="pl-2 [&>span:first-child]:hidden"><span title={candidate.title ?? candidate.short_name ?? ''}><WPBubble wpNumber={candidate.number} wpColor={candidate.color}>{`WP${candidate.number}`}</WPBubble></span></SelectItem>)}</SelectContent></Select></td>
    <td className="px-1"><LocalNumberInput value={item.quantity} decimals={2} disabled={!editable} onCommit={onQuantity} /></td>
    <td className="px-1"><LocalNumberInput value={item.unit_cost} decimals={2} disabled={!editable} onCommit={onUnitCost} /></td>
    <td className="px-1 text-right tabular-nums"><div className={`${NUM_READ_FIELD} font-semibold`}>{formatCurrency(Number(item.amount ?? 0))}</div></td>
    <td className="px-1"><LocalTextInput value={item.justification} disabled={!editable} className={missingJustification ? warningClass(strict) : ''} onCommit={onJustification} />{missingJustification && <span className={`text-[10px] ${strict ? 'text-destructive' : 'text-warning'}`} aria-live="polite">{strict ? 'Justification required' : 'Justification recommended'}</span>}</td>
    <td className="px-1 text-center"><Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" disabled={!editable} aria-label="Delete cost item" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button></td>
  </tr>;
}

export function LumpSumCostsSection({ proposalId, participantId, userId, editable }: { proposalId: string; participantId: string; userId?: string; editable: boolean }) {
  const { data, isLoading, error, addItem, updateQuantity, updateUnitCost, updateJustification, changeWorkPackage, deleteItem, reorderItems } = useLumpSumCosts(proposalId);
  const depreciation = useLumpSumDepreciation(proposalId);
  const mirroredItems = (depreciation.data?.items ?? []).filter(item => item.participant_id === participantId && item.include_in_c2);
  const { isCollapsed, toggle } = useLumpSumCollapse(userId, proposalId);
  const isMajorCollapsed = (key: string) => isCollapsed(majorId(key));
  const isLineCollapsed = (key: string) => isCollapsed(lineId(key));
  const isParentCollapsed = (key: string) => isCollapsed(parentId(key));
  const toggleMajor = (key: string) => toggle(majorId(key));
  const toggleLine = (key: string) => toggle(lineId(key));
  const toggleParent = (key: 'C.2' | 'C.3') => toggle(parentId(key));
  const items = data?.items.filter(item => item.participant_id === participantId) ?? [];
  const workPackages = data?.workPackages ?? [];
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const itemTotal = (key: string) => totalFor(items.filter(item => item.cost_line === key)) + (key === MIRROR_LINE_KEY ? mirroredItems.reduce((sum, item) => sum + Number(item.charged_depreciation ?? 0), 0) : 0);
  const wpTotal = (key: string, wpId: string) => totalFor(items.filter(item => item.cost_line === key && item.wp_draft_id === wpId)) + (key === MIRROR_LINE_KEY ? mirroredItems.filter(item => item.wp_draft_id === wpId).reduce((sum, item) => sum + Number(item.charged_depreciation ?? 0), 0) : 0);
  const categoryWpTotal = (category: typeof CATEGORIES[number], wpId: string) => category.lines.reduce((sum, line) => sum + wpTotal(line.key, wpId), 0);
  const renderCategorySubtotals = (category: typeof CATEGORIES[number]) => workPackages
    .map(wp => ({ wp, total: categoryWpTotal(category, wp.id) }))
    .filter(({ total }) => total > 0)
    .map(({ wp, total }) => <div key={`${category.key}-${wp.id}`} className="flex items-center justify-end gap-2 text-sm tabular-nums"><span className="text-muted-foreground">{wpLabel(wp)} subtotal</span><span className={`${NUM_READ_FIELD} w-32 font-semibold`}>{formatCurrency(total)}</span></div>);

  if (isLoading) return <div className="pt-3 text-sm text-muted-foreground">Loading B–D costs…</div>;
  if (error) return <div className="pt-3 text-sm text-destructive">Unable to load B–D costs.</div>;
  if (!data) return null;

  const renderItemisedLine = (line: typeof LINES.B[number] | typeof LINES.C[number], nested = false) => {
    const lineItems = items.filter(item => item.cost_line === line.key).sort((a, b) => a.order_index - b.order_index);
    const collapsed = isLineCollapsed(line.key);
    const handleDragEnd = (event: DragEndEvent) => {
      if (!event.over || event.active.id === event.over.id) return;
      const from = lineItems.findIndex(item => item.id === event.active.id);
      const to = lineItems.findIndex(item => item.id === event.over?.id);
      if (from < 0 || to < 0) return;
      const next = [...lineItems];
      const [moved] = next.splice(from, 1);
      if (moved) next.splice(to, 0, moved);
      reorderItems(next.map(item => item.id));
    };
    return <section key={line.key} className={`border-b border-border/70 ${nested ? 'ml-4' : ''}`}>
      <div className="flex min-h-8 items-center gap-1"><CollapseChevron collapsed={collapsed} onToggle={() => toggle(line.key)} label={line.label} className="h-6 w-6" /><span className="min-w-0 flex-1 text-xs font-semibold">{line.label}</span>{collapsed && <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{formatCurrency(itemTotal(line.key))}</span>}{!collapsed && editable && <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => addItem(participantId, line.key)}>Add item</Button>}</div>
      {!collapsed && <div className="overflow-x-auto pb-2"><DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}><SortableContext items={lineItems.map(item => item.id)} strategy={verticalListSortingStrategy}><table className="w-full table-fixed border-collapse text-sm"><colgroup><col style={{ width: COL_WIDTH.grip }} /><col style={{ width: COL_WIDTH.wp }} /><col style={{ width: COL_WIDTH.quantity }} /><col style={{ width: COL_WIDTH.unitCost }} /><col style={{ width: COL_WIDTH.amount }} /><col /><col style={{ width: COL_WIDTH.delete }} /></colgroup><thead><tr className="text-[11px] text-muted-foreground"><th /><th className="px-1 text-left">Work package</th><th className="px-1 text-right">Quantity</th><th className="px-1 text-right">Unit cost (€)</th><th className="px-1 text-right">Subtotal (€)</th><th className="px-1 text-left">Justification</th><th /></tr></thead><tbody>{lineItems.map(item => <SortableCostRow key={item.id} item={item} workPackages={workPackages} editable={editable} strict={line.strict} onChangeWp={value => changeWorkPackage(item.id, value)} onDelete={() => deleteItem(item.id)} onQuantity={value => updateQuantity(item.id, value)} onUnitCost={value => updateUnitCost(item.id, value)} onJustification={value => updateJustification(item.id, value)} />)}{line.key === MIRROR_LINE_KEY && mirroredItems.map(item => <MirroredCostRow key={`depreciation-${item.id}`} item={item} workPackages={workPackages} />)}</tbody></table></SortableContext></DndContext><div className="flex justify-end pt-1 text-sm font-bold tabular-nums"><span className={NUM_READ_FIELD}>Line total: {formatCurrency(itemTotal(line.key))}</span></div></div>}
    </section>;
  };

  const renderCParent = (parent: typeof C_PARENTS[number]) => {
    const collapsed = Boolean(parentCollapse[parent.key]);
    const childLines = parent.childKeys
      .map(key => LINES.C.find(line => line.key === key))
      .filter((line): line is typeof LINES.C[number] => Boolean(line));
    const total = childLines.reduce((sum, line) => sum + itemTotal(line.key), 0);
    return <section key={parent.key} className="border-b border-border/70 ml-2">
      <div className="flex min-h-8 items-center gap-1"><CollapseChevron collapsed={collapsed} onToggle={() => toggleParent(parent.key)} label={parent.label} className="h-6 w-6" /><span className="min-w-0 flex-1 text-sm font-semibold">{parent.label}</span>{collapsed && <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{formatCurrency(total)}</span>}</div>
      {!collapsed && <>
        {parent.key === 'C.2' && <LumpSumDepreciationSection proposalId={proposalId} participantId={participantId} userId={userId} editable={editable} />}
        {childLines.map(line => renderItemisedLine(line, true))}
        <div className="flex justify-end py-1 text-sm font-semibold tabular-nums"><span className={`${NUM_READ_FIELD} w-32`}>{parent.key} total: {formatCurrency(total)}</span></div>
      </>}
    </section>;
  };

  const renderDLine = (line: typeof LINES.D[number]) => {
    const collapsed = isLineCollapsed(line.key);
    const lineItems = items.filter(item => item.cost_line === line.key).sort((a, b) => a.order_index - b.order_index);
    const usedWpIds = new Set(lineItems.map(item => item.wp_draft_id));
    const freeWorkPackages = workPackages.filter(wp => !usedWpIds.has(wp.id));
    return <section key={line.key} className="border-b border-border/70">
      <div className="flex min-h-8 items-center gap-1"><CollapseChevron collapsed={collapsed} onToggle={() => toggle(line.key)} label={line.label} className="h-6 w-6" /><span className="min-w-0 flex-1 text-xs font-semibold">{line.label}</span>{collapsed && <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{formatCurrency(itemTotal(line.key))}</span>}{!collapsed && editable && freeWorkPackages.length > 0 && <Select onValueChange={wpDraftId => addItem(participantId, line.key, wpDraftId)}><SelectTrigger className="h-7 w-auto min-w-20 px-2 text-xs"><SelectValue placeholder="Add item" /></SelectTrigger><SelectContent>{freeWorkPackages.map(wp => <SelectItem key={wp.id} value={wp.id} className="pl-2 [&>span:first-child]:hidden"><span title={wp.title ?? wp.short_name ?? ''}><WPBubble wpNumber={wp.number} wpColor={wp.color}>{`WP${wp.number}`}</WPBubble></span></SelectItem>)}</SelectContent></Select>}</div>
      {!collapsed && <div className="overflow-x-auto pb-2"><table className="w-full table-fixed border-collapse text-sm"><colgroup><col style={{ width: COL_WIDTH.wp }} /><col style={{ width: COL_WIDTH.amount }} /><col /><col style={{ width: COL_WIDTH.delete }} /></colgroup><thead><tr className="text-[11px] text-muted-foreground"><th className="px-1 text-left">Work package</th><th className="px-1 text-right">Amount (€)</th><th className="px-1 text-left">Justification</th><th /></tr></thead><tbody>{lineItems.map(item => <DRow key={item.id} item={item} workPackages={workPackages} usedWpIds={usedWpIds} editable={editable} onChangeWp={value => changeWorkPackage(item.id, value)} onAmount={value => updateUnitCost(item.id, value)} onJustification={value => updateJustification(item.id, value)} onDelete={() => deleteItem(item.id)} />)}</tbody></table><div className="flex justify-end pt-1 text-sm font-bold tabular-nums"><span className={NUM_READ_FIELD}>Line total: {formatCurrency(itemTotal(line.key))}</span></div></div>}
    </section>;
  };

  return <div className="mt-4 space-y-1">{CATEGORIES.map(category => {
    const visibleLines = category.lines.filter(line => !(line.key === 'D.1' && !data.usesFstp));
    const majorCollapsed = Boolean(majorCollapse[category.key]);
    const categoryTotal = visibleLines.reduce((sum, line) => sum + itemTotal(line.key), 0);
    const renderCategoryLine = (line: typeof category.lines[number]) => {
      if (category.key === 'C' && (line.key === 'C.2.infrastructure' || line.key === 'C.2.equipment' || line.key === 'C.2.other_assets')) return null;
      if (category.key === 'C' && (line.key === 'C.3.consumables' || line.key === 'C.3.meetings' || line.key === 'C.3.dissemination' || line.key === 'C.3.publication' || line.key === 'C.3.other')) return null;
      return category.key === 'D' ? renderDLine(line) : renderItemisedLine(line);
    };
    return <section key={category.key} className="border-b border-border"><div className="flex min-h-9 items-center gap-1"><CollapseChevron collapsed={majorCollapsed} onToggle={() => toggleMajor(category.key)} label={category.label} /><span className="min-w-0 flex-1 text-lg font-semibold">{category.label}</span>{majorCollapsed && <span className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">{formatCurrency(categoryTotal)}</span>}</div>{!majorCollapsed && <>{category.key === 'C' ? <>{renderCategoryLine(LINES.C[0])}{C_PARENTS.map(renderCParent)}</> : visibleLines.map(renderCategoryLine)}<div className="space-y-0.5 border-t border-border/70 py-1">{renderCategorySubtotals(category)}<div className="flex items-center justify-end gap-2 text-sm font-semibold tabular-nums"><span className="text-muted-foreground">{category.key} total</span><span className={`${NUM_READ_FIELD} w-32`}>{formatCurrency(categoryTotal)}</span></div></div></>}</section>;
  })}</div>;
}

function DRow({ item, workPackages, usedWpIds, editable, onChangeWp, onAmount, onJustification, onDelete }: {
  item: LumpSumCostItem;
  workPackages: LumpSumCostWorkPackage[];
  usedWpIds: Set<string>;
  editable: boolean;
  onChangeWp: (value: string) => void;
  onAmount: (value: number) => void;
  onJustification: (value: string) => void;
  onDelete: () => void;
}) {
  const wp = workPackages.find(candidate => candidate.id === item.wp_draft_id);
  const missing = Number(item.amount ?? 0) > 0 && !item.justification.trim();
  // Only work packages without a row in this line — plus this row's own — are selectable.
  const options = workPackages.filter(candidate => candidate.id === item.wp_draft_id || !usedWpIds.has(candidate.id));
  return <tr className="border-t border-border/70 align-middle">
    <td className="px-1"><Select value={item.wp_draft_id} onValueChange={onChangeWp} disabled={!editable}><SelectTrigger className="h-7 px-1.5 text-xs"><span title={wp?.title ?? wp?.short_name ?? ''}><WPBubble wpNumber={wp?.number} wpColor={wp?.color ?? 'hsl(var(--muted-foreground))'}>{wpLabel(wp)}</WPBubble></span><span className="sr-only"><SelectValue /></span></SelectTrigger><SelectContent>{options.map(candidate => <SelectItem key={candidate.id} value={candidate.id} className="pl-2 [&>span:first-child]:hidden"><span title={candidate.title ?? candidate.short_name ?? ''}><WPBubble wpNumber={candidate.number} wpColor={candidate.color}>{`WP${candidate.number}`}</WPBubble></span></SelectItem>)}</SelectContent></Select></td>
    <td className="px-1"><LocalNumberInput value={item.unit_cost} decimals={2} disabled={!editable} onCommit={onAmount} /></td>
    <td className="px-1"><LocalTextInput value={item.justification} disabled={!editable} className={missing ? warningClass(true) : ''} onCommit={onJustification} />{missing && <span className="text-[10px] text-destructive" aria-live="polite">Justification required</span>}</td>
    <td className="px-1 text-center"><Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" disabled={!editable} aria-label="Delete cost item" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button></td>
  </tr>;
}
