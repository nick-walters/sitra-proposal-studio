import { useState, useMemo, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Download, BarChart3, Plus, Trash2, Image, FileDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { getContrastingTextColor, lightenColor } from '@/lib/wpColors';
import type { GanttExportData } from '@/lib/figureExport';
import { toast } from 'sonner';
import { scheduleFigurePngCache } from '@/lib/figureCache';
import { B31Pill } from '@/components/B31Pill';

interface Task {
  id: string;
  wpNumber: number;
  taskNumber: number;
  name: string;
  startMonth: number;
  endMonth: number;
  deliverables?: { number: string; name: string; month: number; type?: string; disseminationLevel?: string; leadShortName?: string }[];
  milestones?: { number: number; name: string; month: number; leadShortName?: string }[];
}

interface Milestone {
  id: string;
  number: number;
  name: string;
  month: number;
}

interface WorkPackage {
  number: number;
  shortName: string;
  title: string;
  startMonth: number;
  endMonth: number;
  color: string;
  tasks: Task[];
}

interface GanttContent {
  projectDuration?: number;
  workPackages?: WorkPackage[];
  milestones?: Milestone[];
  reportingPeriods?: { number: number; startMonth: number; endMonth: number }[];
}

interface GanttChartFigureProps {
  figureId?: string;
  figureNumber: string;
  proposalId: string;
  content: GanttContent | null;
  onContentChange: (content: GanttContent) => void;
  canEdit: boolean;
}

// 18cm = 680.315px at 96dpi. We use this as the total chart width.
const TOTAL_WIDTH_PX = 680;
const MIN_CELL_WIDTH = 7;
// Gap between month-grid right edge and figure right margin.
// Must be wide enough for the widest MS badge anchored at the final month
// boundary (triangle tip on the boundary, body extending right).
// MS19 → estimateBubbleW = max(26, 5*6+8) = 38px. Add a 4px safety buffer.
const MARGIN_GAP = 42;
const ROW_HEIGHT = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Per-WP badge layout (deliverables + milestones).
//
// Inputs are already partitioned per WP. Each badge declares:
//   • dueMonth         → tipX = centre of due-month cell
//   • linkedTaskIds    → tasks in this WP (rowIdx[]) for origins/median
//   • useWpBand (ms)   → milestone falls back to the WP band (rowIdx = -1)
//
// Output:
//   • badges with absolute geometry (tipX, leftX, shapeW, shapeH, rowIdx)
//   • drawLines flag (single-task deliverable = no lines, no dot)
//   • origins[] in {rowIdx, x} form — the renderer resolves Y from rowIdx.
//
// Slot search = median row, then ±1, ±2 outward, refusing collisions with
// already-placed badge bodies. Pragmatic v1 (no full pathfinding).
// ─────────────────────────────────────────────────────────────────────────────
type WpBadgeIn = {
  key: string;
  kind: 'del' | 'ms';
  label: string;
  color: string;
  dueMonth: number;
  linkedRows: number[];
  linkedTaskIds: string[];
  anchorRow?: number; // deliverables: row of highest-numbered linked task
  useWpBand?: boolean;
  tooltipTitle: string;
};
type WpBadgeOut = WpBadgeIn & {
  tipX: number;
  leftX: number;
  shapeW: number;
  shapeH: number;
  bodyW: number;
  pointDepth: number;
  rowIdx: number;          // -1 = WP band
  drawLines: boolean;
  flipped: boolean;        // deliverable chevron mirrored (tip on left, body extends right)
  origins: Array<{ rowIdx: number; x: number }>;
};

function layoutWpBadges(args: {
  delBadges: WpBadgeIn[];
  msBadges: WpBadgeIn[];
  tasks: { id: string; startMonth: number; endMonth: number }[];
  wpEndMonth: number;
  cellWidth: number;
  preOccupied?: Array<{ slot: number; lx: number; rx: number }>;
}): WpBadgeOut[] {
  const { delBadges, msBadges, tasks, wpEndMonth, cellWidth, preOccupied } = args;
  const numTasks = tasks.length;
  const pointDepth = 4;
  const estimateMsW = (label: string) => Math.max(32, label.length * 7 + 10);
  const estimateDelW = (label: string) => Math.max(25, label.length * 5 + 5);

  const taskById = new Map(tasks.map((t, i) => [t.id, { ...t, rowIdx: i }]));

  const occupied = new Map<number, Array<[number, number]>>();
  const isFree = (slot: number, lx: number, rx: number) => {
    const list = occupied.get(slot);
    if (!list) return true;
    return list.every(([a, b]) => rx + 2 <= a || lx - 2 >= b);
  };
  const mark = (slot: number, lx: number, rx: number) => {
    const list = occupied.get(slot) || [];
    list.push([lx, rx]);
    occupied.set(slot, list);
  };
  // Pre-mark slots occupied by badges placed in an earlier pass (e.g. chart-wide milestones).
  if (preOccupied) for (const p of preOccupied) mark(p.slot, p.lx, p.rx);


  // Place earlier-due first; deliverables before milestones at same month.
  const all = [...delBadges, ...msBadges].sort((a, b) => {
    if (a.dueMonth !== b.dueMonth) return a.dueMonth - b.dueMonth;
    return a.kind === 'del' ? -1 : 1;
  });

  const out: WpBadgeOut[] = [];
  for (const b of all) {
    const isDel = b.kind === 'del';
    const bodyW = isDel ? estimateDelW(b.label) : estimateMsW(b.label);
    const shapeW = isDel ? bodyW + pointDepth : bodyW;
    const shapeH = isDel ? 10 : 12;
    const tipX = (b.dueMonth - 0.5) * cellWidth - (isDel ? 5 : 0);
    const leftX = isDel ? tipX - shapeW : tipX;


    // Target row:
    //  • milestone with useWpBand → -1 (WP band)
    //  • deliverable → anchor row = highest-numbered linked task (NEVER band)
    //  • else → median of linked rows
    let target: number;
    if (!isDel && b.useWpBand) target = -1;
    else if (isDel) {
      target = b.anchorRow ?? (b.linkedRows.length ? b.linkedRows[b.linkedRows.length - 1] : 0);
    }
    else if (b.linkedRows.length === 0) target = 0;
    else {
      const sorted = [...b.linkedRows].sort((x, y) => x - y);
      target = sorted[Math.floor(sorted.length / 2)];
    }

    // Deliverables must never land on the WP band row (slot -1).
    const minSlot = isDel ? 0 : -1;
    const maxSlot = Math.max(0, numTasks - 1);
    let chosen = Number.NaN;
    for (let step = 0; step <= numTasks + 2; step++) {
      const candidates = step === 0 ? [target] : [target + step, target - step];
      for (const s of candidates) {
        if (s < minSlot || s > maxSlot) continue;
        if (isFree(s, leftX, leftX + shapeW)) { chosen = s; break; }
      }
      if (!Number.isNaN(chosen)) break;
    }
    if (Number.isNaN(chosen)) chosen = Math.max(minSlot, target);
    mark(chosen, leftX, leftX + shapeW);

    // Single-task deliverable → no dot/line per spec.
    const drawLines = !(isDel && b.linkedTaskIds.length === 1);

    const origins: Array<{ rowIdx: number; x: number }> = [];
    if (drawLines) {
      if (!isDel && b.useWpBand) {
        // Clamp: origin can't extend past badge's due month.
        const originMonth = Math.min(wpEndMonth, b.dueMonth);
        origins.push({ rowIdx: -1, x: Math.max(0, (originMonth - 1) * cellWidth) });
      } else {
        for (const tid of b.linkedTaskIds) {
          const t = taskById.get(tid);
          if (!t) continue;
          // originMonth = min(task end month, badge due month) — never past the badge.
          const originMonth = Math.min(t.endMonth, b.dueMonth);
          const x = isDel ? originMonth * cellWidth : (originMonth - 1) * cellWidth;
          origins.push({ rowIdx: t.rowIdx, x });
        }
      }
    }

    out.push({ ...b, tipX, leftX, shapeW, shapeH, bodyW, pointDepth, rowIdx: chosen, drawLines, flipped: false, origins });
  }

  // ── Flip pre-pass: when two deliverables on the SAME row would overlap at the
  // same/adjacent time-point, FLIP the higher-numbered one (chevron mirrored,
  // tip 5px to the RIGHT of the time-point, body extending right). This is the
  // FIRST resort before the vertical-nudge fallback below.
  const parseDelNum = (s: string) => {
    const m = s.match(/(\d+)(?:\.(\d+))?/);
    if (!m) return 0;
    return (parseInt(m[1], 10) || 0) * 10000 + (parseInt(m[2] || '0', 10) || 0);
  };
  const rectsOverlap = (a: WpBadgeOut, b2: WpBadgeOut) =>
    !(a.leftX + a.shapeW + 2 <= b2.leftX || a.leftX >= b2.leftX + b2.shapeW + 2);
  for (let pass = 0; pass < 10; pass++) {
    let flipped = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i], c = out[j];
        if (a.kind !== 'del' || c.kind !== 'del') continue;
        if (a.rowIdx !== c.rowIdx) continue;
        if (!rectsOverlap(a, c)) continue;
        // Pick the higher-numbered to flip (if not already flipped).
        const aN = parseDelNum(a.label), cN = parseDelNum(c.label);
        const target = aN >= cN ? a : c;
        if (target.flipped) continue;
        const newTipX = (target.dueMonth - 0.5) * cellWidth + 5;
        target.tipX = newTipX;
        target.leftX = newTipX; // body extends right from tip
        target.flipped = true;
        flipped = true;
      }
    }
    if (!flipped) break;
  }

  // Repeat-until-stable overlap resolver, extended so that a deliverable
  // badge also avoids OTHER deliverables' connector LINES and origin DOTS
  // (not just other badges). Each iteration recomputes connector obstacles
  // from current slot positions (connector row-span depends on slot), then
  // nudges any badge that overlaps a badge, a pre-occupied (cross-type)
  // slot, or another deliverable's line/dot. Up to 20 iterations.
  const slots = out.map(b => b.rowIdx);
  const pre = preOccupied || [];
  const minS = -1;
  const maxS = Math.max(0, numTasks - 1);
  const range = Math.max(1, maxS - minS) + 2;
  const computeObstacles = () => {
    const list: Array<{ owner: number; slot: number; lx: number; rx: number }> = [];
    for (let j = 0; j < out.length; j++) {
      const bj = out[j];
      if (bj.kind !== 'del' || !bj.drawLines) continue;
      const sj = slots[j];
      for (const o of bj.origins) {
        // Origin DOT (radius ~2 → ±2px obstacle).
        list.push({ owner: j, slot: o.rowIdx, lx: o.x - 2, rx: o.x + 2 });
        // Vertical line segments at originX and tipX span every row
        // between the origin row and the badge's current slot.
        const lo = Math.min(o.rowIdx, sj);
        const hi = Math.max(o.rowIdx, sj);
        for (let r = lo; r <= hi; r++) {
          list.push({ owner: j, slot: r, lx: o.x - 1.5, rx: o.x + 1.5 });
          list.push({ owner: j, slot: r, lx: bj.tipX - 1.5, rx: bj.tipX + 1.5 });
        }
      }
    }
    return list;
  };
  for (let iter = 0; iter < 20; iter++) {
    const obstacles = computeObstacles();
    const overlapsAt = (i: number, slot: number, lx: number, rx: number) => {
      for (let j = 0; j < out.length; j++) {
        if (j === i) continue;
        if (slots[j] !== slot) continue;
        const bj = out[j];
        if (!(rx + 2 <= bj.leftX || lx - 2 >= bj.leftX + bj.shapeW)) return true;
      }
      for (const p of pre) {
        if (p.slot !== slot) continue;
        if (!(rx + 2 <= p.lx || lx - 2 >= p.rx)) return true;
      }
      for (const o of obstacles) {
        if (o.owner === i) continue; // a badge may sit on its OWN connector
        if (o.slot !== slot) continue;
        if (!(rx + 2 <= o.lx || lx - 2 >= o.rx)) return true;
      }
      return false;
    };
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      const b = out[i];
      const lx = b.leftX;
      const rx = b.leftX + b.shapeW;
      const cur = slots[i];
      if (!overlapsAt(i, cur, lx, rx)) continue;
      let found: number | null = null;
      // Deliverables are clamped to slot ≥ 0 (never the WP band row).
      const bMin = b.kind === 'del' ? 0 : minS;
      for (let step = 1; step <= range; step++) {
        for (const cand of [cur + step, cur - step]) {
          if (cand < bMin || cand > maxS) continue;
          if (!overlapsAt(i, cand, lx, rx)) { found = cand; break; }
        }
        if (found != null) break;
      }
      if (found != null && found !== cur) {
        slots[i] = found;
        moved = true;
      }
    }
    if (!moved) break;
  }
  out.forEach((b, i) => { b.rowIdx = slots[i]; });

  return out;
}

// Generic repeat-until-stable overlap resolver. Treats each `items[i]` as a
// placed rectangle in (slot, [lx, rx]) space. Repeatedly nudges any item that
// overlaps another item OR a `preOccupied` rect (cross-type awareness). Returns
// the final slot for each item in the same order.
function iterateOverlapResolution(
  items: Array<{ slot: number; lx: number; rx: number }>,
  preOccupied: Array<{ slot: number; lx: number; rx: number }>,
  minSlot: number,
  maxSlot: number,
  maxIter = 20,
): number[] {
  const slots = items.map(i => i.slot);
  const overlaps = (slot: number, lx: number, rx: number, ignoreIdx: number) => {
    for (let j = 0; j < items.length; j++) {
      if (j === ignoreIdx) continue;
      if (slots[j] !== slot) continue;
      const b = items[j];
      if (!(rx + 2 <= b.lx || lx - 2 >= b.rx)) return true;
    }
    for (const p of preOccupied) {
      if (p.slot !== slot) continue;
      if (!(rx + 2 <= p.lx || lx - 2 >= p.rx)) return true;
    }
    return false;
  };
  const range = Math.max(1, maxSlot - minSlot) + 2;
  for (let iter = 0; iter < maxIter; iter++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      const { lx, rx } = items[i];
      const cur = slots[i];
      if (!overlaps(cur, lx, rx, i)) continue;
      // Search outward from current slot for the nearest non-colliding row.
      let found: number | null = null;
      for (let step = 1; step <= range; step++) {
        for (const cand of [cur + step, cur - step]) {
          if (cand < minSlot || cand > maxSlot) continue;
          if (!overlaps(cand, lx, rx, i)) { found = cand; break; }
        }
        if (found != null) break;
      }
      if (found != null && found !== cur) {
        slots[i] = found;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return slots;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart-wide milestone layout.
// Each milestone renders EXACTLY ONCE across the whole chart.
// Anchor row = the milestone's PRIMARY WP band slot (no median calculation).
// Hexagon left tip sits 5px to the right of the right edge of the due-month cell
// (so the primary WP's own connector line is visible as a short horizontal run).
// Nudge vertically only when needed to avoid overlapping another milestone body.
// ─────────────────────────────────────────────────────────────────────────────
type ChartMsIn = {
  key: string;
  label: string;
  dueMonth: number;
  primaryGlobalRow: number;
  linkedGlobalRows: number[];
  origins: Array<{ globalRow: number; x: number }>;
  tooltipTitle: string;
};
type ChartMsOut = ChartMsIn & {
  tipX: number; leftX: number; shapeW: number; shapeH: number; globalRow: number;
};
function layoutChartMilestones(items: ChartMsIn[], totalRows: number, cellWidth: number): ChartMsOut[] {
  const estimateW = (l: string) => Math.max(32, l.length * 7 + 10);
  const shapeH = 12;
  const HEX_GAP = 5; // px to the right of the due-month cell's right edge
  const occupied: Array<Array<[number, number]>> = Array.from({ length: Math.max(1, totalRows) }, () => []);
  const isFree = (s: number, lx: number, rx: number) => {
    if (s < 0 || s >= totalRows) return false;
    return occupied[s].every(([a, b]) => rx + 2 <= a || lx - 2 >= b);
  };
  const mark = (s: number, lx: number, rx: number) => {
    if (s >= 0 && s < totalRows) occupied[s].push([lx, rx]);
  };
  const sorted = items.slice().sort((a, b) => a.dueMonth - b.dueMonth);
  const out: ChartMsOut[] = [];
  for (const m of sorted) {
    const shapeW = estimateW(m.label);
    const leftX = m.dueMonth * cellWidth + HEX_GAP; // right edge of due cell + gap
    const tipX = leftX;
    const target = m.primaryGlobalRow;
    let chosen = Number.NaN;
    for (let step = 0; step <= totalRows + 2; step++) {
      const cands = step === 0 ? [target] : [target + step, target - step];
      for (const s of cands) {
        if (isFree(s, leftX, leftX + shapeW)) { chosen = s; break; }
      }
      if (!Number.isNaN(chosen)) break;
    }
    if (Number.isNaN(chosen)) chosen = target;
    mark(chosen, leftX, leftX + shapeW);
    out.push({ ...m, tipX, leftX, shapeW, shapeH, globalRow: chosen });
  }

  // Repeat-until-stable resolver — same approach as per-WP layout, applied to
  // the chart-wide MS pass. MS is the first pass overall, so there is nothing
  // pre-occupied at this stage; deliverables (second pass) avoid the resulting
  // MS positions via their own preOccupied list and iterate again themselves.
  iterateOverlapResolution(
    out.map(m => ({ slot: m.globalRow, lx: m.leftX, rx: m.leftX + m.shapeW })),
    [],
    /*minSlot*/ 0,
    /*maxSlot*/ Math.max(0, totalRows - 1),
  ).forEach((slot, i) => { out[i].globalRow = slot; });

  return out;
}




export function GanttChartFigure({
  figureId,
  figureNumber,
  proposalId,
  content,
  onContentChange,
  canEdit,
}: GanttChartFigureProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  // Cache rendered PNG to storage so the backup edge function can include it.
  useEffect(() => {
    if (!figureId) return;
    scheduleFigurePngCache(proposalId, figureId, () => chartRef.current);
  }, [figureId, proposalId, content]);


  // Fetch proposal-level reporting periods
  const { data: proposalData } = useQuery({
    queryKey: ['proposal-rp', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select('duration, reporting_periods')
        .eq('id', proposalId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch wp_drafts with tasks, deliverables, and milestones — fully live from
  // source tables. Includes the new link tables:
  //   * wp_draft_deliverable_tasks  (deliverable → task[])
  //   * proposal_milestone_wps      (milestone → wp[], with is_primary flag)
  // No legacy / degraded / snapshot source is used anywhere below.
  const { data: wpDraftsData } = useQuery({
    queryKey: ['wp-drafts-gantt', proposalId],
    queryFn: async () => {
      const [
        { data: wps, error: wpError },
        { data: tasks, error: taskError },
        { data: deliverables, error: delError },
        { data: delTaskLinks, error: dtlError },
        { data: msData, error: msError },
        { data: msWpLinks, error: mwlError },
        { data: participants, error: partError },
      ] = await Promise.all([
        supabase
          .from('wp_drafts')
          .select('id, number, short_name, title, color')
          .eq('proposal_id', proposalId)
          .order('order_index'),
        supabase
          .from('wp_draft_tasks')
          .select('id, wp_draft_id, number, title, start_month, end_month')
          .order('order_index'),
        supabase
          .from('wp_draft_deliverables')
          .select('id, wp_draft_id, number, title, due_month, type, dissemination_level, responsible_participant_id'),
        supabase
          .from('wp_draft_deliverable_tasks')
          .select('deliverable_id, wp_draft_task_id'),
        supabase
          .from('proposal_milestones')
          .select('id, number, title, due_month')
          .eq('proposal_id', proposalId),
        supabase
          .from('proposal_milestone_wps')
          .select('milestone_id, wp_draft_id, is_primary'),
        supabase
          .from('participants')
          .select('id, organisation_short_name, participant_number')
          .eq('proposal_id', proposalId),
      ]);
      if (wpError) throw wpError;
      if (taskError) throw taskError;
      if (delError) throw delError;
      if (dtlError) throw dtlError;
      if (msError) throw msError;
      if (mwlError) throw mwlError;
      if (partError) throw partError;

      const wpIds = new Set((wps || []).map(wp => wp.id));
      const filteredTasks = (tasks || []).filter(t => wpIds.has(t.wp_draft_id));
      const taskIds = new Set(filteredTasks.map(t => t.id));
      const filteredDels = (deliverables || []).filter(d => wpIds.has(d.wp_draft_id));
      const delIds = new Set(filteredDels.map(d => d.id));
      const msIds = new Set((msData || []).map(m => m.id));

      const delToTaskIds = new Map<string, string[]>();
      for (const l of delTaskLinks || []) {
        if (!delIds.has(l.deliverable_id) || !taskIds.has(l.wp_draft_task_id)) continue;
        const arr = delToTaskIds.get(l.deliverable_id) || [];
        arr.push(l.wp_draft_task_id);
        delToTaskIds.set(l.deliverable_id, arr);
      }

      const msToWpIds = new Map<string, string[]>();
      const msPrimaryWpId = new Map<string, string>();
      for (const l of msWpLinks || []) {
        if (!msIds.has(l.milestone_id) || !wpIds.has(l.wp_draft_id)) continue;
        const arr = msToWpIds.get(l.milestone_id) || [];
        arr.push(l.wp_draft_id);
        msToWpIds.set(l.milestone_id, arr);
        if (l.is_primary) msPrimaryWpId.set(l.milestone_id, l.wp_draft_id);
      }

      return {
        wps: wps || [],
        tasks: filteredTasks,
        deliverables: filteredDels,
        milestones: msData || [],
        participants: participants || [],
        delToTaskIds,
        msToWpIds,
        msPrimaryWpId,
      };
    },
  });



  // Build a typed structure per WP with: tasks (timed only), the WP's active
  // span, and the badges to render in the overlay. Each badge carries the
  // task-row indices it links to (within the WP), so layout & connector lines
  // can be computed below from a single source.
  const dynamicData = useMemo(() => {
    if (!wpDraftsData) return { workPackages: [] as any[], milestones: [] as Milestone[] };

    const { wps, tasks, deliverables, milestones: msRows, participants, delToTaskIds, msToWpIds } = wpDraftsData;

    const partMap = new Map(participants.map(p => [p.id, p.organisation_short_name || `P${p.participant_number}`]));
    const wpNumberById = new Map(wps.map(wp => [wp.id, wp.number]));

    const workPackages = wps.map((wp) => {
      const wpTasks = tasks.filter(t => t.wp_draft_id === wp.id);
      const timedTasks = wpTasks.filter(t => t.start_month != null && t.end_month != null);

      // Stable per-WP task ordering (matches what we render). rowIdx = position.
      const taskRowIdxById = new Map<string, number>();
      timedTasks.forEach((t, i) => taskRowIdxById.set(t.id, i));
      const taskById = new Map(timedTasks.map(t => [t.id, t]));

      const taskStartMonths = timedTasks.map(t => t.start_month!);
      const taskEndMonths = timedTasks.map(t => t.end_month!);
      const wpStart = taskStartMonths.length ? Math.min(...taskStartMonths) : null;
      const wpEnd = taskEndMonths.length ? Math.max(...taskEndMonths) : null;

      const mappedTasks = timedTasks.map(t => ({
        id: t.id,
        wpNumber: wp.number,
        taskNumber: t.number,
        name: t.title || '',
        startMonth: t.start_month!,
        endMonth: t.end_month!,
      }));

      // ── Deliverable badges (one per deliverable). Links: wp_draft_deliverable_tasks.
      const wpDeliverables = deliverables.filter(d => d.wp_draft_id === wp.id && d.due_month != null);
      const taskNumOf = (id: string) => {
        const t = taskById.get(id) as any;
        if (!t) return -Infinity;
        // task.number may be number or string like "1.5" — use trailing segment.
        const raw = String(t.number ?? '');
        const tail = raw.includes('.') ? raw.split('.').pop() : raw;
        const n = parseInt(tail || '0', 10);
        return Number.isFinite(n) ? n : -Infinity;
      };
      const delBadges = wpDeliverables.map(d => {
        const linkedTaskIds = (delToTaskIds.get(d.id) || []).filter(id => taskRowIdxById.has(id));
        const linkedRows = linkedTaskIds.map(id => taskRowIdxById.get(id)!);
        // Anchor row = row of HIGHEST-NUMBERED linked task within this WP.
        let anchorRow: number | undefined = undefined;
        if (linkedTaskIds.length > 0) {
          const sortedIds = [...linkedTaskIds].sort((a, b) => taskNumOf(b) - taskNumOf(a));
          anchorRow = taskRowIdxById.get(sortedIds[0]);
        }
        const wpNum = wpNumberById.get(d.wp_draft_id) ?? wp.number;
        const tooltipParts = [`D${wpNum}.${d.number}: ${d.title || ''}`];
        if (d.type) tooltipParts.push(`Type: ${d.type}`);
        if (d.dissemination_level) tooltipParts.push(`Dissemination: ${d.dissemination_level}`);
        if (d.responsible_participant_id) {
          const lead = partMap.get(d.responsible_participant_id);
          if (lead) tooltipParts.push(`Lead: ${lead}`);
        }
        return {
          key: `del-${d.id}`,
          kind: 'del' as const,
          label: `D${wpNum}.${d.number}`,
          color: wp.color,
          dueMonth: d.due_month!,
          linkedRows,
          // Origin x is computed in layout (right edge of each linked task's end month).
          linkedTaskIds,
          anchorRow,
          tooltipTitle: tooltipParts.join(' | '),
        };
      });

      // Milestones are no longer rendered per-WP; the chart-wide overlay owns them.
      return {
        id: wp.id,
        number: wp.number,
        shortName: wp.short_name || '',
        title: wp.title || '',
        startMonth: wpStart ?? 1,
        endMonth: wpEnd ?? 1,
        color: wp.color,
        tasks: mappedTasks,
        taskById,
        delBadges,
        msBadges: [] as any[],
      };
    });


    const msMapped: Milestone[] = msRows
      .filter(m => m.due_month != null)
      .map(m => ({ id: m.id, number: m.number, name: m.title || '', month: m.due_month! }));

    return { workPackages, milestones: msMapped };
  }, [wpDraftsData]);



  const projectDuration = proposalData?.duration || content?.projectDuration || 36;
  const workPackages = dynamicData.workPackages;
  const milestones = dynamicData.milestones;
  
  const reportingPeriods = useMemo(() => {
    const rpData = (proposalData?.reporting_periods as any[]) || content?.reportingPeriods;
    if (rpData && rpData.length > 0) return rpData;
    const periods: { number: number; startMonth: number; endMonth: number }[] = [];
    let start = 1;
    let num = 1;
    while (start <= projectDuration) {
      const end = Math.min(start + 17, projectDuration);
      periods.push({ number: num, startMonth: start, endMonth: end });
      start = end + 1;
      num++;
    }
    return periods;
  }, [proposalData?.reporting_periods, content?.reportingPeriods, projectDuration]);

  const months = Array.from({ length: projectDuration }, (_, i) => i + 1);
  
  const years = useMemo(() => {
    const yrs: { year: number; months: number[] }[] = [];
    for (let i = 0; i < projectDuration; i += 12) {
      yrs.push({
        year: Math.floor(i / 12) + 1,
        months: months.slice(i, Math.min(i + 12, projectDuration)),
      });
    }
    return yrs;
  }, [projectDuration, months]);

  const handleDurationChange = (duration: number) => {
    onContentChange({ ...content, projectDuration: duration });
  };

  // Calculate cell width: use minimal width for month columns to maximize label space
  const minQuarterWidth = 21;
  const cellWidth = Math.max(MIN_CELL_WIDTH, Math.ceil(minQuarterWidth / 3));
  const timelineWidth = cellWidth * projectDuration;
  const labelWidth = TOTAL_WIDTH_PX - timelineWidth - MARGIN_GAP;
  const overlayWidth = timelineWidth + MARGIN_GAP;

  // Global per-chart row layout. Each WP contributes: 1 header row + N task rows
  // + M untimed task rows. A 2px spacer sits BETWEEN WPs. Slot indices are a
  // continuous integer space; slotCenterY[slot] holds the centre Y in pixels
  // measured from the top of the first WP block.
  const rowLayout = useMemo(() => {
    const wpBandSlot: number[] = [];
    const taskSlotByTaskId = new Map<string, number>();
    const slotCenterY: number[] = [];
    let nextSlot = 0;
    let y = 0;
    workPackages.forEach((wp: any, idx: number) => {
      if (idx > 0) y += 2;
      wpBandSlot[idx] = nextSlot;
      slotCenterY[nextSlot] = y + ROW_HEIGHT / 2;
      nextSlot += 1;
      y += ROW_HEIGHT;
      wp.tasks.forEach((t: any) => {
        taskSlotByTaskId.set(t.id, nextSlot);
        slotCenterY[nextSlot] = y + ROW_HEIGHT / 2;
        nextSlot += 1;
        y += ROW_HEIGHT;
      });
      const untimed = (wpDraftsData?.tasks || []).filter(
        (t: any) => t.wp_draft_id === wp.id && (t.start_month == null || t.end_month == null),
      );
      untimed.forEach(() => {
        slotCenterY[nextSlot] = y + ROW_HEIGHT / 2;
        nextSlot += 1;
        y += ROW_HEIGHT;
      });
    });
    return { wpBandSlot, taskSlotByTaskId, slotCenterY, totalSlots: nextSlot, totalHeight: y };
  }, [workPackages, wpDraftsData]);

  // Chart-wide milestone items (one per milestone).
  const chartMilestones = useMemo(() => {
    if (!wpDraftsData) return [] as ChartMsOut[];
    const { milestones: msRows, msToWpIds, msPrimaryWpId } = wpDraftsData;
    const items: ChartMsIn[] = [];
    for (const m of msRows) {
      try {
        if (m.due_month == null) continue;
        const linkedWpIds = msToWpIds.get(m.id) || [];
        if (linkedWpIds.length === 0) continue;

        // Resolve the primary WP; fall back to the lowest-numbered related WP.
        const primaryFromDb = msPrimaryWpId.get(m.id);
        const linkedWpIdxs = linkedWpIds
          .map(id => workPackages.findIndex((wp: any) => wp.id === id))
          .filter(i => i >= 0);
        if (linkedWpIdxs.length === 0) continue;
        let primaryIdx = primaryFromDb
          ? workPackages.findIndex((wp: any) => wp.id === primaryFromDb)
          : -1;
        if (primaryIdx < 0 || !linkedWpIdxs.includes(primaryIdx)) {
          primaryIdx = linkedWpIdxs
            .slice()
            .sort((a, b) => (workPackages[a].number ?? 0) - (workPackages[b].number ?? 0))[0];
        }
        const primarySlot = rowLayout.wpBandSlot[primaryIdx];
        if (primarySlot == null) {
          // No band slot resolved for the primary WP — skip gracefully rather
          // than crashing the whole figure.
          continue;
        }

        // Connector origins: PRIMARY WP ONLY. Origin x = LEFT edge of the
        // clamped due-month cell on the primary WP's band row.
        const origins: Array<{ globalRow: number; x: number }> = [];
        const linkedGlobalRows: number[] = [];
        {
          const wp: any = workPackages[primaryIdx];
          const wpEnd = wp.endMonth ?? m.due_month;
          const originMonth = Math.min(wpEnd, m.due_month);
          const x = Math.max(0, (originMonth - 1) * cellWidth);
          origins.push({ globalRow: primarySlot, x });
          linkedGlobalRows.push(primarySlot);
        }


        items.push({
          key: `ms-${m.id}`,
          label: `MS${m.number}`,
          dueMonth: m.due_month,
          primaryGlobalRow: primarySlot,
          linkedGlobalRows,
          origins,
          tooltipTitle: `MS${m.number}: ${m.title || ''}`,
        });
      } catch (err) {
        // Defensive: never let a single malformed milestone crash the Gantt.
        // eslint-disable-next-line no-console
        console.warn('[Gantt] Skipping milestone due to error:', m?.id, err);
      }
    }
    return layoutChartMilestones(items, rowLayout.totalSlots, cellWidth);
  }, [wpDraftsData, rowLayout, workPackages, cellWidth]);



  // Border colors - lighter greys
  const borderLight = '#e5e5e5';
  const borderQuarter = '#b3b3b3';
  const borderYear = '#000000';
  const borderDark = '#000000';

  const getMonthRightBorder = (month: number, yearColor?: string) => {
    if (month % 12 === 0) return yearColor || borderYear;
    if (month % 3 === 0) return borderQuarter;
    return borderLight;
  };

  const getFilledCellRightBorder = (month: number, yearColor?: string) => {
    if (month % 12 === 0) return `1px solid ${yearColor || borderYear}`;
    if (month % 3 === 0) return `1px solid ${borderQuarter}`;
    return `1px solid #e8e8e8`;
  };

  const headerLabelStyle = "font-bold italic";
  const fontStyle: React.CSSProperties = { fontFamily: "'Times New Roman', Times, serif", fontSize: '11pt', width: '18cm', maxWidth: '100%', boxSizing: 'border-box' };


  return (
    <div className={canEdit ? "space-y-4" : ""}>
      {canEdit && (
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Figure {figureNumber}. Gantt Chart
          </h3>
           <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                  <Download className="w-3 h-3" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={async () => {
                  if (chartRef.current) {
                    const { exportAsPng } = await import('@/lib/figureExport');
                    await exportAsPng(chartRef.current, `Gantt-Chart-Figure-${figureNumber}`);
                    toast.success('PNG downloaded');
                  }
                }}>
                  <Image className="w-4 h-4 mr-2" />
                  Download as PNG
                </DropdownMenuItem>
                <DropdownMenuItem onClick={async () => {
                  const exportData: GanttExportData = {
                    projectDuration,
                    workPackages: workPackages.map(wp => ({
                      number: wp.number,
                      shortName: wp.shortName,
                      color: wp.color,
                      startMonth: wp.startMonth,
                      endMonth: wp.endMonth,
                      tasks: wp.tasks.map(t => ({
                        wpNumber: t.wpNumber,
                        taskNumber: t.taskNumber,
                        name: t.name,
                        startMonth: t.startMonth,
                        endMonth: t.endMonth,
                      })),
                    })),
                    milestones: milestones.map(m => ({ number: m.number, name: m.name, month: m.month })),
                  };
                  const { exportGanttAsPptx } = await import('@/lib/figureExport');
                  await exportGanttAsPptx(exportData, `Gantt-Chart-Figure-${figureNumber}`);
                  toast.success('PPTX downloaded');
                }}>
                  <FileDown className="w-4 h-4 mr-2" />
                  Download as PPTX
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      <TooltipProvider>
        <div ref={chartRef} className="overflow-hidden" style={fontStyle}>
          {/* Header block: RP, Year, Month rows with unified outer border */}
          <div className="flex">
            {/* Labels column */}
            <div className="shrink-0" style={{ width: labelWidth, paddingTop: 2 }}>
              <div className={`flex items-center justify-end ${headerLabelStyle}`} style={{ height: ROW_HEIGHT, padding: '0 2px' }}>
                Reporting period
              </div>
              <div className={`flex items-center justify-end ${headerLabelStyle}`} style={{ height: ROW_HEIGHT, padding: '0 2px' }}>
                Year
              </div>
              <div className={`flex items-center justify-end ${headerLabelStyle}`} style={{ height: ROW_HEIGHT, padding: '0 2px' }}>
                Quarter
              </div>
            </div>
            {/* Grid column with outer border - shifted left with gap on right */}
            <div style={{ border: `1px solid ${borderDark}`, width: timelineWidth, flexShrink: 0, marginRight: MARGIN_GAP }}>
              {/* Reporting Period Row */}
              <div className="flex">
                {reportingPeriods.map((rp, rpIdx) => {
                  const periodMonths = rp.endMonth - rp.startMonth + 1;
                  return (
                    <div
                      key={rp.number}
                      className="text-center font-bold flex items-center justify-center"
                      style={{ width: periodMonths * cellWidth, height: ROW_HEIGHT, borderLeft: rpIdx > 0 ? `1px solid ${borderDark}` : undefined }}
                    >
                      RP{rp.number}
                    </div>
                  );
                })}
              </div>
              {/* Year Row */}
              <div className="flex" style={{ borderTop: `1px solid ${borderDark}` }}>
                {years.map((yr, yrIdx) => (
                  <div
                    key={yr.year}
                    className="text-center font-bold flex items-center justify-center"
                    style={{ width: yr.months.length * cellWidth, height: ROW_HEIGHT, borderLeft: yrIdx > 0 ? `1px solid ${borderDark}` : undefined }}
                  >
                    Y{yr.year}
                  </div>
                ))}
              </div>
              {/* Month Row - quarterly groups */}
              <div className="flex" style={{ borderTop: `1px solid ${borderDark}` }}>
                {Array.from({ length: Math.ceil(projectDuration / 3) }, (_, qi) => {
                  const startM = qi * 3 + 1;
                  const endM = Math.min(qi * 3 + 3, projectDuration);
                  const count = endM - startM + 1;
                  const isFirstQuarter = qi === 0;
                  const isYearBoundary = (startM - 1) % 12 === 0;
                  const leftBorderColor = isFirstQuarter ? undefined : (isYearBoundary ? borderDark : borderQuarter);
                  return (
                    <div
                      key={qi}
                      className="flex items-center justify-center"
                      style={{ width: cellWidth * count, height: ROW_HEIGHT, padding: 0, borderLeft: leftBorderColor ? `1px solid ${leftBorderColor}` : undefined }}
                    >
                      <span style={{ fontSize: '11pt' }}>Q{(qi % 4) + 1}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>


          {/* Slim spacer after header - non-editable */}
          <div style={{ height: 2 }} aria-hidden="true" />

          {/* Work packages and Tasks — wrapped so chart-wide milestone overlay can span all WPs */}
          <div style={{ position: 'relative' }}>
          {workPackages.map((wp, wpIdx) => {

            const wpColor = wp.color || '#73C92D';
            const taskColor = '#d4d4d4';
            const titleWidth = labelWidth - 38 - 6;

            const untimedTasks = (wpDraftsData?.tasks || [])
              .filter(t => t.wp_draft_id === wp.id)
              .filter(t => t.start_month == null || t.end_month == null);

            // Cross-type collision: chart-wide milestones are laid out first; this
            // per-WP deliverable pass must avoid any milestone that landed on this
            // WP's band or one of its task rows. Convert global slots → local rowIdx.
            const bandSlot = rowLayout.wpBandSlot[wpIdx];
            const taskSlotsLocal = wp.tasks.map((t: any) => rowLayout.taskSlotByTaskId.get(t.id));
            const preOccupied = chartMilestones.flatMap((m) => {
              if (m.globalRow === bandSlot) return [{ slot: -1, lx: m.leftX, rx: m.leftX + m.shapeW }];
              const i = taskSlotsLocal.indexOf(m.globalRow);
              if (i >= 0) return [{ slot: i, lx: m.leftX, rx: m.leftX + m.shapeW }];
              return [];
            });

            // Compute badge layout (rebuilt every render — cheap)
            const laidOut = layoutWpBadges({
              delBadges: wp.delBadges,
              msBadges: wp.msBadges,
              tasks: wp.tasks.map((t: any) => ({ id: t.id, startMonth: t.startMonth, endMonth: t.endMonth })),
              wpEndMonth: wp.endMonth,
              cellWidth,
              preOccupied,
            });

            // Y coordinates relative to the per-WP overlay container.
            // Overlay top = top of WP band; band centre = ROW/2;
            // task row i centre = ROW + i*ROW + ROW/2.
            const yOfWpBand = ROW_HEIGHT / 2;
            const yOfTaskRow = (i: number) => ROW_HEIGHT + i * ROW_HEIGHT + ROW_HEIGHT / 2;
            const yOfRow = (rowIdx: number) => (rowIdx === -1 ? yOfWpBand : yOfTaskRow(rowIdx));
            const overlayHeight = ROW_HEIGHT + wp.tasks.length * ROW_HEIGHT + untimedTasks.length * ROW_HEIGHT;
            const overlayWidth = timelineWidth + MARGIN_GAP;

            return (
              <div key={wp.number}>
                {wpIdx > 0 && <div style={{ height: 2 }} aria-hidden="true" />}

                <div style={{ position: 'relative' }}>
                  {/* WP Header Row - full width bubble */}
                  <div className="flex relative" style={{ height: ROW_HEIGHT }}>
                    <div
                      className="absolute flex items-center font-bold text-white truncate"
                      style={{
                        backgroundColor: wpColor,
                        fontFamily: "'Times New Roman', Times, serif",
                        fontSize: '11pt',
                        fontWeight: 700,
                        padding: '0 12px 0 6px',
                        pointerEvents: 'none',
                        top: 0, bottom: 0, left: 0, right: 0,
                        borderRadius: `${ROW_HEIGHT / 2}px 0 0 ${ROW_HEIGHT / 2}px`,
                        clipPath: `polygon(0% 0%, calc(100% - 12.5px) 0%, 100% 50%, calc(100% - 12.5px) 100%, 0% 100%)`,
                      }}
                    >
                      WP{wp.number}: {wp.shortName || ''}{wp.shortName && wp.title ? ' – ' : ''}{wp.title || ''}
                    </div>
                  </div>

                  {/* Task Rows (no inline badges — badges live in the overlay below) */}
                  {wp.tasks.map((task: any) => (
                    <div key={task.id} className="flex">
                      <div
                        className="shrink-0 flex items-center justify-center"
                        style={{ width: 38, height: ROW_HEIGHT, marginLeft: 6 }}
                      >
                        <B31Pill variant="outline" color={wpColor} style={{ padding: '0px 4px' }}>
                          T{task.wpNumber}.{task.taskNumber}
                        </B31Pill>
                      </div>
                      <div
                        className="shrink-0 flex items-center"
                        style={{ width: titleWidth, height: ROW_HEIGHT, padding: '0 2px', borderRight: `1px solid ${wpColor}`, overflow: 'hidden' }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: '100%' }}>{task.name}</span>
                      </div>
                      <div className="flex" style={{ marginRight: MARGIN_GAP }}>
                        {months.map(m => {
                          const isInTask = m >= task.startMonth && m <= task.endMonth;
                          return (
                            <div
                              key={m}
                              style={{
                                width: cellWidth,
                                height: ROW_HEIGHT,
                                backgroundColor: isInTask ? taskColor : undefined,
                                borderRight: isInTask ? getFilledCellRightBorder(m, wpColor) : `1px solid ${getMonthRightBorder(m, wpColor)}`,
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {/* Untimed task rows */}
                  {untimedTasks.map((task) => (
                    <div key={task.id} className="flex">
                      <div
                        className="shrink-0 flex items-center justify-center"
                        style={{ width: 38, height: ROW_HEIGHT, marginLeft: 6 }}
                      >
                        <B31Pill variant="outline" color={wpColor} style={{ padding: '0px 4px' }}>
                          T{wp.number}.{task.number}
                        </B31Pill>
                      </div>
                      <div
                        className="shrink-0 flex items-center overflow-hidden"
                        style={{ width: titleWidth, height: ROW_HEIGHT, padding: '0 2px', borderRight: `1px solid ${wpColor}` }}
                      >
                        <span className="text-muted-foreground" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
                      </div>
                      <div className="flex" style={{ marginRight: MARGIN_GAP }}>
                        {months.map(m => (
                          <div
                            key={m}
                            style={{ width: cellWidth, height: ROW_HEIGHT, borderRight: `1px solid ${getMonthRightBorder(m, wpColor)}` }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* ── Overlay: connector lines (SVG) + badges, anchored at timeline top-left ── */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: labelWidth,
                      width: overlayWidth,
                      height: overlayHeight,
                      pointerEvents: 'none',
                    }}
                  >
                    {/* Connector lines */}
                    <svg
                      width={overlayWidth}
                      height={overlayHeight}
                      style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
                    >
                      {laidOut.flatMap((b) => {
                        if (!b.drawLines) return [];
                        const ty = yOfRow(b.rowIdx);
                        // Deliverable connectors take the badge's WP colour so they
                        // always match the chevron. Any future per-WP MS would stay black.
                        const lineColor = b.kind === 'del' ? b.color : '#000000';
                        return b.origins.map((o, oi) => {
                          const oy = yOfRow(o.rowIdx);
                          // Vertical-first step: origin → midY → tipX → tip. Same-row = straight horizontal.
                          const d = oy === ty
                            ? `M ${o.x} ${oy} L ${b.tipX} ${ty}`
                            : `M ${o.x} ${oy} L ${o.x} ${(oy + ty) / 2} L ${b.tipX} ${(oy + ty) / 2} L ${b.tipX} ${ty}`;
                          return (
                            <g key={`${b.key}-l${oi}`}>
                              <path d={d} stroke={lineColor} strokeWidth={1} fill="none" strokeLinecap="square" strokeLinejoin="miter" />
                              <circle cx={o.x} cy={oy} r={2} fill={lineColor} stroke={lineColor} strokeWidth={0.5} />

                            </g>
                          );
                        });
                      })}
                    </svg>

                    {/* Badges */}
                    {laidOut.map((b) => {
                      const isMs = b.kind === 'ms';
                      const isDel = !isMs;
                      const ty = yOfRow(b.rowIdx);
                      const shapeW = b.shapeW;
                      const shapeH = b.shapeH;
                      let svgPath: string;
                      if (isMs) {
                        const x1 = shapeW * 0.12;
                        const x2 = shapeW * 0.88;
                        svgPath = `M ${x1},0 L ${x2},0 L ${shapeW},${shapeH / 2} L ${x2},${shapeH} L ${x1},${shapeH} L 0,${shapeH / 2} Z`;
                      } else if (b.flipped) {
                        // Deliverable flipped: left-pointing chevron (tip on left edge)
                        svgPath = `M ${b.pointDepth},0 L ${shapeW},0 L ${shapeW},${shapeH} L ${b.pointDepth},${shapeH} L 0,${shapeH / 2} Z`;
                      } else {
                        // Deliverable: right-pointing chevron (tip on the right edge)
                        svgPath = `M 0,0 L ${shapeW - b.pointDepth},0 L ${shapeW},${shapeH / 2} L ${shapeW - b.pointDepth},${shapeH} L 0,${shapeH} Z`;
                      }
                      return (
                        <Tooltip key={b.key}>
                          <TooltipTrigger asChild>
                            <span
                              style={{
                                position: 'absolute',
                                top: ty,
                                left: b.leftX,
                                transform: 'translateY(-50%)',
                                width: shapeW,
                                height: shapeH,
                                zIndex: 10,
                                pointerEvents: 'auto',
                              }}
                            >
                              <svg
                                width={shapeW}
                                height={shapeH}
                                viewBox={`0 0 ${shapeW} ${shapeH}`}
                                style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
                              >
                                <path
                                  d={svgPath}
                                  fill={isMs ? '#000000' : '#ffffff'}
                                  stroke={isMs ? 'none' : b.color}
                                  strokeWidth={isMs ? 0 : 1.5}
                                  strokeLinejoin={isMs ? 'miter' : 'round'}
                                />
                              </svg>
                              <span
                                style={{
                                  position: 'absolute',
                                  top: isMs ? 0 : -0.5,
                                  left: isMs ? 0 : (b.flipped ? b.pointDepth : 0),
                                  width: isMs ? shapeW : b.bodyW,
                                  height: shapeH,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontFamily: "'Times New Roman', Times, serif",
                                  fontSize: '8pt',
                                  fontWeight: 700,
                                  lineHeight: 1,
                                  color: isMs ? '#ffffff' : b.color,
                                  whiteSpace: 'nowrap',
                                  padding: isMs ? '0 4px' : undefined,
                                  boxSizing: 'border-box',
                                }}
                              >
                                {b.label}
                              </span>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs font-medium">{b.tooltipTitle}</p>
                            <p className="text-xs text-muted-foreground">Month {b.dueMonth}</p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>

                {/* Bottom border under months columns only */}
                <div className="flex">
                  <div className="shrink-0" style={{ width: labelWidth - 1 }} />
                  <div style={{ width: months.length * cellWidth + 1, height: 0, borderBottom: `1px solid ${wpColor}` }} />
                </div>
              </div>
            );
          })}

          {/* Chart-wide milestone overlay — one badge per milestone */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: labelWidth,
              width: overlayWidth,
              height: rowLayout.totalHeight,
              pointerEvents: 'none',
              zIndex: 5,
            }}
          >
            <svg
              width={overlayWidth}
              height={rowLayout.totalHeight}
              style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
            >
              {chartMilestones.flatMap((m) => {
                const ty = rowLayout.slotCenterY[m.globalRow];
                if (ty == null) return [];
                return m.origins.map((o, oi) => {
                  const oy = rowLayout.slotCenterY[o.globalRow];
                  if (oy == null) return null;
                  const d = oy === ty
                    ? `M ${o.x} ${oy} L ${m.tipX} ${ty}`
                    : `M ${o.x} ${oy} L ${o.x} ${(oy + ty) / 2} L ${m.tipX} ${(oy + ty) / 2} L ${m.tipX} ${ty}`;
                  return (
                    <g key={`${m.key}-l${oi}`}>
                      <path d={d} stroke="#000000" strokeWidth={1} fill="none" strokeLinecap="square" strokeLinejoin="miter" />
                      {/* Milestone origin marker: diamond (rotated square), 50% larger than prior dot (1.5 → 2.25). */}
                      <path d={`M ${o.x - 2.25} ${oy} L ${o.x} ${oy - 2.25} L ${o.x + 2.25} ${oy} L ${o.x} ${oy + 2.25} Z`} fill="#000000" />
                    </g>
                  );
                });
              })}
            </svg>
            {chartMilestones.map((m) => {
              const ty = rowLayout.slotCenterY[m.globalRow];
              if (ty == null) return null;
              const x1 = m.shapeW * 0.12;
              const x2 = m.shapeW * 0.88;
              const path = `M ${x1},0 L ${x2},0 L ${m.shapeW},${m.shapeH / 2} L ${x2},${m.shapeH} L ${x1},${m.shapeH} L 0,${m.shapeH / 2} Z`;
              return (
                <Tooltip key={m.key}>
                  <TooltipTrigger asChild>
                    <span
                      style={{
                        position: 'absolute',
                        top: ty,
                        left: m.leftX,
                        transform: 'translateY(-50%)',
                        width: m.shapeW,
                        height: m.shapeH,
                        zIndex: 10,
                        pointerEvents: 'auto',
                      }}
                    >
                      <svg
                        width={m.shapeW}
                        height={m.shapeH}
                        viewBox={`0 0 ${m.shapeW} ${m.shapeH}`}
                        style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
                      >
                        <path d={path} fill="#000000" />
                      </svg>
                      <span
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: m.shapeW,
                          height: m.shapeH,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontFamily: "'Times New Roman', Times, serif",
                          fontSize: '8pt',
                          fontWeight: 700,
                          lineHeight: 1,
                          color: '#ffffff',
                          whiteSpace: 'nowrap',
                          padding: '0 4px',
                          boxSizing: 'border-box',
                        }}
                      >
                        {m.label}
                      </span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs font-medium">{m.tooltipTitle}</p>
                    <p className="text-xs text-muted-foreground">Month {m.dueMonth}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          </div>





        </div>
      </TooltipProvider>
    </div>
  );
}
