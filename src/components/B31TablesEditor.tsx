import React, { useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { supabase } from '@/integrations/supabase/client';
import { EditableCaption } from '@/components/EditableCaption';
import { DEFAULT_WP_COLORS } from '@/lib/wpColors';
import { RICH_TEXT_CONFIG } from '@/lib/sanitizePresets';
import { WPBubble, ParticipantBubble, RiskBadge, AllWPsBubble, isAllWPsSelected } from './B31Pill';
import { normalizeRefBadges } from '@/lib/normalizeRefBadges';
import { useColumnResize } from '@/hooks/useColumnResize';
import { ColumnResizer } from '@/components/ColumnResizer';

/**
 * B31TablesEditor — Stage 1 read-only mirrors.
 *
 * Tables 3.1.c / 3.1.d / 3.1.e are read-only views of live source data.
 * Column widths are user-resizable and persisted per proposal via the
 * shared `table_column_widths` table (useColumnResize hook).
 *
 * Spacing: 0pt padding above/below rows, 0pt outer padding on the leftmost
 * cell's left edge and the rightmost cell's right edge, minimal row height.
 */

interface Props {
  proposalId: string;
}

const tableFont = "font-['Times_New_Roman',Times,serif] text-[11pt]";
const cellBase = "align-middle px-2 py-0 leading-tight";

function ReadOnlyHtmlCell({ html }: { html: string | null | undefined }) {
  const raw = (html ?? '').toString();
  if (!raw || raw.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim() === '') {
    return <span className="text-muted-foreground italic">—</span>;
  }
  return (
    <div
      className="font-['Times_New_Roman',Times,serif] text-[11pt] leading-tight [&_p]:my-0"
      dangerouslySetInnerHTML={{ __html: normalizeRefBadges(DOMPurify.sanitize(raw, RICH_TEXT_CONFIG)) }}
    />
  );
}

function ReadOnlyTextCell({ text }: { text: string | null | undefined }) {
  const v = (text ?? '').toString();
  if (!v.trim()) return <span className="text-muted-foreground italic">—</span>;
  return <span>{v}</span>;
}

function MonthLabel({ m }: { m: number | null | undefined }) {
  if (m == null) return <span className="text-muted-foreground italic">—</span>;
  return <span>M{String(m).padStart(2, '0')}</span>;
}

function DeliverablePentagon({ label, color }: { label: string; color?: string }) {
  const stroke = color || '#000';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
      height: '17px', padding: '0 10px 0 5px', fontFamily: "'Times New Roman', Times, serif",
      fontSize: '11pt', fontWeight: 700, lineHeight: 1, color: stroke, whiteSpace: 'nowrap',
    }}>
      <span style={{
        position: 'absolute', inset: 0, backgroundColor: stroke,
        clipPath: 'polygon(0% 0%, calc(100% - 8px) 0%, 100% 50%, calc(100% - 8px) 100%, 0% 100%)',
      }} />
      <span style={{
        position: 'absolute', top: '1.5px', bottom: '1.5px', left: '1.5px', right: '2.5px',
        backgroundColor: '#ffffff',
        clipPath: 'polygon(0% 0%, calc(100% - 7px) 0%, 100% 50%, calc(100% - 7px) 100%, 0% 100%)',
      }} />
      <span style={{ position: 'relative', zIndex: 1 }}>{label}</span>
    </span>
  );
}

function MilestoneBadge({ number }: { number: number | null | undefined }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: '#000', color: '#fff', fontFamily: "'Times New Roman', Times, serif",
      fontSize: '11pt', fontWeight: 700, lineHeight: '18px', height: '18px', padding: '0 4px',
      clipPath: 'polygon(12% 0%, 88% 0%, 100% 50%, 88% 100%, 12% 100%, 0% 50%)',
    }}>
      MS{number ?? ''}
    </span>
  );
}

function useWPLookup(proposalId: string) {
  return useQuery({
    queryKey: ['wp-drafts-for-b31-mirror', proposalId],
    enabled: !!proposalId,
    queryFn: async () => {
      const { data } = await supabase
        .from('wp_drafts')
        .select('id, number, title, short_name, color')
        .eq('proposal_id', proposalId)
        .order('number');
      const list = (data || []).map((wp: any) => ({
        ...wp,
        color: wp.color || DEFAULT_WP_COLORS[(wp.number - 1) % DEFAULT_WP_COLORS.length],
      }));
      const byId = new Map(list.map((wp: any) => [wp.id, wp]));
      const byNumber = new Map(list.map((wp: any) => [wp.number, wp]));
      return { list, byId, byNumber };
    },
  });
}

function useParticipantLookup(proposalId: string) {
  return useQuery({
    queryKey: ['b31-participants-mirror', proposalId],
    enabled: !!proposalId,
    queryFn: async () => {
      const { data } = await supabase
        .from('participants')
        .select('id, participant_number, organisation_short_name, organisation_name')
        .eq('proposal_id', proposalId)
        .order('participant_number');
      const list = data || [];
      return { list, byId: new Map(list.map((p: any) => [p.id, p])) };
    },
  });
}

/**
 * Mirror table column descriptor.
 * - `defaultWidth`: fallback width in px when no saved widths exist.
 * - `flex: true`: this column absorbs leftover width (no default px width).
 */
type Col = {
  label: React.ReactNode;
  defaultWidth?: number;
  flex?: boolean;
  /** `fit: true`: badge-only column — width is measured from the widest badge so it always fits in full. */
  fit?: boolean;
  align?: 'left' | 'center';
  /** Optional override for horizontal padding classes (e.g. 'px-0'). When set, replaces the default first/last-column padding logic for this column's header cell. */
  padX?: string;
  /** Optional marker class (e.g. 'cell-px-0' / 'cell-pl-0' / 'cell-pr-0') applied to both the header th AND to body MCells with the matching index. Pair with `tableClassName="platform-table--tight"` so the scoped CSS rules in index.css zero the padding. */
  cellClass?: string;
};


function MirrorTable({
  proposalId,
  tableKey,
  columns,
  children,
  emptyColSpan,
  emptyLabel,
  isEmpty,
  tableClassName = '',
}: {
  proposalId: string;
  tableKey: string;
  columns: Col[];
  children: React.ReactNode;
  emptyColSpan: number;
  emptyLabel: string;
  isEmpty: boolean;
  /** Extra class(es) on the <table>, e.g. 'platform-table--tight' to enable per-column marker padding overrides. */
  tableClassName?: string;
}) {

  const { colWidths, tableRef, handleColResizeStart } = useColumnResize({
    proposalId,
    tableKey,
    canResize: true,
    minWidth: 24,
  });
  const hasSaved = colWidths.length === columns.length;
  const lastIdx = columns.length - 1;

  // Measured natural widths for `fit` (badge-only) columns, so a badge is never clipped.
  const [fitWidths, setFitWidths] = React.useState<Record<number, number>>({});
  const fitSignature = columns.map((c, i) => (c.fit ? i : '')).join(',');
  React.useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const next: Record<number, number> = {};
    columns.forEach((c, i) => {
      if (!c.fit) return;
      const cells = table.querySelectorAll<HTMLElement>(
        `tbody > tr > td:nth-child(${i + 1}), thead > tr > th:nth-child(${i + 1})`,
      );
      let widest = 0;
      cells.forEach((cell) => {
        let content = 0;
        cell.childNodes.forEach((n) => {
          if (n instanceof HTMLElement) content = Math.max(content, n.getBoundingClientRect().width);
        });
        if (content === 0) content = cell.scrollWidth;
        const cs = getComputedStyle(cell);
        widest = Math.max(widest, content + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight));
      });
      if (widest > 0) next[i] = Math.ceil(widest) + 2;
    });
    setFitWidths((prev) => {
      // Tolerance guard: applying a measured width slightly changes the next
      // measurement, which would otherwise loop forever.
      const same = Object.keys(next).length === Object.keys(prev).length
        && Object.entries(next).every(([k, v]) => Math.abs((prev[Number(k)] ?? -999) - v) <= 2);
      return same ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignature, hasSaved, children]);


  // Fit columns always take their measured badge width, even when the user has
  // saved widths for the table — a badge must never be clipped or wrapped.
  const effectiveWidths = useMemo(
    () => columns.map((c, i) => {
      if (c.fit && fitWidths[i]) return fitWidths[i];
      if (hasSaved) return colWidths[i];
      if (c.flex) return undefined;
      return c.defaultWidth;
    }),
    [columns, fitWidths, hasSaved, colWidths],
  );

  const colStyle = useCallback(
    (i: number): React.CSSProperties => {
      const w = effectiveWidths[i];
      return w ? { width: w } : {};
    },
    [effectiveWidths],
  );

  /**
   * Horizontal cell padding in px. Applied INLINE to the header cells so they
   * match the body cells exactly — the `.platform-table > thead > tr > th`
   * rule in index.css sets `padding: 1px 4px` at a higher specificity than the
   * Tailwind padding utilities, which otherwise indents headers relative to
   * their column content.
   */
  const padPx = (i: number): { left: number; right: number } => {
    const c = columns[i];
    if (c.fit) return { left: i === 0 ? 0 : 4, right: 4 };
    return { left: i === 0 ? 0 : 8, right: i === lastIdx ? 0 : 8 };
  };

  const cellPad = (i: number) => {
    const c = columns[i];
    if (c.padX) return c.padX;
    if (c.fit) return i === 0 ? 'pl-0 pr-1' : 'px-1';
    const left = i === 0 ? 'pl-0' : 'pl-2';
    const right = i === lastIdx ? 'pr-0' : 'pr-2';
    return `${left} ${right}`;
  };

  const fitCols = columns.map((c, i) => (c.fit ? i + 1 : 0)).filter(Boolean);

  const totalWidth = effectiveWidths.every((w) => typeof w === 'number')
    ? (effectiveWidths as number[]).reduce((a, b) => a + b, 0)
    : '100%';

  return (
    <>
    {fitCols.length > 0 && (
      <style>{fitCols
        .map((n) => `[data-table-key="${tableKey}"] > tbody > tr > td:nth-child(${n}){white-space:nowrap;overflow-wrap:normal;word-break:normal;padding-left:${n === 1 ? 0 : 4}px;padding-right:4px;}`)
        .join('\n')}</style>
    )}
    <table
      ref={tableRef}
      data-table-key={tableKey}
      className={`platform-table ${tableClassName} ${tableFont}`.trim()}
      style={{
        tableLayout: 'fixed',
        width: totalWidth,
        maxWidth: '100%',
        borderCollapse: 'collapse',
      }}
    >
      <colgroup>
        {columns.map((_, i) => <col key={i} style={colStyle(i)} />)}
      </colgroup>
      <thead>
        <tr>
          {columns.map((c, i) => (
            <th
              key={i}
              style={c.padX || c.cellClass ? undefined : { paddingLeft: padPx(i).left, paddingRight: padPx(i).right }}
              className={`${cellPad(i)} ${c.cellClass ?? ''} ${c.fit ? 'cell-fit' : ''} py-0 text-[10pt] align-bottom relative ${c.align === 'center' ? 'text-center' : 'text-left'}`}
            >
              {c.label}
              <ColumnResizer onMouseDown={handleColResizeStart(i)} />

            </th>
          ))}
        </tr>
      </thead>

      <tbody className="[&_tr]:border-b [&_tr]:border-black/10 [&_tr:last-child]:border-0">
        {isEmpty ? (
          <tr>
            <td colSpan={emptyColSpan} className={`${cellBase} ${cellPad(0)} text-muted-foreground italic`}>
              {emptyLabel}
            </td>
          </tr>
        ) : (
          React.Children.map(children, (child) => {
            if (!React.isValidElement(child)) return child;
            // Inject cell padding helpers via context-less wrapper: rely on consumer using <MirrorRow/>
            return child;
          })
        )}
      </tbody>
    </table>
    </>
  );
}

/** Standardised cell for mirror tables — minimal padding, edge-flush on first/last column. */
function MCell({
  index,
  last,
  className = '',
  style,
  children,
  colSpan,
  padX,
  cellClass,
}: {
  index: number;
  last: number;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  colSpan?: number;
  /** Optional override for horizontal padding classes (e.g. 'px-0'). When set, replaces the default first/last-column padding logic. */
  padX?: string;
  /** Optional marker class (e.g. 'cell-px-0' / 'cell-pl-0' / 'cell-pr-0') matched by the scoped CSS rules under `.platform-table--tight`. Must mirror the parent Col's cellClass for header/body alignment. */
  cellClass?: string;
}) {
  const pl = index === 0 ? 'pl-0' : 'pl-2';
  const pr = index === last ? 'pr-0' : 'pr-2';
  const padClass = padX ?? `${pl} ${pr}`;
  return (
    <td colSpan={colSpan} className={`${cellBase} ${padClass} ${cellClass ?? ''} ${className}`} style={style}>
      {children}
    </td>
  );
}


/** Parse a comma/space list of WP numbers (e.g. "1, 3, WP5") into number[]. */
function parseWPList(s: string | null | undefined): number[] {
  if (!s) return [];
  return s.split(/[,;\s]+/)
    .map((t) => t.replace(/^WP/i, '').trim())
    .filter(Boolean)
    .map((t) => parseInt(t, 10))
    .filter((n) => Number.isFinite(n));
}

// ============================================================
// Table 3.1.c — Deliverables (read-only mirror)
// ============================================================
type DeliverableOrderMode = 'wp' | 'due';

const orderModeKey = (proposalId: string) => `b31-3-1-c-order:${proposalId}`;

export function B31DeliverablesTable({ proposalId, forExport }: Props & { forExport?: boolean }) {
  const { data: wpInfo } = useWPLookup(proposalId);
  const { data: partInfo } = useParticipantLookup(proposalId);

  const [orderMode, setOrderMode] = React.useState<DeliverableOrderMode>(() => {
    if (typeof window === 'undefined') return 'wp';
    return window.localStorage.getItem(orderModeKey(proposalId)) === 'due' ? 'due' : 'wp';
  });
  const [showToggle, setShowToggle] = React.useState(false);

  const setMode = (mode: DeliverableOrderMode) => {
    setOrderMode(mode);
    try { window.localStorage.setItem(orderModeKey(proposalId), mode); } catch { /* ignore */ }
  };

  const { data: deliverableData } = useQuery({
    queryKey: ['b31-deliverables-live', proposalId],
    enabled: !!proposalId && !!wpInfo,
    queryFn: async () => {
      const wpIds = wpInfo!.list.map((wp: any) => wp.id);
      if (wpIds.length === 0) return { rows: [] as any[], taskRank: new Map<string, number>() };
      const { data } = await supabase
        .from('wp_draft_deliverables')
        .select('id, wp_draft_id, number, title, type, dissemination_level, responsible_participant_id, due_month, description, order_index')
        .in('wp_draft_id', wpIds);

      const isEmpty = (d: any) =>
        !(d.title ?? '').toString().trim() &&
        !(d.type ?? '').toString().trim() &&
        !(d.dissemination_level ?? '').toString().trim() &&
        !d.responsible_participant_id &&
        d.due_month == null;

      const rows = (data || []).filter((d: any) => !isEmpty(d));

      // Secondary ordering criterion: the task a deliverable is assigned to.
      const { data: tasks } = await supabase
        .from('wp_draft_tasks')
        .select('id, number')
        .in('wp_draft_id', wpIds);
      const taskNumById = new Map((tasks || []).map((t: any) => [t.id, t.number]));
      const taskRank = new Map<string, number>();
      if (rows.length > 0) {
        const { data: links } = await supabase
          .from('wp_draft_deliverable_tasks')
          .select('deliverable_id, wp_draft_task_id')
          .in('deliverable_id', rows.map((d: any) => d.id));
        for (const l of links || []) {
          const n = taskNumById.get(l.wp_draft_task_id);
          if (typeof n !== 'number') continue;
          const cur = taskRank.get(l.deliverable_id);
          if (cur == null || n < cur) taskRank.set(l.deliverable_id, n);
        }
      }

      return {
        rows: rows.map((d: any) => ({ ...d, wp: wpInfo!.byId.get(d.wp_draft_id) })),
        taskRank,
      };
    },
  });

  // Exports are always ordered by due date first, then deliverable number.
  const effectiveMode: DeliverableOrderMode = forExport ? 'due' : orderMode;

  const deliverables = useMemo(() => {
    const rows = deliverableData?.rows ?? [];
    const taskRank = deliverableData?.taskRank ?? new Map<string, number>();
    const month = (d: any) => d.due_month ?? Number.POSITIVE_INFINITY;
    const wpNum = (d: any) => d.wp?.number ?? 999;
    return [...rows].sort((a: any, b: any) => {
      if (effectiveMode === 'due') {
        const da = month(a);
        const db = month(b);
        if (da !== db) return da - db;
        const wa = wpNum(a);
        const wb = wpNum(b);
        if (wa !== wb) return wa - wb;
        return (a.number ?? 0) - (b.number ?? 0);
      }
      const wa = wpNum(a);
      const wb = wpNum(b);
      if (wa !== wb) return wa - wb;
      const da = month(a);
      const db = month(b);
      if (da !== db) return da - db;
      const ta = taskRank.get(a.id) ?? Number.POSITIVE_INFINITY;
      const tb = taskRank.get(b.id) ?? Number.POSITIVE_INFINITY;
      if (ta !== tb) return ta - tb;
      const oa = a.order_index ?? a.number ?? 0;
      const ob = b.order_index ?? b.number ?? 0;
      if (oa !== ob) return oa - ob;
      return (a.number ?? 0) - (b.number ?? 0);
    });
  }, [deliverableData, effectiveMode]);



  const columns: Col[] = [
    { label: 'No.', fit: true, defaultWidth: 52 },
    { label: 'Deliverable title', flex: true },
    { label: 'WP', fit: true, defaultWidth: 44 },
    { label: 'Lead', defaultWidth: 78 },
    { label: 'Type', fit: true, defaultWidth: 46 },
    { label: 'Diss.', fit: true, defaultWidth: 42 },
    { label: 'Due', fit: true, defaultWidth: 40 },

  ];
  const last = columns.length - 1;

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowToggle(true)}
      onMouseLeave={() => setShowToggle(false)}
      onFocusCapture={() => setShowToggle(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setShowToggle(false);
        }
      }}
    >
      {!forExport && showToggle && (
        <div
          className="absolute -top-2 left-0 z-20 flex items-center gap-1 rounded-md border bg-background px-1 py-0.5 shadow-sm print:hidden"
          contentEditable={false}
          suppressContentEditableWarning
          onMouseDown={(e) => e.preventDefault()}
        >
          <span className="text-[10px] text-muted-foreground">Order</span>
          {(['wp', 'due'] as DeliverableOrderMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setMode(mode)}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                orderMode === mode
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {mode === 'wp' ? 'Work package' : 'Due date'}
            </button>
          ))}
        </div>
      )}

      <EditableCaption
        proposalId={proposalId}
        tableKey="table-3.1.c"
        label="Table 3.1.c."
        defaultCaption="List of deliverables"
        className="mb-0"
      />

      <MirrorTable
        proposalId={proposalId}
        tableKey="b31-3-1-c-deliverables"
        columns={columns}
        emptyColSpan={7}
        emptyLabel="No deliverables in WP drafts yet."
        isEmpty={deliverables.length === 0}
      >
        {deliverables.map((d: any) => {
          const lead = d.responsible_participant_id ? partInfo?.byId.get(d.responsible_participant_id) : undefined;
          const wp = d.wp;
          const delLabel = wp ? `D${wp.number}.${d.number}` : `D?.${d.number}`;
          return (
            <tr key={d.id}>
              <MCell index={0} last={last} style={{ whiteSpace: 'nowrap' }}>
                <DeliverablePentagon label={delLabel} color={wp?.color} />
              </MCell>
              <MCell index={1} last={last}><ReadOnlyTextCell text={d.title} /></MCell>
              <MCell index={2} last={last}>
                {wp ? <WPBubble wpNumber={wp.number} wpColor={wp.color} /> : <span className="text-muted-foreground italic">—</span>}
              </MCell>
              <MCell index={3} last={last}>
                {lead ? (
                  <ParticipantBubble shortName={lead.organisation_short_name || lead.organisation_name} />
                ) : (
                  <span className="text-muted-foreground italic">—</span>
                )}
              </MCell>
              <MCell index={4} last={last}><ReadOnlyTextCell text={d.type} /></MCell>
              <MCell index={5} last={last}><ReadOnlyTextCell text={d.dissemination_level} /></MCell>
              <MCell index={6} last={last}><MonthLabel m={d.due_month} /></MCell>
            </tr>
          );
        })}
      </MirrorTable>
    </div>
  );
}

// ============================================================
// Table 3.1.d — Milestones (read-only mirror, proposal_milestones)
// ============================================================
export function B31MilestonesTable({ proposalId }: Props) {
  const { data: wpInfo } = useWPLookup(proposalId);

  const { data: milestones = [] } = useQuery({
    queryKey: ['b31-milestones-live', proposalId],
    enabled: !!proposalId,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from('proposal_milestones')
        .select('id, number, title, due_month, means_of_verification, order_index')
        .eq('proposal_id', proposalId)
        .order('number');
      const ids = (rows || []).map((m: any) => m.id);
      let linkMap = new Map<string, string[]>();
      if (ids.length > 0) {
        const { data: links } = await supabase
          .from('proposal_milestone_wps')
          .select('milestone_id, wp_draft_id')
          .in('milestone_id', ids);
        for (const l of links || []) {
          const arr = linkMap.get(l.milestone_id) || [];
          arr.push(l.wp_draft_id);
          linkMap.set(l.milestone_id, arr);
        }
      }
      return (rows || []).map((m: any) => ({ ...m, _wpIds: linkMap.get(m.id) || [] }));
    },
  });

  const sortedMilestones = useMemo(() => {
    const minWpNum = (m: any) => {
      const nums = (m._wpIds as string[])
        .map(id => wpInfo?.byId.get(id)?.number)
        .filter((n: any) => typeof n === 'number') as number[];
      return nums.length ? Math.min(...nums) : Number.POSITIVE_INFINITY;
    };
    return [...milestones].sort((a: any, b: any) => {
      const da = a.due_month ?? Number.POSITIVE_INFINITY;
      const db = b.due_month ?? Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      const wa = minWpNum(a);
      const wb = minWpNum(b);
      if (wa !== wb) return wa - wb;
      return String(a.id).localeCompare(String(b.id));
    });
  }, [milestones, wpInfo]);

  const columns: Col[] = [
    { label: 'No.', fit: true, defaultWidth: 48, cellClass: 'cell-pl-0' },
    { label: 'Milestone', defaultWidth: 220 },
    { label: 'WP(s)', defaultWidth: 113, cellClass: 'cell-px-0' },
    { label: 'Due', fit: true, defaultWidth: 40 },
    { label: 'Means of verification', flex: true, cellClass: 'cell-pr-0' },
  ];

  const last = columns.length - 1;

  return (
    <div>
      <EditableCaption
        proposalId={proposalId}
        tableKey="table-3.1.d"
        label="Table 3.1.d."
        defaultCaption="List of milestones"
        className="mb-0"
      />
      <MirrorTable
        proposalId={proposalId}
        tableKey="b31-3-1-d-milestones"
        columns={columns}
        emptyColSpan={5}
        emptyLabel="No milestones yet."
        isEmpty={sortedMilestones.length === 0}
        tableClassName="platform-table--tight"
      >

        {sortedMilestones.map((m: any) => {
          const wps = (m._wpIds as string[])
            .map((id) => wpInfo?.byId.get(id))
            .filter(Boolean)
            .sort((a: any, b: any) => a.number - b.number);
          return (
            <tr key={m.id}>
              <MCell index={0} last={last} cellClass="cell-pl-0"><MilestoneBadge number={m.number} /></MCell>
              <MCell index={1} last={last}><ReadOnlyTextCell text={m.title} /></MCell>
              <MCell index={2} last={last} cellClass="cell-px-0">
                <div className="flex flex-wrap gap-0.5">
                  {wps.length === 0 && <span className="text-muted-foreground italic">—</span>}
                  {isAllWPsSelected(wps.length, wpInfo?.list.length ?? 0)
                    ? <AllWPsBubble />
                    : wps.map((wp: any) => (
                        <WPBubble key={wp.id} wpNumber={wp.number} wpColor={wp.color} />
                      ))}
                </div>
              </MCell>
              <MCell index={3} last={last}><MonthLabel m={m.due_month} /></MCell>
              <MCell index={4} last={last} cellClass="cell-pr-0"><ReadOnlyHtmlCell html={m.means_of_verification} /></MCell>

            </tr>
          );
        })}
      </MirrorTable>
    </div>
  );
}


// ============================================================
// Table 3.1.e — Critical risks (read-only mirror, proposal_risks)
// ============================================================
export function B31RisksTable({ proposalId }: Props) {
  const { data: wpInfo } = useWPLookup(proposalId);

  const { data: risks = [] } = useQuery({
    queryKey: ['b31-risks-live', proposalId],
    enabled: !!proposalId,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from('proposal_risks')
        .select('id, number, title, likelihood, severity, mitigation, order_index, created_at')
        .eq('proposal_id', proposalId)
        .order('order_index')
        .order('created_at');
      const ids = (rows || []).map((r: any) => r.id);
      let linkMap = new Map<string, string[]>();
      if (ids.length > 0) {
        const { data: links } = await supabase
          .from('proposal_risk_wps')
          .select('risk_id, wp_draft_id')
          .in('risk_id', ids);
        for (const l of links || []) {
          const arr = linkMap.get(l.risk_id) || [];
          arr.push(l.wp_draft_id);
          linkMap.set(l.risk_id, arr);
        }
      }
      return (rows || []).map((r: any) => ({ ...r, _wpIds: linkMap.get(r.id) || [] }));
    },
  });

  // Order matches the manager UI (user-arranged via drag); no in-memory auto-sort.
  const orderedRisks = risks as any[];


  const columns: Col[] = [
    { label: 'Risk', defaultWidth: 240, cellClass: 'cell-pl-0' },
    { label: 'i.', defaultWidth: 30, align: 'center', cellClass: 'cell-px-0' },
    { label: 'ii.', defaultWidth: 30, align: 'center', cellClass: 'cell-px-0' },
    { label: 'WP(s)', defaultWidth: 113, cellClass: 'cell-px-0' },
    { label: 'Mitigation & adaptation measures', flex: true, cellClass: 'cell-pr-0' },
  ];

  const last = columns.length - 1;

  return (
    <div>
      <EditableCaption
        proposalId={proposalId}
        tableKey="table-3.1.e"
        label="Table 3.1.e."
        defaultCaption="Critical risks"
        className="mb-0"
      />
      <MirrorTable
        proposalId={proposalId}
        tableKey="b31-3-1-e-risks"
        columns={columns}
        emptyColSpan={5}
        emptyLabel="No risks yet."
        isEmpty={orderedRisks.length === 0}
        tableClassName="platform-table--tight"
      >
        {orderedRisks.map((r: any) => {
          const wps = (r._wpIds as string[])
            .map((id) => wpInfo?.byId.get(id))
            .filter(Boolean)
            .sort((a: any, b: any) => a.number - b.number);
          return (
            <tr key={r.id}>
              <MCell index={0} last={last} cellClass="cell-pl-0"><ReadOnlyHtmlCell html={r.title} /></MCell>
              <MCell index={1} last={last} cellClass="cell-px-0" className="text-center">
                {r.likelihood ? <RiskBadge level={r.likelihood as 'L' | 'M' | 'H'} /> : <span className="text-muted-foreground">—</span>}
              </MCell>
              <MCell index={2} last={last} cellClass="cell-px-0" className="text-center">
                {r.severity ? <RiskBadge level={r.severity as 'L' | 'M' | 'H'} /> : <span className="text-muted-foreground">—</span>}
              </MCell>
              <MCell index={3} last={last} cellClass="cell-px-0">
                <div className="flex flex-wrap gap-0.5">
                  {wps.length === 0 && <span className="text-muted-foreground italic">—</span>}
                  {isAllWPsSelected(wps.length, wpInfo?.list.length ?? 0)
                    ? <AllWPsBubble />
                    : wps.map((wp: any) => (
                        <WPBubble key={wp.id} wpNumber={wp.number} wpColor={wp.color} />
                      ))}
                </div>
              </MCell>
              <MCell index={4} last={last} cellClass="cell-pr-0"><ReadOnlyHtmlCell html={r.mitigation} /></MCell>

            </tr>
          );
        })}
      </MirrorTable>
    </div>
  );
}
