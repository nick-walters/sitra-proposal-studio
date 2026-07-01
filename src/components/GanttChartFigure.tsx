import { useMemo, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Download, BarChart3, Image, FileDown } from 'lucide-react';
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
type WpDelBadgeIn = {
  key: string;
  label: string;
  color: string;
  dueMonth: number;
  linkedRows: number[];
  linkedTaskIds: string[];
  anchorRow?: number;
  tooltipTitle: string;
};
type WpMsBadgeIn = {
  key: string;
  id: string;
  number: number;
  label: string;
  dueMonth: number;
  title: string;
};
type WpDelBadgeOut = WpDelBadgeIn & {
  tipX: number;
  leftX: number;
  shapeW: number;
  shapeH: number;
  bodyW: number;
  pointDepth: number;
  rowIdx: number;
  anchorRowResolved: number;
  drawLines: boolean;
  flipped: boolean;
  origins: Array<{ rowIdx: number; x: number }>;
  dotX: number;
};
type WpMsBadgeOut = WpMsBadgeIn & {
  shapeW: number;
  shapeH: number;
  hexLeft: number;
  rowIdx: number;     // -1 = band; otherwise stacked task row
  dotX: number;
  tipX: number;       // connector end-x on badge side (used when on band row)
  origins: Array<{ rowIdx: number; x: number }>; // anchor dot (band row)
  centred: boolean;   // true when stacked vertically onto a task row
};

// Multi-slot layout for badges that share a due-month dot.
//
// Slot order per badge:
//   1) LEFT of dot on anchor row   (chevron tip-right; hex right-tip toward dot)
//   2) RIGHT of dot on anchor row  (chevron tip-left;  hex left-tip toward dot)
//   3+) CENTRED on dotX, stacked into adjacent rows (DOWN by default, UP if
//       anchor is the WP's last task row). Connector is a straight vertical
//       line from anchor (dotX, anchorY) to badge (dotX, badgeY).
//   N) Last-resort horizontal nudge on the anchor row, clamped to overlay.
//
// All candidates are tested against ONE shared placedRects-per-row map covering
// the WP band row (-1) and every task row, with a 4px gap, and clamped to the
// overlay's right edge. First passing candidate wins.
function layoutWpBadges(args: {
  delBadges: WpDelBadgeIn[];
  msBadges: WpMsBadgeIn[];
  tasks: { id: string }[];
  cellWidth: number;
  overlayWidth: number;
  titleRightInOverlay: number; // band row left-edge cutoff (WP title)
}): { dels: WpDelBadgeOut[]; mss: WpMsBadgeOut[] } {
  const { delBadges, msBadges, tasks, cellWidth, overlayWidth, titleRightInOverlay } = args;
  const pointDepth = 4;
  const estimateDelW = (label: string) => Math.max(25, label.length * 5 + 5);
  const estimateMsW = (label: string) => Math.max(26, label.length * 5 + 8);
  const taskRowById = new Map(tasks.map((t, i) => [t.id, i]));
  const taskCount = tasks.length;
  const rectGap = 4;
  const placedRectsByRow = new Map<number, Array<{ left: number; right: number }>>();
  // Seed band-row obstruction from the WP title text.
  if (titleRightInOverlay > -Infinity) {
    placedRectsByRow.set(-1, [{ left: -1e6, right: titleRightInOverlay }]);
  }
  const overlapsRow = (rowIdx: number, left: number, right: number) => {
    const placed = placedRectsByRow.get(rowIdx) || [];
    return placed.some((r) => left < r.right + rectGap && right + rectGap > r.left);
  };
  const commitRect = (rowIdx: number, left: number, right: number) => {
    const arr = placedRectsByRow.get(rowIdx) || [];
    arr.push({ left, right });
    placedRectsByRow.set(rowIdx, arr);
  };

  type Slot = {
    rowIdx: number;
    leftX: number;
    tipX: number;
    flipped: boolean;
    centred: boolean;
  };
  const generateSlots = (
    dueMonth: number,
    shapeW: number,
    anchorRow: number,
  ): Slot[] => {
    const dotX = (dueMonth - 0.5) * cellWidth;
    const slots: Slot[] = [];
    // 1) LEFT
    slots.push({
      rowIdx: anchorRow,
      leftX: dotX - 5 - shapeW,
      tipX: dotX - 5,
      flipped: false,
      centred: false,
    });
    // 2) RIGHT
    slots.push({
      rowIdx: anchorRow,
      leftX: dotX + 5,
      tipX: dotX + 5,
      flipped: true,
      centred: false,
    });
    // 3+) Centred-stacked. DOWN by default; UP if anchor is the last task row.
    // Anchor on band (-1) always stacks DOWN.
    const stackDown = anchorRow === -1 ? true : anchorRow < taskCount - 1;
    const dir = stackDown ? 1 : -1;
    const minRow = -1;
    const maxRow = taskCount - 1;
    let r = anchorRow + dir;
    while (r >= minRow && r <= maxRow) {
      slots.push({
        rowIdx: r,
        leftX: dotX - shapeW / 2,
        tipX: dotX,
        flipped: false,
        centred: true,
      });
      r += dir;
    }
    // Also try the OTHER vertical direction in case the preferred side is full.
    let r2 = anchorRow - dir;
    while (r2 >= minRow && r2 <= maxRow) {
      slots.push({
        rowIdx: r2,
        leftX: dotX - shapeW / 2,
        tipX: dotX,
        flipped: false,
        centred: true,
      });
      r2 -= dir;
    }
    // N) Horizontal nudge fallback on anchor row.
    for (let i = 1; i < 30; i++) {
      const off = i * (shapeW + rectGap);
      slots.push({
        rowIdx: anchorRow,
        leftX: dotX + 5 + off,
        tipX: dotX + 5 + off,
        flipped: true,
        centred: false,
      });
    }
    return slots;
  };
  const pickSlot = (
    slots: Slot[],
    shapeW: number,
    allowOverflowLeftOnTaskRow: boolean,
  ): Slot => {
    for (const s of slots) {
      const right = s.leftX + shapeW;
      if (right > overlayWidth) continue;
      // For band row, the title rect already blocks the left zone.
      // For task rows we allow negative leftX (deliverable extends into title cell).
      if (s.rowIdx === -1 && !allowOverflowLeftOnTaskRow && s.leftX < titleRightInOverlay) continue;
      if (overlapsRow(s.rowIdx, s.leftX, right)) continue;
      return s;
    }
    return slots[slots.length - 1]; // last-resort
  };

  // ── Place milestones first (band row anchor; stack DOWN into task rows).
  const msSorted = [...msBadges].sort(
    (a, b) => a.dueMonth - b.dueMonth || a.number - b.number,
  );
  const mss: WpMsBadgeOut[] = msSorted.map((m) => {
    const shapeW = estimateMsW(m.label);
    const shapeH = 10;
    const dotX = (m.dueMonth - 0.5) * cellWidth;
    const slots = generateSlots(m.dueMonth, shapeW, -1);
    const pick = pickSlot(slots, shapeW, true);
    commitRect(pick.rowIdx, pick.leftX, pick.leftX + shapeW);
    return {
      ...m,
      shapeW,
      shapeH,
      hexLeft: pick.leftX,
      rowIdx: pick.rowIdx,
      dotX,
      tipX: pick.centred ? dotX : pick.tipX,
      origins: [{ rowIdx: -1, x: dotX }],
      centred: pick.centred,
    };
  });

  // ── Deliverables: lowest number first wins the natural LEFT slot.
  const parseDelNum = (s: string) => {
    const m = s.match(/(\d+)(?:\.(\d+))?/);
    if (!m) return 0;
    return (parseInt(m[1], 10) || 0) * 10000 + (parseInt(m[2] || '0', 10) || 0);
  };
  const delSorted = [...delBadges].sort(
    (a, b) => parseDelNum(a.label) - parseDelNum(b.label),
  );
  const dels: WpDelBadgeOut[] = delSorted.map((b) => {
    const bodyW = estimateDelW(b.label);
    const shapeW = bodyW + pointDepth;
    const shapeH = 10;
    const taskId = b.linkedTaskIds[0] ?? null;
    const anchorRow = taskId != null ? (taskRowById.get(taskId) ?? 0) : 0;
    const dotX = (b.dueMonth - 0.5) * cellWidth;
    const slots = generateSlots(b.dueMonth, shapeW, anchorRow);
    const pick = pickSlot(slots, shapeW, true);
    commitRect(pick.rowIdx, pick.leftX, pick.leftX + shapeW);
    return {
      ...b,
      tipX: pick.centred ? dotX : pick.tipX,
      leftX: pick.leftX,
      shapeW,
      shapeH,
      bodyW,
      pointDepth,
      rowIdx: pick.rowIdx,
      anchorRowResolved: anchorRow,
      drawLines: true,
      flipped: pick.flipped,
      origins: [{ rowIdx: anchorRow, x: dotX }],
      dotX,
    };
  });

  return { dels, mss };
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

  // Milestones are no longer rendered on the Gantt.




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

            // Estimate the WP title text's right edge in OVERLAY coordinates
            // (overlay origin = labelWidth from the row's left edge).
            const wpTitleStr = `WP${wp.number}: ${wp.shortName || ''}${wp.shortName && wp.title ? ' – ' : ''}${wp.title || ''}`;
            const wpTitleTextPx = wpTitleStr.length * 6.4;
            const titleBuffer = 4;
            const titleRightInOverlay = (6 + wpTitleTextPx) - labelWidth + titleBuffer;
            const overlayWidthLocal = timelineWidth + MARGIN_GAP;

            // ── Build milestone inputs for this WP (primary WP only).
            const msInputs: WpMsBadgeIn[] = (wpDraftsData?.milestones || [])
              .filter((m: any) => m.due_month != null && wpDraftsData?.msPrimaryWpId.get(m.id) === wp.id)
              .map((m: any) => ({
                key: `ms-${m.id}`,
                id: m.id,
                number: m.number,
                label: `MS${m.number}`,
                dueMonth: m.due_month,
                title: m.title || '',
              }));

            // Compute badge layout (rebuilt every render — cheap). Milestones
            // and deliverables share one placedRects map across band + task rows.
            const { dels: laidOut, mss: msLaidOut } = layoutWpBadges({
              delBadges: wp.delBadges,
              msBadges: msInputs,
              tasks: wp.tasks.map((t: any) => ({ id: t.id })),
              cellWidth,
              overlayWidth: overlayWidthLocal,
              titleRightInOverlay,
            });


            // Per-task title max-width based on the leftmost chevron on that row.
            // The title cell sits immediately left of the timeline, so a chevron with
            // leftX < 0 (in overlay coordinates) extends into the title area.
            // Run AFTER chevron placement so cutoff reflects actual geometry.
            const titleGapPx = 4;
            const taskTitleMaxWidth = new Map<string, number>();
            wp.tasks.forEach((t: any, i: number) => {
              const onRow = laidOut.filter(b => b.rowIdx === i);
              if (onRow.length === 0) return;
              const minLeftX = Math.min(...onRow.map(b => b.leftX));
              if (minLeftX < 0) {
                const constrained = Math.max(20, titleWidth + minLeftX - titleGapPx);
                taskTitleMaxWidth.set(t.id, constrained);
              }
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
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: taskTitleMaxWidth.get(task.id) ?? '100%' }}>{task.name}</span>
                      </div>
                      <div className="relative flex" style={{ marginRight: MARGIN_GAP }}>
                        {months.map(m => (
                          <div
                            key={m}
                            style={{
                              width: cellWidth,
                              height: ROW_HEIGHT,
                              borderRight: `1px solid ${getMonthRightBorder(m, wpColor)}`,
                            }}
                          />
                        ))}
                        {task.startMonth != null && task.endMonth != null && task.endMonth >= task.startMonth && (
                          <div
                            aria-hidden="true"
                            style={{
                              position: 'absolute',
                              top: '10%',
                              height: '80%',
                              left: (task.startMonth - 1) * cellWidth,
                              width: (task.endMonth - task.startMonth + 1) * cellWidth,
                              backgroundColor: taskColor,
                              borderRadius: 9999,
                              pointerEvents: 'none',
                            }}
                          />
                        )}
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
                        // Deliverable connectors take the badge's WP colour so
                        // they always match the chevron.
                        const lineColor = b.color;
                        return b.origins.map((o, oi) => {
                          const oy = yOfRow(o.rowIdx);
                          // Straight line from origin dot to chevron tip
                          // (vertical for centred-stacked since tipX = o.x = dotX).
                          const d = `M ${o.x} ${oy} L ${b.tipX} ${ty}`;
                          return (
                            <g key={`${b.key}-l${oi}`}>
                              <path d={d} stroke={lineColor} strokeWidth={1.333} fill="none" strokeLinecap="square" strokeLinejoin="miter" />
                              <circle cx={o.x} cy={oy} r={2} fill={lineColor} stroke="none" />
                            </g>
                          );
                        });
                      })}
                      {/* Milestone connector lines: from band-row dot to nearest hex tip
                          (or straight down to a stacked hex on a task row). */}
                      {msLaidOut.map((m) => {
                        const ty = yOfRow(m.rowIdx);
                        return (
                          <g key={`ms-line-${m.id}`}>
                            <path
                              d={`M ${m.dotX} ${yOfWpBand} L ${m.tipX} ${ty}`}
                              stroke="#000000"
                              strokeWidth={1.333}
                              fill="none"
                              strokeLinecap="square"
                            />
                            <circle cx={m.dotX} cy={yOfWpBand} r={2} fill="#000000" stroke="none" />
                          </g>
                        );
                      })}
                    </svg>


                    {/* Deliverable chevrons (shape never changes — only position/connector) */}
                    {laidOut.map((b) => {
                      const ty = yOfRow(b.rowIdx);
                      const shapeW = b.shapeW;
                      const shapeH = b.shapeH;
                      const svgPath = b.flipped
                        ? `M ${b.pointDepth},0 L ${shapeW},0 L ${shapeW},${shapeH} L ${b.pointDepth},${shapeH} L 0,${shapeH / 2} Z`
                        : `M 0,0 L ${shapeW - b.pointDepth},0 L ${shapeW},${shapeH / 2} L ${shapeW - b.pointDepth},${shapeH} L 0,${shapeH} Z`;
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
                                  fill="#ffffff"
                                  stroke={b.color}
                                  strokeWidth={1.5}
                                  strokeLinejoin="round"
                                />
                              </svg>
                              <span
                                style={{
                                  position: 'absolute',
                                  top: 0.166,
                                  left: b.flipped ? b.pointDepth : 0,
                                  width: b.bodyW,
                                  height: shapeH,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontFamily: "'Times New Roman', Times, serif",
                                  fontSize: '8pt',
                                  fontWeight: 700,
                                  lineHeight: 1,
                                  color: b.color,
                                  whiteSpace: 'nowrap',
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

                    {/* Milestone hexagons on the WP band row (primary WP only) */}
                    {msLaidOut.map((m) => {
                      const x1 = m.shapeW * 0.12;
                      const x2 = m.shapeW * 0.88;
                      const path = `M ${x1},0 L ${x2},0 L ${m.shapeW},${m.shapeH / 2} L ${x2},${m.shapeH} L ${x1},${m.shapeH} L 0,${m.shapeH / 2} Z`;
                      return (
                        <Tooltip key={`ms-badge-${m.id}`}>
                          <TooltipTrigger asChild>
                            <span
                              style={{
                                position: 'absolute',
                                top: yOfRow(m.rowIdx),
                                left: m.hexLeft,
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
                                <path d={path} fill="#000000" stroke="none" />
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
                            <p className="text-xs font-medium">{m.label}{m.title ? `: ${m.title}` : ''}</p>
                            <p className="text-xs text-muted-foreground">Month {m.dueMonth}</p>
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

          {/* Milestones are intentionally not rendered on the Gantt. */}

          </div>





        </div>
      </TooltipProvider>
    </div>
  );
}
