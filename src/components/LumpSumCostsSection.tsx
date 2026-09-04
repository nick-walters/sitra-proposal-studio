import { useEffect, useRef, useState } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WPBubble } from '@/components/B31Pill';
import { formatCurrency, formatNumber } from '@/lib/formatNumber';
import { DifferenceNote, NUM_READ_FIELD, READ_FIELD } from '@/components/LumpSumPersonnelTable';
import { LS_COL, LS_D_MIN_WIDTH, LS_FIGURE_CELL, LS_ITEMISED_MIN_WIDTH, LS_TABLE } from '@/lib/lumpSumLayout';
import { type LumpSumCostItem, type LumpSumCostWorkPackage, useLumpSumCosts } from '@/hooks/useLumpSumCosts';
import { useLumpSumDepreciation, type DepreciationItem } from '@/hooks/useLumpSumDepreciation';
import { mirroredCostLineAmount } from '@/lib/lumpSumFigures';
import LumpSumDepreciationSection, {
  CollapsibleHeader,
  DEPRECIATION_SECTION_ID,
  HeaderControl,
  LINE_INDENT,
  SUBLINE_INDENT,
  useLsCollapse,
} from '@/components/LumpSumDepreciationSection';

/**
 * A depreciation charge mirrors into the C.2 sub-line that matches its
 * resource type, so changing the type moves the mirrored row.
 */
const MIRROR_LINE_KEY = (resourceType: string) => `C.2.${resourceType}`;
const MIRRORED_LINE_KEYS = new Set(['C.2.infrastructure', 'C.2.equipment', 'C.2.other_assets']);

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
    <td className="px-1">
      <div className={`${READ_FIELD} justify-between gap-2`}>
        <span className="truncate" title={mirroredJustification(item)}>{mirroredJustification(item)}</span>
        <Button type="button" variant="link" size="sm" className="h-5 shrink-0 px-0 text-[10px]" onClick={jump}>from depreciation register</Button>
      </div>
    </td>
    <td className={LS_FIGURE_CELL}><div className={`${NUM_READ_FIELD} font-semibold`}>{formatCurrency(charged)}</div></td>
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
/** All table widths are sourced from the shared lump-sum layout definition. */
const COL_WIDTH = LS_COL;



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

/** Justification cap for the B, C and D cost lines. UI-only: legacy rows that
 *  are already longer are never truncated, only prevented from growing. */
export const JUSTIFICATION_LIMIT = 150;

function LocalTextInput({ value, disabled, onCommit, className = '', maxLength }: { value: string; disabled: boolean; onCommit: (value: string) => void; className?: string; maxLength?: number }) {
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
  // An existing over-length value keeps its own length as the ceiling, so it is
  // never silently shortened; new text still stops at the limit.
  const cap = maxLength ? Math.max(maxLength, value.length) : undefined;
  const schedule = (raw: string) => {
    const next = cap ? raw.slice(0, cap) : raw;
    setLocalValue(next);
    setDirty(true);
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => commit(next), 350);
  };
  const shown = focused || dirty ? localValue : value;
  const over = maxLength !== undefined && shown.length > maxLength;
  if (maxLength === undefined) {
    return <Input
      className={`${FIELD} ${className}`}
      value={shown}
      disabled={disabled}
      onFocus={() => { setFocused(true); if (!dirty) setLocalValue(value); }}
      onChange={event => schedule(event.target.value)}
      onBlur={() => { setFocused(false); if (dirty) commit(); }}
    />;
  }
  return <div className="space-y-0.5">
    <Input
      className={`${FIELD} ${className}`}
      value={shown}
      maxLength={cap}
      disabled={disabled}
      onFocus={() => { setFocused(true); if (!dirty) setLocalValue(value); }}
      onChange={event => schedule(event.target.value)}
      onBlur={() => { setFocused(false); if (dirty) commit(); }}
    />
    <span
      className={`block text-right text-[10px] tabular-nums ${over ? 'font-medium text-destructive' : 'text-muted-foreground'}`}
      aria-live="polite"
    >
      {shown.length}/{maxLength}{over ? ` (${shown.length - maxLength} over — please shorten)` : ''}
    </span>
  </div>;
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
    <td className="px-1"><LocalTextInput value={item.justification} disabled={!editable} maxLength={JUSTIFICATION_LIMIT} className={missingJustification ? warningClass(strict) : ''} onCommit={onJustification} />{missingJustification && <span className={`text-[10px] ${strict ? 'text-destructive' : 'text-warning'}`} aria-live="polite">{strict ? 'Justification required' : 'Justification recommended'}</span>}</td>
    <td className={LS_FIGURE_CELL}><div className={`${NUM_READ_FIELD} font-semibold`}>{formatCurrency(Number(item.amount ?? 0))}</div></td>
    <td className="px-1 text-center"><Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" disabled={!editable} aria-label="Delete cost item" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button></td>
  </tr>;
}

const DISPLAY_TOTAL_LABELS: Record<string, string> = {
  'C.2.infrastructure': 'Infrastructure total',
  'C.2.equipment': 'Equipment total',
  'C.2.other_assets': 'Other assets total',
  'C.3.consumables': 'Consumables total',
  'C.3.meetings': 'Meetings total',
  'C.3.dissemination': 'Dissemination total',
  'C.3.publication': 'Publication total',
  'C.3.other': 'Other total',
};

export function LumpSumCostsSection({ proposalId, participantId, userId, editable }: { proposalId: string; participantId: string; userId?: string; editable: boolean }) {
  const { data, isLoading, error, addItem, updateQuantity, updateUnitCost, updateJustification, changeWorkPackage, deleteItem, reorderItems } = useLumpSumCosts(proposalId);
  const depreciation = useLumpSumDepreciation(proposalId);
  const mirroredItems = (depreciation.data?.items ?? []).filter(item => item.participant_id === participantId && item.include_in_c2);
  const { isCollapsed, toggle } = useLsCollapse(userId, proposalId);
  const items = data?.items.filter(item => item.participant_id === participantId) ?? [];
  const workPackages = data?.workPackages ?? [];
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  /** The depreciation charges that mirror into a given C.2 sub-line. */
  const mirroredFor = (key: string) => MIRRORED_LINE_KEYS.has(key)
    ? mirroredItems.filter(item => MIRROR_LINE_KEY(item.resource_type) === key)
    : [];
  const itemTotal = (key: string) => mirroredCostLineAmount(items, mirroredItems, key);
  const wpTotal = (key: string, wpId: string) => mirroredCostLineAmount(items, mirroredItems, key, wpId);
  const keysWpTotal = (keys: readonly string[], wpId: string) => keys.reduce((sum, key) => sum + wpTotal(key, wpId), 0);
  /** One row per work package with a non-zero subtotal; zero work packages are hidden. */
  const subtotalRows = (keys: readonly string[]) => workPackages
    .map(wp => ({ wp, total: keysWpTotal(keys, wp.id) }))
    .filter(({ total }) => total > 0);
  const renderSubtotals = (keys: readonly string[], scope: string) => {
    const rows = subtotalRows(keys);
    if (rows.length === 0) return null;
    return <SubtotalTable rows={rows} scope={scope} />;
  };


  if (isLoading) return <div className="pt-3 text-sm text-muted-foreground">Loading B–D costs…</div>;
  if (error) return <div className="pt-3 text-sm text-destructive">Unable to load B–D costs.</div>;
  if (!data) return null;

  const renderItemisedLine = (line: typeof LINES.B[number] | typeof LINES.C[number], nested = false) => {
    const lineItems = items.filter(item => item.cost_line === line.key).sort((a, b) => a.order_index - b.order_index);
    const collapsed = isCollapsed(line.key);
    const mirrored = mirroredFor(line.key);
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
    const displayTotalLabel = DISPLAY_TOTAL_LABELS[line.key] ?? `${line.key} total`;
    return <section key={line.key} className={`border-b border-border/70 ${nested ? SUBLINE_INDENT : LINE_INDENT}`}>
      <CollapsibleHeader collapsed={collapsed} onToggle={() => toggle(line.key)} label={line.label} level={nested ? 'subline' : 'line'}><span className="min-w-0 flex-1 truncate text-xs font-semibold leading-none">{line.label}</span>{collapsed && <span className="shrink-0 text-xs font-semibold leading-none tabular-nums text-muted-foreground">{formatCurrency(itemTotal(line.key))}</span>}{!collapsed && editable && <HeaderControl><Button type="button" size="sm" variant="outline" className="h-6 shrink-0 px-2 text-xs" onClick={() => addItem(participantId, line.key)}>Add item</Button></HeaderControl>}</CollapsibleHeader>
      {!collapsed && <div className="overflow-x-auto pb-2"><DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}><SortableContext items={lineItems.map(item => item.id)} strategy={verticalListSortingStrategy}><table className={`${LS_TABLE} text-sm`} style={{ minWidth: LS_ITEMISED_MIN_WIDTH }}><colgroup><col style={{ width: COL_WIDTH.grip }} /><col style={{ width: COL_WIDTH.wp }} /><col style={{ width: COL_WIDTH.quantity }} /><col style={{ width: COL_WIDTH.unitCost }} /><col /><col style={{ width: COL_WIDTH.figure }} /><col style={{ width: COL_WIDTH.gutter }} /></colgroup><thead><tr className="text-[11px] text-muted-foreground"><th /><th className="px-1 text-left">Work package</th><th className="px-1 text-right">Quantity</th><th className="px-1 text-right">Unit cost (€)</th><th className="px-1 text-left">Justification</th><th className="px-1 text-right">Subtotal (€)</th><th /></tr></thead><tbody>{lineItems.map(item => <SortableCostRow key={item.id} item={item} workPackages={workPackages} editable={editable} strict={line.strict} onChangeWp={value => changeWorkPackage(item.id, value)} onDelete={() => deleteItem(item.id)} onQuantity={value => updateQuantity(item.id, value)} onUnitCost={value => updateUnitCost(item.id, value)} onJustification={value => updateJustification(item.id, value)} />)}{mirrored.map(item => <MirroredCostRow key={`depreciation-${item.id}`} item={item} workPackages={workPackages} />)}</tbody><tfoot><InlineTotalRow label={displayTotalLabel} value={itemTotal(line.key)} leadingColumns={5} measure={`${line.key}-line-total`} /></tfoot></table></SortableContext></DndContext></div>}
    </section>;
  };

  const renderCParent = (parent: typeof C_PARENTS[number]) => {
    const collapsed = isCollapsed(parent.key);
    const childLines = parent.childKeys
      .map(key => LINES.C.find(line => line.key === key))
      .filter((line): line is typeof LINES.C[number] => Boolean(line));
    // Each sub-line already counts its own mirrored charges once.
    const total = childLines.reduce((sum, line) => sum + itemTotal(line.key), 0);
    return <section key={parent.key} className={`border-b border-border/70 ${LINE_INDENT}`}>
      <CollapsibleHeader collapsed={collapsed} onToggle={() => toggle(parent.key)} label={parent.label} level="line"><span className="min-w-0 flex-1 truncate text-xs font-semibold leading-none">{parent.label}</span>{collapsed && <span className="shrink-0 text-xs font-semibold leading-none tabular-nums text-muted-foreground">{formatCurrency(total)}</span>}</CollapsibleHeader>
      {!collapsed && <>
        {parent.key === 'C.2' && <LumpSumDepreciationSection proposalId={proposalId} participantId={participantId} userId={userId} editable={editable} />}
        {childLines.map(line => renderItemisedLine(line, true))}
        <div className="border-t border-border/70 py-1">
          {renderSubtotals(parent.childKeys, parent.key)}
          <TotalRow label={`${parent.key} total`} value={total} measure={`${parent.key}-total`} />
        </div>
      </>}
    </section>;
  };

  const renderDLine = (line: typeof LINES.D[number]) => {
    const collapsed = isCollapsed(line.key);
    const lineItems = items.filter(item => item.cost_line === line.key).sort((a, b) => a.order_index - b.order_index);
    const usedWpIds = new Set(lineItems.map(item => item.wp_draft_id));
    const freeWorkPackages = workPackages.filter(wp => !usedWpIds.has(wp.id));
    return <section key={line.key} className={`border-b border-border/70 ${LINE_INDENT}`}>
      <CollapsibleHeader collapsed={collapsed} onToggle={() => toggle(line.key)} label={line.label} level="line"><span className="min-w-0 flex-1 truncate text-xs font-semibold leading-none">{line.label}</span>{collapsed && <span className="shrink-0 text-xs font-semibold leading-none tabular-nums text-muted-foreground">{formatCurrency(itemTotal(line.key))}</span>}{!collapsed && editable && freeWorkPackages.length > 0 && <HeaderControl><Select onValueChange={wpDraftId => addItem(participantId, line.key, wpDraftId)}><SelectTrigger className="h-6 w-auto min-w-20 shrink-0 px-2 text-xs"><SelectValue placeholder="Add item" /></SelectTrigger><SelectContent>{freeWorkPackages.map(wp => <SelectItem key={wp.id} value={wp.id} className="pl-2 [&>span:first-child]:hidden"><span title={wp.title ?? wp.short_name ?? ''}><WPBubble wpNumber={wp.number} wpColor={wp.color}>{`WP${wp.number}`}</WPBubble></span></SelectItem>)}</SelectContent></Select></HeaderControl>}</CollapsibleHeader>
      {!collapsed && <div className="overflow-x-auto pb-2"><table className={`${LS_TABLE} text-sm`} style={{ minWidth: LS_D_MIN_WIDTH }}><colgroup><col style={{ width: COL_WIDTH.grip }} /><col style={{ width: COL_WIDTH.wp }} /><col /><col style={{ width: COL_WIDTH.figure }} /><col style={{ width: COL_WIDTH.gutter }} /></colgroup><thead><tr className="text-[11px] text-muted-foreground"><th /><th className="px-1 text-left">Work package</th><th className="px-1 text-left">Justification</th><th className="px-1 text-right">Amount (€)</th><th /></tr></thead><tbody>{lineItems.map(item => <DRow key={item.id} item={item} workPackages={workPackages} usedWpIds={usedWpIds} editable={editable} onChangeWp={value => changeWorkPackage(item.id, value)} onAmount={value => updateUnitCost(item.id, value)} onJustification={value => updateJustification(item.id, value)} onDelete={() => deleteItem(item.id)} />)}</tbody><tfoot><InlineTotalRow label={`${line.key} total`} value={itemTotal(line.key)} leadingColumns={3} measure={`${line.key}-line-total`} /></tfoot></table></div>}
    </section>;
  };

  return <div className="mt-1 space-y-1">{CATEGORIES.map(category => {
    const visibleLines = category.lines.filter(line => !(line.key === 'D.1' && !data.usesFstp));
    const majorCollapsed = isCollapsed(category.key);
    const categoryTotal = visibleLines.reduce((sum, line) => sum + itemTotal(line.key), 0);
    const renderCategoryLine = (line: typeof category.lines[number]) => {
      if (category.key === 'C' && (line.key === 'C.2.infrastructure' || line.key === 'C.2.equipment' || line.key === 'C.2.other_assets')) return null;
      if (category.key === 'C' && (line.key === 'C.3.consumables' || line.key === 'C.3.meetings' || line.key === 'C.3.dissemination' || line.key === 'C.3.publication' || line.key === 'C.3.other')) return null;
      return category.key === 'D' ? renderDLine(line) : renderItemisedLine(line);
    };
    return <section key={category.key} className="border-b border-border"><CollapsibleHeader collapsed={majorCollapsed} onToggle={() => toggle(category.key)} label={category.label} level="major"><span className="min-w-0 flex-1 truncate text-base font-semibold leading-none">{category.label}</span>{majorCollapsed && <span className="shrink-0 text-sm font-semibold leading-none tabular-nums text-muted-foreground">{formatCurrency(categoryTotal)}</span>}</CollapsibleHeader>{!majorCollapsed && <>{category.key === 'C' ? <>{renderCategoryLine(LINES.C[0])}{C_PARENTS.map(renderCParent)}</> : visibleLines.map(renderCategoryLine)}<div className="border-t border-border/70 py-1">{renderSubtotals(visibleLines.map(line => line.key), category.key)}<TotalRow label={`${category.key} total`} value={categoryTotal} measure={`${category.key}-total`} /></div></>}</section>;
  })}</div>;
}

/**
 * Per-work-package subtotals and totals reuse the cost table's colgroup, so
 * the label sits on one line immediately left of the Cost column and every
 * value's right edge lines up with the fields above it.
 */
function SubtotalTable({ rows, scope }: { rows: { wp: LumpSumCostWorkPackage; total: number }[]; scope: string }) {
  return <table data-ls-total-table className={`${LS_TABLE} text-sm`}>
    <colgroup>
      <col style={{ width: COL_WIDTH.grip }} />
      <col />
      <col style={{ width: COL_WIDTH.figure }} />
      <col style={{ width: COL_WIDTH.gutter }} />
    </colgroup>
    <tbody>{rows.map(({ wp, total }) => <tr key={`${scope}-${wp.id}`}>
      <td />
      <td className="px-1"><div className="flex h-7 items-center gap-1 whitespace-nowrap text-muted-foreground" title={wp.short_name ? `WP${wp.number}: ${wp.short_name}` : (wp.title ?? undefined)}><WPBubble wpNumber={wp.number} wpColor={wp.color} /><span>subtotal</span></div></td>
      <td data-ls-measure={`${scope}-wp-subtotal`} className="px-1 text-right"><div className={`${NUM_READ_FIELD} font-semibold`}>{formatCurrency(total)}</div></td>
      <td />
    </tr>)}</tbody>
  </table>;
}

export function TotalRow({ label, value, difference = 0, measure }: { label: string; value: number; difference?: number; measure?: string }) {
  return <table data-ls-total-table className={`${LS_TABLE} text-sm`}>
    <colgroup>
      <col style={{ width: COL_WIDTH.grip }} />
      <col />
      <col style={{ width: COL_WIDTH.figure }} />
      <col style={{ width: COL_WIDTH.gutter }} />
    </colgroup>
    <tbody><tr>
      <td />
      <td className="px-1 text-right"><div className={`${READ_FIELD} justify-end whitespace-nowrap font-semibold`}>{label}</div></td>
      {/* The rounding note sits directly beneath the figure, in the same column. */}
      <td data-ls-measure={measure} className="px-1 text-right"><div className={`${NUM_READ_FIELD} h-auto flex-col items-end justify-end whitespace-nowrap font-semibold`}><span>{formatCurrency(value)}</span><DifferenceNote difference={difference} /></div></td>
      <td />
    </tr></tbody>
  </table>;
}

function InlineTotalRow({ label, value, leadingColumns, measure }: { label: string; value: number; leadingColumns: number; measure: string }) {
  return <tr className="border-t-2 border-foreground/30 bg-muted/30 font-semibold">
    <td colSpan={leadingColumns} className="px-1 py-0.5 text-right"><div className={`${READ_FIELD} justify-end whitespace-nowrap font-semibold`}>{label}</div></td>
    <td data-ls-measure={measure} className={`${LS_FIGURE_CELL} py-0.5`}><div className={`${NUM_READ_FIELD} whitespace-nowrap font-semibold`}>{formatCurrency(value)}</div></td>
    <td />
  </tr>;
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
    <td className="px-1" />
    <td className="px-1"><Select value={item.wp_draft_id} onValueChange={onChangeWp} disabled={!editable}><SelectTrigger className="h-7 px-1.5 text-xs"><span title={wp?.title ?? wp?.short_name ?? ''}><WPBubble wpNumber={wp?.number} wpColor={wp?.color ?? 'hsl(var(--muted-foreground))'}>{wpLabel(wp)}</WPBubble></span><span className="sr-only"><SelectValue /></span></SelectTrigger><SelectContent>{options.map(candidate => <SelectItem key={candidate.id} value={candidate.id} className="pl-2 [&>span:first-child]:hidden"><span title={candidate.title ?? candidate.short_name ?? ''}><WPBubble wpNumber={candidate.number} wpColor={candidate.color}>{`WP${candidate.number}`}</WPBubble></span></SelectItem>)}</SelectContent></Select></td>
    <td className="px-1"><LocalTextInput value={item.justification} disabled={!editable} maxLength={JUSTIFICATION_LIMIT} className={missing ? warningClass(true) : ''} onCommit={onJustification} />{missing && <span className="text-[10px] text-destructive" aria-live="polite">Justification required</span>}</td>
    <td className={LS_FIGURE_CELL}><LocalNumberInput value={item.unit_cost} decimals={2} disabled={!editable} onCommit={onAmount} /></td>
    <td className="px-1 text-center"><Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" disabled={!editable} aria-label="Delete cost item" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button></td>
  </tr>;
}
