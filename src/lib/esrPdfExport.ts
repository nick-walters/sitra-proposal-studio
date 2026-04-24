import jsPDF from "jspdf";
import { parseEsrMarkdown, formatBritishDateTime, type Block, type Run } from "@/lib/esrMarkdown";

// A4 in mm: 210 x 297. Margin: 1.5 cm = 15 mm.
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 15;
const CONTENT_W = PAGE_W - 2 * MARGIN;

// Convert pt to mm (1 pt = 0.3528 mm).
const PT_TO_MM = 0.3528;

interface Style {
  size: number; // pt
  bold: boolean;
  italic: boolean;
  spaceBefore: number; // mm
  spaceAfter: number; // mm
  lineHeight: number; // multiplier
  indent?: number; // mm
  bullet?: boolean;
}

function styleFor(block: Block): Style {
  switch (block.type) {
    case "h1":
      return { size: 16, bold: true, italic: false, spaceBefore: 6, spaceAfter: 3, lineHeight: 1.2 };
    case "h2":
      return { size: 13, bold: true, italic: false, spaceBefore: 4, spaceAfter: 2, lineHeight: 1.2 };
    case "h3":
      return { size: 12, bold: true, italic: false, spaceBefore: 3, spaceAfter: 1.5, lineHeight: 1.2 };
    case "li":
      return { size: 11, bold: false, italic: false, spaceBefore: 0, spaceAfter: 1.5, lineHeight: 1.3, indent: 6, bullet: true };
    case "p":
    default:
      return { size: 11, bold: false, italic: false, spaceBefore: 0, spaceAfter: 3, lineHeight: 1.3 };
  }
}

function setFont(pdf: jsPDF, bold: boolean, italic: boolean, size: number) {
  let style = "normal";
  if (bold && italic) style = "bolditalic";
  else if (bold) style = "bold";
  else if (italic) style = "italic";
  pdf.setFont("times", style);
  pdf.setFontSize(size);
}

// Wrap a list of styled runs into lines that fit `width` (mm) at `size` pt.
// Returns an array of lines; each line is an array of {text, bold, italic}.
function wrapRuns(
  pdf: jsPDF,
  runs: Run[],
  baseBold: boolean,
  baseItalic: boolean,
  size: number,
  width: number,
): { text: string; bold: boolean; italic: boolean }[][] {
  // First, split runs into words preserving formatting.
  type Word = { text: string; bold: boolean; italic: boolean; spaceAfter: boolean };
  const words: Word[] = [];
  for (const r of runs) {
    const bold = baseBold || !!r.bold;
    const italic = baseItalic || !!r.italic;
    const parts = r.text.split(/(\s+)/);
    for (const p of parts) {
      if (!p) continue;
      if (/^\s+$/.test(p)) {
        if (words.length) words[words.length - 1].spaceAfter = true;
      } else {
        words.push({ text: p, bold, italic, spaceAfter: false });
      }
    }
  }

  const lines: Word[][] = [[]];
  let lineWidth = 0;
  for (const w of words) {
    setFont(pdf, w.bold, w.italic, size);
    const wWidth = pdf.getTextWidth(w.text);
    const spaceWidth = w.spaceAfter ? pdf.getTextWidth(" ") : 0;
    const candidate = lineWidth + (lines[lines.length - 1].length ? pdf.getTextWidth(" ") : 0) + wWidth;
    if (lines[lines.length - 1].length && candidate > width) {
      lines.push([w]);
      lineWidth = wWidth + spaceWidth;
    } else {
      if (lines[lines.length - 1].length) lineWidth += pdf.getTextWidth(" ");
      lines[lines.length - 1].push(w);
      lineWidth += wWidth + spaceWidth;
    }
  }
  return lines.map((line) =>
    line.map((w) => ({ text: w.text, bold: w.bold, italic: w.italic })),
  );
}

export function exportEsrToPdf(opts: {
  acronym: string;
  createdAt: string | Date;
  markdown: string;
}): void {
  const created = typeof opts.createdAt === "string" ? new Date(opts.createdAt) : opts.createdAt;
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  const titleMain = `${opts.acronym} Evaluation Summary Report`;
  const dateLine = formatBritishDateTime(created);
  let y = MARGIN;

  // Title — Times Bold 16pt, centred.
  setFont(pdf, true, false, 16);
  const titleLines = pdf.splitTextToSize(titleMain, CONTENT_W);
  for (const line of titleLines) {
    pdf.text(line, PAGE_W / 2, y + 16 * PT_TO_MM, { align: "center" });
    y += 16 * PT_TO_MM * 1.2;
  }

  // Date — Times Regular 11pt, centred, on its own line below the title.
  setFont(pdf, false, false, 11);
  pdf.text(dateLine, PAGE_W / 2, y + 11 * PT_TO_MM, { align: "center" });
  y += 11 * PT_TO_MM * 1.2;

  y += 4; // gap below title block

  const blocks = parseEsrMarkdown(opts.markdown);

  for (const block of blocks) {
    if (block.type === "spacer") continue;
    const style = styleFor(block);
    const lineH = style.size * PT_TO_MM * style.lineHeight;
    const indent = style.indent || 0;
    const availW = CONTENT_W - indent;

    setFont(pdf, style.bold, style.italic, style.size);
    const lines = wrapRuns(pdf, block.runs, style.bold, style.italic, style.size, availW);

    // Space before
    y += style.spaceBefore;
    if (y > PAGE_H - MARGIN) {
      pdf.addPage();
      y = MARGIN;
    }

    let firstLine = true;
    for (const line of lines) {
      if (y + lineH > PAGE_H - MARGIN) {
        pdf.addPage();
        y = MARGIN;
      }
      const baseline = y + style.size * PT_TO_MM * 0.85;
      let x = MARGIN + indent;
      if (style.bullet && firstLine) {
        setFont(pdf, false, false, style.size);
        pdf.text("•", MARGIN + 1, baseline);
      }
      for (let i = 0; i < line.length; i++) {
        const w = line[i];
        setFont(pdf, w.bold, w.italic, style.size);
        pdf.text(w.text, x, baseline);
        x += pdf.getTextWidth(w.text);
        if (i < line.length - 1) {
          x += pdf.getTextWidth(" ");
        }
      }
      y += lineH;
      firstLine = false;
    }
    y += style.spaceAfter;
  }

  // Filename: ACRONYM ESR YYYY-MM-DD HH-MM.pdf
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${created.getFullYear()}-${pad(created.getMonth() + 1)}-${pad(created.getDate())} ${pad(created.getHours())}-${pad(created.getMinutes())}`;
  const filename = `${opts.acronym} ESR ${stamp}.pdf`;
  pdf.save(filename);
}
