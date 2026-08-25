/**
 * NATIVE Pert chart for Typst — drawn from data, never captured from the DOM.
 *
 * WHY NATIVE: the Pert is a pure geometric drawing (pill-shaped WP boxes,
 * straight dependency arrows, optional free-drawn annotations), so every part
 * of it maps onto a Typst primitive — `box(radius: …)`, `line`, `polygon`,
 * `ellipse`. Emitting it natively removes the export's dependency on the chart
 * being expanded and on-screen, keeps the WP labels as real selectable text,
 * and keeps the figure vector-sharp at any zoom.
 *
 * LAYOUT IS READ, NOT INVENTED. The chart's own model already distinguishes an
 * auto-layout from a user layout (`content.layoutLocked` + `nodePositions` /
 * `nodeSizes`). This module mirrors that resolution order exactly:
 *
 *   locked   → auto-layout defaults, overridden per node by the stored values
 *   unlocked → auto-layout only
 *
 * So when the Pert later gains a fully persisted layout, or a replaceable
 * override image, only `resolvePertLayout` needs to change: everything below
 * consumes plain (x, y, w, h) numbers and knows nothing about how they arose.
 */

import { supabase } from '@/integrations/supabase/client';
import { typstString } from './htmlToTypst';

/* ───────────────────────────── geometry model ───────────────────────────── */

/** CSS px per cm at 96 dpi — the chart's SVG user unit. */
const PX_PER_CM = 96 / 2.54;
const PERT_DEFAULT_WIDTH_CM = 18;
const PERT_DEFAULT_HEIGHT_CM = 8.5;
const NODE_DEFAULT_W = 84;
const NODE_DEFAULT_H = 35;
const NODE_MIN_W = 30;
const NODE_MIN_H = 18;
const ANN_CORNER_DEFAULT_MM = 2.5;
const ANN_CORNER_MAX_MM = 25;

/** Widest the figure may be in the document (the shared 18 cm table width). */
const MAX_WIDTH_CM = 18;

export interface PertChartWP {
  id: string;
  number: number;
  shortName: string;
  color: string;
}

export interface PertChartDependency {
  fromWpId: string;
  toWpId: string;
  direction: 'forward' | 'reverse' | 'bidirectional';
}

interface PertShape {
  id: string;
  kind: 'shape';
  shape: 'rect' | 'roundedRect' | 'circle' | 'triangle';
  x: number; y: number; w: number; h: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  text?: string;
  textColor?: string;
  cornerRadiusMm?: number;
}

interface PertLine {
  id: string;
  kind: 'line';
  routing: 'straight' | 'elbow';
  x1: number; y1: number; x2: number; y2: number;
  stroke: string;
  strokeWidth: number;
  startCap: 'none' | 'arrow';
  endCap: 'none' | 'arrow';
}

type PertAnnotation = PertShape | PertLine;

export interface PertChartData {
  widthCm: number;
  heightCm: number;
  wps: PertChartWP[];
  dependencies: PertChartDependency[];
  annotations: PertAnnotation[];
  nodePositions: Record<string, { x: number; y: number }>;
  nodeSizes: Record<string, { w: number; h: number }>;
  layoutLocked: boolean;
}

/**
 * The chart's auto-layout, copied verbatim from `PERTChartFigure` so the PDF
 * matches the board pixel for pixel. It is a pure function of the WP ids and
 * the frame, which is precisely why it can run outside React.
 */
function computeAutoLayout(
  ids: string[],
  frameW: number,
  frameH: number,
): { positions: Record<string, { x: number; y: number }>; sizes: Record<string, { w: number; h: number }> } {
  const positions: Record<string, { x: number; y: number }> = {};
  const sizes: Record<string, { w: number; h: number }> = {};
  const n = ids.length;
  if (n === 0) return { positions, sizes };

  const halfCm = PX_PER_CM / 2;
  const snapHalf = (px: number) => Math.floor(px / halfCm) * halfCm;
  const minHGap = Math.max(44, frameW * 0.09);
  const minVGap = Math.max(32, frameH * 0.16);

  let best = { cols: 1, w: 0, h: 0, score: -Infinity };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const w = snapHalf((frameW - (cols - 1) * minHGap) / cols);
    const h = snapHalf((frameH - (rows - 1) * minVGap) / rows);
    if (w < NODE_MIN_W || h < NODE_MIN_H) continue;
    const aspect = w / h;
    const score = (w * h) / (1 + Math.abs(Math.log(aspect / 2.4)));
    if (score > best.score) best = { cols, w, h, score };
  }
  if (best.score === -Infinity) {
    best = {
      cols: n,
      w: Math.max(NODE_MIN_W, snapHalf((frameW - (n - 1) * minHGap) / n)),
      h: Math.max(NODE_MIN_H, snapHalf(frameH)),
      score: 0,
    };
  }

  const { cols, w, h } = best;
  const rows = Math.ceil(n / cols);
  const hGap = cols > 1 ? (frameW - cols * w) / (cols - 1) : 0;
  const vGap = rows > 1 ? (frameH - rows * h) / (rows - 1) : 0;

  ids.forEach((id, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const inRow = Math.min(cols, n - row * cols);
    const rowWidth = inRow * w + (inRow - 1) * hGap;
    const startX = (frameW - rowWidth) / 2;
    positions[id] = { x: startX + col * (w + hGap), y: row * (h + vGap) };
    sizes[id] = { w, h };
  });
  return { positions, sizes };
}

interface ResolvedNode {
  id: string;
  number: number;
  shortName: string;
  color: string;
  x: number; y: number; w: number; h: number;
}

/** Auto-layout, then the persisted overrides when the layout is locked. */
export function resolvePertLayout(data: PertChartData): ResolvedNode[] {
  const frameW = Math.round(data.widthCm * PX_PER_CM);
  const frameH = Math.round(data.heightCm * PX_PER_CM);
  const auto = computeAutoLayout(data.wps.map((w) => w.id), frameW, frameH);
  const positions = data.layoutLocked ? { ...auto.positions, ...data.nodePositions } : auto.positions;
  const sizes = data.layoutLocked ? { ...auto.sizes, ...data.nodeSizes } : auto.sizes;
  return data.wps.map((wp) => ({
    id: wp.id,
    number: wp.number,
    shortName: wp.shortName,
    color: wp.color,
    x: positions[wp.id]?.x ?? 100,
    y: positions[wp.id]?.y ?? 100,
    w: Math.max(NODE_MIN_W, Number(sizes[wp.id]?.w) || NODE_DEFAULT_W),
    h: Math.max(NODE_MIN_H, Number(sizes[wp.id]?.h) || NODE_DEFAULT_H),
  }));
}

/** Pill (stadium) edge intersection — same solver the board uses for arrows. */
function edgePoint(
  cx: number, cy: number, adx: number, ady: number, halfW: number, halfH: number,
) {
  const r = Math.min(halfW, halfH);
  const bx = Math.max(0, halfW - r);
  const by = Math.max(0, halfH - r);
  const sdf = (t: number) => {
    const px = Math.abs(adx * t) - bx;
    const py = Math.abs(ady * t) - by;
    return Math.hypot(Math.max(px, 0), Math.max(py, 0)) + Math.min(Math.max(px, py), 0) - r;
  };
  let lo = 0;
  let hi = Math.hypot(halfW, halfH) + r;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (sdf(mid) < 0) lo = mid; else hi = mid;
  }
  const t = (lo + hi) / 2;
  return { x: cx + adx * t, y: cy + ady * t };
}

/* ───────────────────────────────── fetch ────────────────────────────────── */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Everything the drawing needs: the WPs (for number, short name and colour),
 * the dependency edges, and the figure's stored layout/annotations.
 */
export async function fetchPertChartData(
  proposalId: string,
  figureContent: Record<string, unknown> | null | undefined,
  wps: Array<{ id: string; number: number; short_name: string | null; color: string }>,
): Promise<PertChartData> {
  const { data: depRows } = await supabase
    .from('wp_dependencies')
    .select('from_wp_id, to_wp_id, direction')
    .eq('proposal_id', proposalId);

  const c = (figureContent ?? {}) as any;
  const widthCm = Number(c.widthCm) > 0 ? Number(c.widthCm) : PERT_DEFAULT_WIDTH_CM;
  const heightCm = Number(c.heightCm) > 0 ? Number(c.heightCm) : PERT_DEFAULT_HEIGHT_CM;

  return {
    widthCm,
    heightCm,
    wps: wps.map((w) => ({
      id: w.id,
      number: w.number,
      shortName: w.short_name || '',
      color: w.color,
    })),
    dependencies: ((depRows as any[]) || []).map((d) => ({
      fromWpId: d.from_wp_id,
      toWpId: d.to_wp_id,
      direction: (d.direction || 'forward') as PertChartDependency['direction'],
    })),
    annotations: Array.isArray(c.annotations) ? (c.annotations as PertAnnotation[]) : [],
    nodePositions: (c.nodePositions as Record<string, { x: number; y: number }>) || {},
    nodeSizes: (c.nodeSizes as Record<string, { w: number; h: number }>) || {},
    layoutLocked: c.layoutLocked === true,
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/* ──────────────────────────────── emission ──────────────────────────────── */

const HEX = /^#?[0-9a-fA-F]{3,8}$/;
function colour(value: string | undefined, fallback: string): string {
  const v = (value || '').trim();
  if (!v || v === 'none') return fallback;
  if (!HEX.test(v)) return fallback;
  return `rgb("${v.startsWith('#') ? v : `#${v}`}")`;
}

function isNone(value: string | undefined): boolean {
  return (value || '').trim() === 'none';
}

/**
 * Emits the chart as Typst.
 *
 * The whole drawing sits inside one `box` of the frame's physical size, with
 * every element `place`d at absolute coordinates converted px → cm. The box is
 * wrapped in an unbreakable block, so Typst pushes the entire figure to the
 * next page rather than splitting it — the native equivalent of the browser
 * print path's measured straddle check.
 */
export function emitPertChart(data: PertChartData): string {
  const nodes = resolvePertLayout(data);
  if (!nodes.length) return '';

  // Scale down when the frame is wider than the text column; never scale up.
  const k = Math.min(1, MAX_WIDTH_CM / data.widthCm);
  const cm = (px: number) => `${((px / PX_PER_CM) * k).toFixed(3)}cm`;
  const parts: string[] = [];

  const place = (x: number, y: number, body: string) =>
    `place(dx: ${cm(x)}, dy: ${cm(y)}, ${body})`;

  /** Filled triangle arrowhead with its tip at (tx, ty) pointing along dir. */
  const arrowHead = (
    tx: number, ty: number, dx: number, dy: number, width: number, fill: string,
  ) => {
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const size = width * 8;
    const half = width * 3.5;
    const bx = tx - ux * size;
    const by = ty - uy * size;
    const px = -uy * half;
    const py = ux * half;
    const pts = [
      [tx, ty],
      [bx + px, by + py],
      [bx - px, by - py],
    ]
      .map(([x, y]) => `(${cm(x)}, ${cm(y)})`)
      .join(', ');
    return `place(dx: 0cm, dy: 0cm, polygon(fill: ${fill}, stroke: none, ${pts}))`;
  };

  const segment = (
    x1: number, y1: number, x2: number, y2: number, width: number, stroke: string,
  ) =>
    `place(dx: 0cm, dy: 0cm, line(start: (${cm(x1)}, ${cm(y1)}), end: (${cm(x2)}, ${cm(
      y2,
    )}), stroke: ${(width * k).toFixed(2)}pt + ${stroke}))`;

  /* Annotation shapes sit behind the WP boxes, as on the board. */
  for (const ann of data.annotations) {
    if (ann.kind !== 'shape') continue;
    const fill = isNone(ann.fill) ? 'none' : colour(ann.fill, 'none');
    const strokeCol = isNone(ann.stroke) ? null : colour(ann.stroke, 'black');
    const stroke = strokeCol
      ? `${(Math.max(0.25, ann.strokeWidth) * k).toFixed(2)}pt + ${strokeCol}`
      : 'none';
    const label = ann.text
      ? `align(center + horizon, text(size: ${(9 * k).toFixed(1)}pt, fill: ${colour(
          ann.textColor,
          'black',
        )}, t(${typstString(ann.text)})))`
      : '[]';
    const w = cm(ann.w);
    const h = cm(ann.h);
    if (ann.shape === 'circle') {
      parts.push(place(ann.x, ann.y, `ellipse(width: ${w}, height: ${h}, fill: ${fill}, stroke: ${stroke}, ${label})`));
    } else if (ann.shape === 'triangle') {
      const pts = [
        [ann.x + ann.w / 2, ann.y],
        [ann.x + ann.w, ann.y + ann.h],
        [ann.x, ann.y + ann.h],
      ]
        .map(([x, y]) => `(${cm(x)}, ${cm(y)})`)
        .join(', ');
      parts.push(`place(dx: 0cm, dy: 0cm, polygon(fill: ${fill}, stroke: ${stroke}, ${pts}))`);
    } else {
      const mm = Number.isFinite(ann.cornerRadiusMm as number)
        ? Math.max(0, Math.min(ANN_CORNER_MAX_MM, ann.cornerRadiusMm as number))
        : ANN_CORNER_DEFAULT_MM;
      const radius =
        ann.shape === 'roundedRect'
          ? `, radius: ${((Math.min(mm / 10, Math.min(ann.w, ann.h) / 2 / PX_PER_CM)) * k).toFixed(3)}cm`
          : '';
      parts.push(
        place(ann.x, ann.y, `box(width: ${w}, height: ${h}, fill: ${fill}, stroke: ${stroke}${radius}, ${label})`),
      );
    }
  }

  /* WP boxes — pill shaped, label and short name as real text. */
  for (const n of nodes) {
    const lines: string[] = [
      `text(size: ${(11 * k).toFixed(1)}pt, weight: "bold", fill: white, t(${typstString(
        `WP${n.number}`,
      )}))`,
    ];
    if (n.shortName) {
      lines.push(
        `text(size: ${(10 * k).toFixed(1)}pt, fill: white, t(${typstString(n.shortName)}))`,
      );
    }
    const body = `align(center + horizon, block(width: 100%, inset: (x: 2pt), {
      set par(justify: false, leading: 2pt)
      ${lines.join(' + linebreak() + ')}
    }))`;
    parts.push(
      place(
        n.x,
        n.y,
        `box(width: ${cm(n.w)}, height: ${cm(n.h)}, radius: ${cm(n.h / 2)}, fill: ${colour(
          n.color,
          'black',
        )}, clip: true, ${body})`,
      ),
    );
  }

  /* Dependency arrows on top, so the heads stay visible over the boxes. */
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const dep of data.dependencies) {
    const a = byId.get(dep.fromWpId);
    const b = byId.get(dep.toWpId);
    if (!a || !b) continue;
    const acx = a.x + a.w / 2;
    const acy = a.y + a.h / 2;
    const bcx = b.x + b.w / 2;
    const bcy = b.y + b.h / 2;
    const dx = bcx - acx;
    const dy = bcy - acy;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) continue;
    const from = edgePoint(acx, acy, dx / dist, dy / dist, a.w / 2, a.h / 2);
    const to = edgePoint(bcx, bcy, -dx / dist, -dy / dist, b.w / 2, b.h / 2);
    parts.push(segment(from.x, from.y, to.x, to.y, 1.5, 'black'));
    if (dep.direction !== 'reverse') {
      parts.push(arrowHead(to.x, to.y, to.x - from.x, to.y - from.y, 1.5, 'black'));
    }
    if (dep.direction === 'reverse' || dep.direction === 'bidirectional') {
      parts.push(arrowHead(from.x, from.y, from.x - to.x, from.y - to.y, 1.5, 'black'));
    }
  }

  /* Annotation lines last — they are drawn above everything on the board. */
  for (const ann of data.annotations) {
    if (ann.kind !== 'line') continue;
    const strokeCol = colour(ann.stroke, 'black');
    const width = Math.max(0.25, ann.strokeWidth);
    const elbow = ann.routing === 'elbow';
    if (elbow) {
      parts.push(segment(ann.x1, ann.y1, ann.x2, ann.y1, width, strokeCol));
      parts.push(segment(ann.x2, ann.y1, ann.x2, ann.y2, width, strokeCol));
    } else {
      parts.push(segment(ann.x1, ann.y1, ann.x2, ann.y2, width, strokeCol));
    }
    const endDir = elbow
      ? { x: 0, y: Math.sign(ann.y2 - ann.y1) || 1 }
      : { x: ann.x2 - ann.x1, y: ann.y2 - ann.y1 };
    const startDir = elbow
      ? { x: -(Math.sign(ann.x2 - ann.x1) || 1), y: 0 }
      : { x: ann.x1 - ann.x2, y: ann.y1 - ann.y2 };
    if (ann.endCap === 'arrow') {
      parts.push(arrowHead(ann.x2, ann.y2, endDir.x, endDir.y, width, strokeCol));
    }
    if (ann.startCap === 'arrow') {
      parts.push(arrowHead(ann.x1, ann.y1, startDir.x, startDir.y, width, strokeCol));
    }
  }

  return `block(breakable: false, above: 6pt, below: 0pt, box(width: ${cm(
    data.widthCm * PX_PER_CM,
  )}, height: ${cm(data.heightCm * PX_PER_CM)}, {
${parts.join('\n')}
}))`;
}
