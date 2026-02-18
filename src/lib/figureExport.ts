import html2canvas from 'html2canvas';
import PptxGenJS from 'pptxgenjs';

/**
 * Export a DOM element as a PNG image download.
 */
export async function exportAsPng(element: HTMLElement, filename: string) {
  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true,
  });
  const link = document.createElement('a');
  link.download = `${filename}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// ========== PERT Chart Native Export ==========

export interface PERTNode {
  id: string;
  number: number;
  shortName: string;
  color: string; // hex color
  x: number; // px position in SVG
  y: number;
}

export interface PERTArrow {
  fromNodeId: string;
  toNodeId: string;
  direction: 'forward' | 'reverse' | 'bidirectional';
}

export interface PERTExportData {
  nodes: PERTNode[];
  arrows: PERTArrow[];
  svgWidth: number;
  svgHeight: number;
}

function hexToRgb(hex: string): string {
  // pptxgenjs wants hex without '#'
  return hex.replace('#', '').toUpperCase();
}

/**
 * Determine if a hex colour is light (needs dark text) or dark (needs white text).
 */
function isLightColor(hex: string): boolean {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
}

export async function exportPERTAsPptx(data: PERTExportData, filename: string) {
  const pptx = new PptxGenJS();
  const slide = pptx.addSlide();

  const nodeWidthPx = 120;
  const nodeHeightPx = 50;

  // Determine scale: fit the SVG coordinate space into the slide
  const slideW = 10; // inches
  const slideH = 5.63;
  const margin = 0.5; // inches
  const usableW = slideW - 2 * margin;
  const usableH = slideH - 2 * margin;

  const scaleX = usableW / data.svgWidth;
  const scaleY = usableH / data.svgHeight;
  const scale = Math.min(scaleX, scaleY);

  const offsetX = margin + (usableW - data.svgWidth * scale) / 2;
  const offsetY = margin + (usableH - data.svgHeight * scale) / 2;

  const toInchesX = (px: number) => offsetX + px * scale;
  const toInchesY = (px: number) => offsetY + px * scale;
  const toInchesW = (px: number) => px * scale;

  // Add WP nodes as rounded rectangles with text
  for (const node of data.nodes) {
    const x = toInchesX(node.x);
    const y = toInchesY(node.y);
    const w = toInchesW(nodeWidthPx);
    const h = toInchesW(nodeHeightPx);
    const fillColor = hexToRgb(node.color);
    const fontColor = 'FFFFFF';

    slide.addText(
      [
        { text: `WP${node.number}\n${node.shortName.length > 12 ? node.shortName.substring(0, 11) + '…' : node.shortName}`, options: { fontSize: 10, bold: false, color: fontColor } },
      ],
      {
        shape: pptx.ShapeType.roundRect,
        x,
        y,
        w,
        h,
        rectRadius: 0.1,
        fill: { color: fillColor },
        align: 'center',
        valign: 'middle',
      }
    );
  }

  // Add arrows as lines
  const nodeMap = new Map(data.nodes.map(n => [n.id, n]));

  for (const arrow of data.arrows) {
    const fromNode = nodeMap.get(arrow.fromNodeId);
    const toNode = nodeMap.get(arrow.toNodeId);
    if (!fromNode || !toNode) continue;

    // Compute center points
    const fromCX = fromNode.x + nodeWidthPx / 2;
    const fromCY = fromNode.y + nodeHeightPx / 2;
    const toCX = toNode.x + nodeWidthPx / 2;
    const toCY = toNode.y + nodeHeightPx / 2;

    const dx = toCX - fromCX;
    const dy = toCY - fromCY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) continue;

    // Get edge intersection points
    const halfW = nodeWidthPx / 2;
    const halfH = nodeHeightPx / 2;
    const getEdge = (cx: number, cy: number, adx: number, ady: number) => {
      const absDx = Math.abs(adx);
      const absDy = Math.abs(ady);
      const s = absDx * halfH > absDy * halfW ? halfW / absDx : halfH / absDy;
      return { x: cx + adx * s, y: cy + ady * s };
    };

    const from = getEdge(fromCX, fromCY, dx / dist, dy / dist);
    const to = getEdge(toCX, toCY, -dx / dist, -dy / dist);

    const x1 = toInchesX(from.x);
    const y1 = toInchesY(from.y);
    const x2 = toInchesX(to.x);
    const y2 = toInchesY(to.y);

    // pptxgenjs line uses x, y, w, h where the line goes from (x,y) to (x+w, y+h)
    const lineW = x2 - x1;
    const lineH = y2 - y1;

    const endArrowType = arrow.direction !== 'reverse' ? 'arrow' : undefined;
    const beginArrowType = (arrow.direction === 'reverse' || arrow.direction === 'bidirectional') ? 'arrow' : undefined;

    slide.addShape(pptx.ShapeType.line, {
      x: x1,
      y: y1,
      w: lineW,
      h: lineH,
      line: { color: '666666', width: 1.5, endArrowType, beginArrowType },
    });
  }

  await pptx.writeFile({ fileName: `${filename}.pptx` });
}

// ========== Gantt Chart Native Export ==========

export interface GanttWP {
  number: number;
  shortName: string;
  color: string;
  startMonth: number;
  endMonth: number;
  tasks: {
    wpNumber: number;
    taskNumber: number;
    name: string;
    startMonth: number;
    endMonth: number;
  }[];
}

export interface GanttExportData {
  projectDuration: number;
  workPackages: GanttWP[];
  milestones: { number: number; name: string; month: number }[];
}

export async function exportGanttAsPptx(data: GanttExportData, filename: string) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 inches
  const slide = pptx.addSlide();

  const months = data.projectDuration;
  const labelColW = 2.0; // inches
  const slideW = 13.0;
  const margin = 0.17;
  const chartW = slideW - labelColW - 2 * margin;
  const cellW = chartW / months;
  const rowH = 0.18;
  const headerH = 0.2;
  const startX = margin + labelColW;
  let curY = margin;

  const borderOpts = { pt: 0.5, color: 'CCCCCC' };
  const headerFill = { color: 'E8E8E8' };

  // Month header row
  const monthRow: PptxGenJS.TableCell[] = [
    { text: 'Month', options: { fill: headerFill, fontSize: 6, bold: true, align: 'right', border: [borderOpts, borderOpts, borderOpts, borderOpts] } },
  ];
  for (let m = 1; m <= months; m++) {
    monthRow.push({
      text: String(m),
      options: { fill: headerFill, fontSize: 5, align: 'center', border: [borderOpts, borderOpts, borderOpts, borderOpts] },
    });
  }

  const colW: number[] = [labelColW, ...Array(months).fill(cellW)];

  // Build all table rows
  const tableRows: PptxGenJS.TableRow[] = [monthRow];

  for (const wp of data.workPackages) {
    // WP header row
    const wpFill = hexToRgb(wp.color);
    const wpRow: PptxGenJS.TableCell[] = [
      {
        text: `WP${wp.number}: ${wp.shortName}`,
        options: { fontSize: 6, bold: true, fill: { color: wpFill }, color: 'FFFFFF', border: [borderOpts, borderOpts, borderOpts, borderOpts] },
      },
    ];
    for (let m = 1; m <= months; m++) {
      const isInWP = m >= wp.startMonth && m <= wp.endMonth;
      wpRow.push({
        text: '',
        options: {
          fill: isInWP ? { color: wpFill, transparency: 70 } : undefined,
          border: [borderOpts, borderOpts, borderOpts, borderOpts],
        },
      });
    }
    tableRows.push(wpRow);

    // Task rows
    for (const task of wp.tasks) {
      const taskRow: PptxGenJS.TableCell[] = [
        {
          text: `  T${task.wpNumber}.${task.taskNumber}: ${task.name || '(untitled)'}`,
          options: { fontSize: 5, border: [borderOpts, borderOpts, borderOpts, borderOpts] },
        },
      ];
      for (let m = 1; m <= months; m++) {
        const isInTask = m >= task.startMonth && m <= task.endMonth;
        taskRow.push({
          text: '',
          options: {
            fill: isInTask ? { color: wpFill, transparency: 40 } : undefined,
            border: [borderOpts, borderOpts, borderOpts, borderOpts],
          },
        });
      }
      tableRows.push(taskRow);
    }
  }

  slide.addTable(tableRows, {
    x: margin,
    y: curY,
    colW,
    rowH,
    fontSize: 6,
    fontFace: 'Times New Roman',
    autoPage: false,
  });

  await pptx.writeFile({ fileName: `${filename}.pptx` });
}
