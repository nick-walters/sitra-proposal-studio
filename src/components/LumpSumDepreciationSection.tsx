import { useCallback, useEffect, useRef, useState } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WPBubble } from '@/components/B31Pill';
import { CollapseChevron } from '@/components/cards/CollapseChevron';
import { formatCurrency, formatNumber } from '@/lib/formatNumber';
import {
  DEPRECIATION_COMMENT_LIMIT,
  useLumpSumDepreciation,
  type DepreciationItem,
  type DepreciationWorkPackage,
} from '@/hooks/useLumpSumDepreciation';

export const DEPRECIATION_SECTION_ID = 'ls-depreciation-section';
/** Collapse id of the depreciation register itself. */
export const DEPRECIATION_COLLAPSE_ID = 'depreciation';

/* ------------------------------------------------------------------ *
 * Shared collapse state for the whole lump sum panel.
 *
 * One localStorage entry per user and proposal holds a default ("is
 * everything collapsed?") plus per-heading overrides. Every heading in the
 * panel — majors, lines, sub-lines and this register — reads and writes it,
 * which is what lets the toolbar's collapse-all button move all of them at
 * once and lets the state survive a reload. A module-level cache with
 * listeners keeps the separate components in step within one page.
 * ------------------------------------------------------------------ */
type LsCollapseState = { def: boolean; overrides: Record<string, boolean> };

const COLLAPSE_CACHE = new Map<string, LsCollapseState>();
const COLLAPSE_LISTENERS = new Map<string, Set<(state: LsCollapseState) => void>>();

export const lsCollapseStorageKey = (userId: string | null | undefined, proposalId: string) =>
  `ls-collapse:${userId ?? 'anon'}:${proposalId}`;

function loadCollapse(key: string): LsCollapseState {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LsCollapseState>;
      if (parsed && typeof parsed === 'object') {
        return { def: parsed.def !== false, overrides: parsed.overrides ?? {} };
      }
    }
  } catch { /* view preference only */ }
  // Everything starts collapsed.
  return { def: true, overrides: {} };
}

function readCollapse(key: string): LsCollapseState {
  const cached = COLLAPSE_CACHE.get(key);
  if (cached) return cached;
  const loaded = loadCollapse(key);
  COLLAPSE_CACHE.set(key, loaded);
  return loaded;
}

function writeCollapse(key: string, next: LsCollapseState) {
  COLLAPSE_CACHE.set(key, next);
  try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* view preference only */ }
  COLLAPSE_LISTENERS.get(key)?.forEach(listener => listener(next));
}

export function useLsCollapse(userId: string | null | undefined, proposalId: string) {
  const key = lsCollapseStorageKey(userId, proposalId);
  const [state, setState] = useState<LsCollapseState>(() => readCollapse(key));

  // The user id arrives after the first render, so re-read when the key changes.
  useEffect(() => {
    setState(readCollapse(key));
    const listeners = COLLAPSE_LISTENERS.get(key) ?? new Set<(next: LsCollapseState) => void>();
    listeners.add(setState);
    COLLAPSE_LISTENERS.set(key, listeners);
    return () => { listeners.delete(setState); };
  }, [key]);

  const isCollapsed = useCallback((id: string) => state.overrides[id] ?? state.def, [state]);
  const toggle = useCallback((id: string) => {
    const current = readCollapse(key);
    const collapsed = current.overrides[id] ?? current.def;
    writeCollapse(key, { ...current, overrides: { ...current.overrides, [id]: !collapsed } });
  }, [key]);
  const setAll = useCallback((collapsed: boolean) => writeCollapse(key, { def: collapsed, overrides: {} }), [key]);
  const allCollapsed = state.def && !Object.values(state.overrides).some(value => value === false);

  return { isCollapsed, toggle, setAll, allCollapsed };
}

/** Shared heading geometry: one fixed height per hierarchy level. */
export const MAJOR_HEADING_ROW = 'flex h-9 items-center gap-1 overflow-hidden';
export const LINE_HEADING_ROW = 'flex h-8 items-center gap-1 overflow-hidden';
export const SUBLINE_HEADING_ROW = 'flex h-7 items-center gap-1 overflow-hidden';
/** One indent step per level: lines sit at 16px, sub-lines at 32px. */
export const LINE_INDENT = 'pl-4';
export const SUBLINE_INDENT = 'pl-8';

/**
 * Every lump-sum heading toggles from anywhere on the row, not just the
 * chevron. The row is a focusable button-role element so Enter and Space work,
 * and any control inside it must be wrapped in <HeaderControl> so its own click
 * does not also toggle the section.
 */
export function CollapsibleHeader({ className, collapsed, onToggle, children }: {
  className: string;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return <div
    role="button"
    tabIndex={0}
    aria-expanded={!collapsed}
    onClick={onToggle}
    onKeyDown={event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onToggle();
      }
    }}
    className={`${className} cursor-pointer rounded-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring`}
  >{children}</div>;
}

/** Swallows clicks and key presses so controls inside a header never toggle it. */
export function HeaderControl({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span
    className={className ? `${className} contents-none` : undefined}
    onClick={event => event.stopPropagation()}
    onKeyDown={event => event.stopPropagation()}
    onPointerDown={event => event.stopPropagation()}
  >{children}</span>;
}


const RESOURCE_TYPES = [
  { value: 'equipment', label: 'Equipment' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'other_assets', label: 'Other assets' },
] as const;

const FIELD = 'h-7 w-full rounded-md border bg-background px-1.5 text-xs md:text-sm';
const COL_WIDTH = { grip: 30, wp: 96, type: 132, name: 180, date: 130, cost: 112, pct: 78, charged: 118, include: 78, delete: 34 };


function sanitizeNumeric(value: string, decimals: number) {
  let next = value.replace(/,/g, '').replace(/[^0-9.]/g, '');
  const dot = next.indexOf('.');
  if (dot >= 0) next = `${next.slice(0, dot + 1)}${next.slice(dot + 1).replace(/\./g, '')}`;
  if (dot >= 0 && next.length - dot - 1 > decimals) next = next.slice(0, dot + 1 + decimals);
  return next;
}

function numericValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function LocalNumberInput({ value, decimals, disabled, max, onCommit }: {
  value: number | null | undefined;
  decimals: number;
  disabled: boolean;
  max?: number;
  onCommit: (value: number) => void;
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
    let next = sanitizeNumeric(raw, decimals);
    if (max != null && numericValue(next) > max) next = String(max);
    setLocalValue(next);
    setDirty(true);
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => commit(next), 350);
  };
  const display = focused
    ? localValue
    : (dirty ? localValue : serverValue) ? formatNumber(numericValue(dirty ? localValue : serverValue), decimals) : '';

  return <Input
    className={`${FIELD} text-right tabular-nums`}
    type="text"
    inputMode="decimal"
    value={display}
    disabled={disabled}
    onFocus={() => { setFocused(true); if (!dirty) setLocalValue(serverValue); }}
    onChange={event => schedule(event.target.value)}
    onBlur={() => { setFocused(false); if (dirty) commit(); }}
  />;
}

function LocalTextInput({ value, disabled, maxLength, onCommit }: { value: string; disabled: boolean; maxLength?: number; onCommit: (value: string) => void }) {
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
  const schedule = (raw: string) => {
    const next = maxLength ? raw.slice(0, maxLength) : raw;
    setLocalValue(next);
    setDirty(true);
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => commit(next), 350);
  };
  const shown = focused || dirty ? localValue : value;
  return <div className="space-y-0.5">
    <Input
      className={FIELD}
      value={shown}
      maxLength={maxLength}
      disabled={disabled}
      onFocus={() => { setFocused(true); if (!dirty) setLocalValue(value); }}
      onChange={event => schedule(event.target.value)}
      onBlur={() => { setFocused(false); if (dirty) commit(); }}
    />
    {maxLength && <span className="block text-right text-[10px] text-muted-foreground tabular-nums">{shown.length}/{maxLength}</span>}
  </div>;
}

function SortableDepreciationRow({ item, workPackages, editable, onField, onDelete }: {
  item: DepreciationItem;
  workPackages: DepreciationWorkPackage[];
  editable: boolean;
  onField: (field: Parameters<ReturnType<typeof useLumpSumDepreciation>['updateItem']>[1], value: string | number | boolean | null) => void;
  onDelete: () => void;
}) {
  const sortable = useSortable({ id: item.id, disabled: !editable });
  const wp = workPackages.find(candidate => candidate.id === item.wp_draft_id);
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition, opacity: sortable.isDragging ? 0.55 : 1 };
  return <tr ref={sortable.setNodeRef} style={style} className="border-t border-border/70 align-middle">
    <td className="px-1"><Button type="button" variant="ghost" size="icon" className="h-7 w-7 cursor-grab" disabled={!editable} aria-label="Drag investment" {...sortable.attributes} {...sortable.listeners}><GripVertical className="h-4 w-4 text-primary" /></Button></td>
    <td className="px-1">
      <Select value={item.wp_draft_id} onValueChange={value => onField('wp_draft_id', value)} disabled={!editable}>
        <SelectTrigger className="h-7 px-1.5 text-xs">
          <span title={wp?.title ?? wp?.short_name ?? ''}><WPBubble wpNumber={wp?.number} wpColor={wp?.color ?? 'hsl(var(--muted-foreground))'}>{wp ? `WP${wp.number}` : 'Select WP'}</WPBubble></span>
          <span className="sr-only"><SelectValue /></span>
        </SelectTrigger>
        <SelectContent>{workPackages.map(candidate => <SelectItem key={candidate.id} value={candidate.id} className="pl-2 [&>span:first-child]:hidden"><span title={candidate.title ?? candidate.short_name ?? ''}><WPBubble wpNumber={candidate.number} wpColor={candidate.color}>{`WP${candidate.number}`}</WPBubble></span></SelectItem>)}</SelectContent>
      </Select>
    </td>
    <td className="px-1">
      <Select value={item.resource_type} onValueChange={value => onField('resource_type', value)} disabled={!editable}>
        <SelectTrigger className="h-7 px-1.5 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>{RESOURCE_TYPES.map(type => <SelectItem key={type.value} value={type.value} className="pl-2 text-xs [&>span:first-child]:hidden">{type.label}</SelectItem>)}</SelectContent>
      </Select>
    </td>
    <td className="px-1"><LocalTextInput value={item.short_name ?? ''} disabled={!editable} onCommit={value => onField('short_name', value)} /></td>
    <td className="px-1"><Input type="date" className={FIELD} value={item.purchase_date ?? ''} disabled={!editable} onChange={event => onField('purchase_date', event.target.value || null)} /></td>
    <td className="px-1"><LocalNumberInput value={item.purchase_cost} decimals={2} disabled={!editable} onCommit={value => onField('purchase_cost', value)} /></td>
    <td className="px-1"><LocalNumberInput value={item.pct_project} decimals={2} max={100} disabled={!editable} onCommit={value => onField('pct_project', value)} /></td>
    <td className="px-1"><LocalNumberInput value={item.pct_useful_life} decimals={2} max={100} disabled={!editable} onCommit={value => onField('pct_useful_life', value)} /></td>
    <td className="px-1 text-right tabular-nums"><div className={`${FIELD} inline-flex items-center justify-end border-transparent font-semibold`}>{formatCurrency(Number(item.charged_depreciation ?? 0))}</div></td>
    <td className="px-1 text-center"><Checkbox checked={item.include_in_c2} disabled={!editable} aria-label="Include in C.2" onCheckedChange={checked => onField('include_in_c2', checked === true)} /></td>
    <td className="px-1"><LocalTextInput value={item.comments ?? ''} disabled={!editable} maxLength={DEPRECIATION_COMMENT_LIMIT} onCommit={value => onField('comments', value)} /></td>
    <td className="px-1 text-center"><Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" disabled={!editable} aria-label="Delete investment" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button></td>
  </tr>;
}

export function LumpSumDepreciationSection({ proposalId, participantId, userId, editable }: { proposalId: string; participantId: string; userId?: string; editable: boolean }) {
  const { data, isLoading, error, addItem, updateItem, deleteItem, reorderItems } = useLumpSumDepreciation(proposalId);
  const { isCollapsed, toggle: toggleCollapse } = useLsCollapse(userId, proposalId);
  const collapsed = isCollapsed(DEPRECIATION_COLLAPSE_ID);
  const toggle = () => toggleCollapse(DEPRECIATION_COLLAPSE_ID);


  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const items = (data?.items ?? []).filter(item => item.participant_id === participantId).sort((a, b) => a.order_index - b.order_index);
  const workPackages = data?.workPackages ?? [];
  const total = items.reduce((sum, item) => sum + Number(item.charged_depreciation ?? 0), 0);

  if (isLoading) return <div className="pt-3 text-sm text-muted-foreground">Loading depreciation register…</div>;
  if (error) return <div className="pt-3 text-sm text-destructive">Unable to load the depreciation register.</div>;

  const handleDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    const from = items.findIndex(item => item.id === event.active.id);
    const to = items.findIndex(item => item.id === event.over?.id);
    if (from < 0 || to < 0) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    reorderItems(next.map(item => item.id));
  };

  return <section id={DEPRECIATION_SECTION_ID} className={`border-b border-border/70 ${SUBLINE_INDENT}`}>
    <div className={SUBLINE_HEADING_ROW}>
      <CollapseChevron collapsed={collapsed} onToggle={toggle} label="depreciation register" className="h-6 w-6" />
      <h2 className="min-w-0 flex-1 truncate text-xs font-semibold leading-none">Depreciation of equipment, infrastructure and other assets</h2>
      {collapsed && <span className="shrink-0 text-xs font-semibold leading-none tabular-nums text-muted-foreground">{formatCurrency(total)}</span>}
      {!collapsed && editable && <Button type="button" size="sm" variant="outline" className="h-6 shrink-0 px-2 text-xs" onClick={() => addItem(participantId)}>Add depreciation cost</Button>}
    </div>
    {!collapsed && <>
      <p className="pb-1 text-xs text-muted-foreground">
        Charged depreciation is the purchase cost multiplied by the percentage used for the project and by the percentage of the asset’s useful life falling within the project. Ticking “Include in C.2” carries the charge into the C.2 sub-line matching the resource type — infrastructure, equipment or other assets — for that work package.
      </p>

      <div className="overflow-x-auto pb-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map(item => item.id)} strategy={verticalListSortingStrategy}>
            <table className="w-full table-fixed border-collapse text-sm">
              <colgroup>
                <col style={{ width: COL_WIDTH.grip }} />
                <col style={{ width: COL_WIDTH.wp }} />
                <col style={{ width: COL_WIDTH.type }} />
                <col style={{ width: COL_WIDTH.name }} />
                <col style={{ width: COL_WIDTH.date }} />
                <col style={{ width: COL_WIDTH.cost }} />
                <col style={{ width: COL_WIDTH.pct }} />
                <col style={{ width: COL_WIDTH.pct }} />
                <col style={{ width: COL_WIDTH.charged }} />
                <col style={{ width: COL_WIDTH.include }} />
                <col />
                <col style={{ width: COL_WIDTH.delete }} />
              </colgroup>
              <thead><tr className="text-[11px] text-muted-foreground">
                <th />
                <th className="px-1 text-left">Work package</th>
                <th className="px-1 text-left">Resource type</th>
                <th className="px-1 text-left">Short name of investment</th>
                <th className="px-1 text-left">Date of purchase</th>
                <th className="px-1 text-right">Purchase cost (€)</th>
                <th className="px-1 text-right">% project</th>
                <th className="px-1 text-right">% life</th>
                <th className="px-1 text-right">Charged (€)</th>
                <th className="px-1 text-center">Include in C.2</th>
                <th className="px-1 text-left">Comments</th>
                <th />
              </tr></thead>
              <tbody>
                {items.map(item => <SortableDepreciationRow
                  key={item.id}
                  item={item}
                  workPackages={workPackages}
                  editable={editable}
                  onField={(field, value) => updateItem(item.id, field, value)}
                  onDelete={() => deleteItem(item.id)}
                />)}
                {items.length === 0 && <tr><td colSpan={12} className="px-1 py-2 text-xs text-muted-foreground">No investments recorded.</td></tr>}
                <tr className="border-t border-border">
                  <td className="px-1 text-xs font-bold" colSpan={8}>Total charged depreciation</td>
                  <td className="px-1 text-right tabular-nums"><div className={`${FIELD} inline-flex items-center justify-end border-transparent font-bold`}>{formatCurrency(total)}</div></td>
                  <td colSpan={3} />
                </tr>
              </tbody>
            </table>
          </SortableContext>
        </DndContext>
      </div>
    </>}
  </section>;
}

export default LumpSumDepreciationSection;
