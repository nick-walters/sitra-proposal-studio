import { useEditor, EditorContent } from '@tiptap/react';
import DOMPurify from 'dompurify';
import { RICH_TEXT_WITH_DIV_CONFIG } from '@/lib/sanitizePresets';
import StarterKit from '@tiptap/starter-kit';
import { HeadingExitOnEnter } from '@/extensions/HeadingExitOnEnter';
import { HeadingNumberLabel } from '@/extensions/HeadingNumberLabel';

import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import { OrderedListStyled } from '@/extensions/OrderedListStyled';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SaveIndicator } from '@/components/SaveIndicator';
import { useFstpContent } from '@/hooks/useFstpContent';
import { FormattingToolbar } from './RichTextEditor';
import {
  Download,
  FileText,
  Loader2,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { ResizableImage } from './ResizableImage';
import { useCallback, useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  Header,
  Footer,
  PageNumber,
  convertMillimetersToTwip,
  Table as DocxTable,
  TableRow as DocxTableRow,
  TableCell as DocxTableCell,
  WidthType,
  BorderStyle,
} from 'docx';
import { saveAs } from 'file-saver';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface FstpTabProps {
  proposalId: string;
  proposalAcronym: string;
  canEdit: boolean;
  isCoordinator: boolean;
  fstpType?: 'grant' | 'prize';
}



export function FstpTab({ proposalId, proposalAcronym, canEdit, isCoordinator, fstpType = 'grant' }: FstpTabProps) {
  const { data, loading, saving, lastSaved, hasUnsavedChanges, saveError, updateInstructions, updateResponse, saveNow } = useFstpContent(proposalId, fstpType);
  const [exporting, setExporting] = useState(false);
  const [editingInstructions, setEditingInstructions] = useState(false);
  const [draftInstructions, setDraftInstructions] = useState('');
  const isInitRef = useRef(false);

  // Only create the editor once loading is done so we have DB content
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ orderedList: false }),
      OrderedListStyled,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      ResizableImage,
      HeadingExitOnEnter,
      HeadingNumberLabel,
    ],
    content: loading ? '<p></p>' : (data.responseContent || '<p></p>'),
    editable: canEdit && !loading,
    onUpdate: ({ editor: e }) => {
      if (isInitRef.current) {
        updateResponse(e.getHTML());
      }
    },
  });

  // Reset init flag when fstpType changes so content re-syncs
  useEffect(() => {
    isInitRef.current = false;
  }, [fstpType]);

  // Sync content from DB once loading finishes
  useEffect(() => {
    if (editor && !loading && !isInitRef.current) {
      editor.commands.setContent(data.responseContent || '<p></p>');
      // Use a microtask to ensure setContent completes before enabling tracking
      queueMicrotask(() => {
        isInitRef.current = true;
      });
    }
  }, [editor, loading, data.responseContent, fstpType]);

  // Update editable state
  useEffect(() => {
    if (editor) editor.setEditable(canEdit);
  }, [editor, canEdit]);

  // Save on unmount if unsaved
  useEffect(() => {
    return () => {
      if (hasUnsavedChanges) saveNow();
    };
  }, [hasUnsavedChanges, saveNow]);

  // Ctrl+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveNow();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [saveNow]);

  // ── Shared HTML parsing helpers ──────────────────────────────────

  type TextSegment = { text: string; bold: boolean; italic: boolean; underline: boolean; superscript: boolean };

  type ContentBlock =
    | { type: 'paragraph'; segments: TextSegment[]; align?: string }
    | { type: 'heading'; level: number; text: string }
    | { type: 'list'; ordered: boolean; items: { segments: TextSegment[] }[] }
    | { type: 'table'; rows: { cells: TextSegment[][] }[]; hasHeader: boolean };

  const extractSegments = useCallback((el: HTMLElement): TextSegment[] => {
    const segments: TextSegment[] = [];
    const walk = (node: Node, bold: boolean, italic: boolean, underline: boolean, superscript: boolean) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (text) segments.push({ text, bold, italic, underline, superscript });
        return;
      }
      const childEl = node as HTMLElement;
      const tag = childEl.tagName?.toLowerCase();
      const b = bold || tag === 'strong' || tag === 'b';
      const i = italic || tag === 'em' || tag === 'i';
      const u = underline || tag === 'u';
      const sup = superscript || tag === 'sup';
      childEl.childNodes.forEach(c => walk(c, b, i, u, sup));
    };
    walk(el, false, false, false, false);
    return segments;
  }, []);

  const parseHtmlToBlocks = useCallback((html: string): ContentBlock[] => {
    if (!html) return [];
    const div = document.createElement('div');
    div.innerHTML = DOMPurify.sanitize(html, RICH_TEXT_WITH_DIV_CONFIG);
    const blocks: ContentBlock[] = [];

    const processNode = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim();
        if (text) blocks.push({ type: 'paragraph', segments: [{ text, bold: false, italic: false, underline: false, superscript: false }] });
        return;
      }
      const el = node as HTMLElement;
      const tag = el.tagName?.toLowerCase();

      if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
        blocks.push({ type: 'heading', level: parseInt(tag[1]), text: el.textContent || '' });
        return;
      }

      if (tag === 'p' || tag === 'div') {
        const segs = extractSegments(el);
        const align = el.style?.textAlign || undefined;
        blocks.push({ type: 'paragraph', segments: segs.length > 0 ? segs : [{ text: '', bold: false, italic: false, underline: false, superscript: false }], align });
        return;
      }

      if (tag === 'ul' || tag === 'ol') {
        const items: { segments: TextSegment[] }[] = [];
        el.querySelectorAll(':scope > li').forEach(li => {
          items.push({ segments: extractSegments(li as HTMLElement) });
        });
        if (items.length > 0) blocks.push({ type: 'list', ordered: tag === 'ol', items });
        return;
      }

      if (tag === 'table') {
        const rows: { cells: TextSegment[][] }[] = [];
        let hasHeader = false;
        el.querySelectorAll('tr').forEach(tr => {
          const cells: TextSegment[][] = [];
          tr.querySelectorAll('th, td').forEach(cell => {
            if ((cell as HTMLElement).tagName.toLowerCase() === 'th') hasHeader = true;
            cells.push(extractSegments(cell as HTMLElement));
          });
          rows.push({ cells });
        });
        if (rows.length > 0) blocks.push({ type: 'table', rows, hasHeader });
        return;
      }

      el.childNodes.forEach(processNode);
    };

    div.childNodes.forEach(processNode);
    return blocks;
  }, [extractSegments]);

  const handleExportPdf = useCallback(async () => {
    if (!editor) return;
    setExporting(true);
    try {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const margin = 15;
      const contentWidth = 210 - 2 * margin;
      const lineHeight = 11 * 0.3528 * 1.0;
      const paraSpacingBefore = 3 * 0.3528;
      const paraSpacingAfter = 3 * 0.3528;
      let y = margin;
      let isTopOfPage = true;

      const checkPage = (needed = lineHeight) => {
        if (y + needed > 297 - margin) {
          doc.addPage();
          y = margin;
          isTopOfPage = true;
        }
      };

      const setFont = (bold: boolean, italic: boolean) => {
        if (bold && italic) doc.setFont('Times', 'BoldItalic');
        else if (bold) doc.setFont('Times', 'Bold');
        else if (italic) doc.setFont('Times', 'Italic');
        else doc.setFont('Times', 'Roman');
      };

      const renderSegments = (segments: TextSegment[], x: number, maxWidth: number, justified = false) => {
        type FWord = { word: string; bold: boolean; italic: boolean; underline: boolean; superscript: boolean };
        const words: FWord[] = [];
        for (const seg of segments) {
          const ws = seg.text.split(/\s+/).filter(w => w.length > 0);
          for (const w of ws) words.push({ word: w, bold: seg.bold, italic: seg.italic, underline: seg.underline, superscript: seg.superscript });
        }
        if (words.length === 0) return;

        doc.setFontSize(11);
        setFont(false, false);
        const spaceWidth = doc.getTextWidth(' ');
        const lines: FWord[][] = [];
        let currentLine: FWord[] = [];
        let lineWidth = 0;

        for (const fw of words) {
          setFont(fw.bold, fw.italic);
          doc.setFontSize(fw.superscript ? 8 : 11);
          const ww = doc.getTextWidth(fw.word);
          const gap = currentLine.length > 0 ? spaceWidth : 0;
          if (currentLine.length > 0 && lineWidth + gap + ww > maxWidth) {
            lines.push(currentLine);
            currentLine = [fw];
            lineWidth = ww;
          } else {
            lineWidth += gap + ww;
            currentLine.push(fw);
          }
        }
        if (currentLine.length > 0) lines.push(currentLine);

        for (let li = 0; li < lines.length; li++) {
          checkPage();
          const line = lines[li];
          const isLastLine = li === lines.length - 1;

          let totalWordWidth = 0;
          for (const fw of line) {
            setFont(fw.bold, fw.italic);
            doc.setFontSize(fw.superscript ? 8 : 11);
            totalWordWidth += doc.getTextWidth(fw.word);
          }

          const naturalGap = spaceWidth;
          const justifiedGap = line.length > 1 ? (maxWidth - totalWordWidth) / (line.length - 1) : naturalGap;
          const useJustified = justified && !isLastLine && line.length > 1 && justifiedGap <= naturalGap * 2.5;
          const gap = useJustified ? justifiedGap : naturalGap;

          let cx = x;
          for (let wi = 0; wi < line.length; wi++) {
            const fw = line[wi];
            setFont(fw.bold, fw.italic);
            doc.setFontSize(fw.superscript ? 8 : 11);
            const yOff = fw.superscript ? -1.2 : 0;
            doc.text(fw.word, cx, y + yOff);
            if (fw.underline) {
              const ww = doc.getTextWidth(fw.word);
              doc.setDrawColor(0);
              doc.setLineWidth(0.15);
              doc.line(cx, y + 0.5, cx + ww, y + 0.5);
            }
            cx += doc.getTextWidth(fw.word) + gap;
          }
          y += lineHeight;
        }
      };

      // Title
      doc.setFontSize(14);
      doc.setFont('Times', 'Bold');
      doc.text('Information on financial support to third parties', margin, y);
      y += 14 * 0.3528 + 12 * 0.3528;
      isTopOfPage = false;

      // Subheading
      doc.setFontSize(11);
      doc.setFont('Times', 'Bold');
      const subheading = fstpType === 'prize'
        ? 'Financial support in the form of a prize'
        : 'Financial support in the form of a grant awarded after a call for proposals';
      doc.text(subheading, margin, y);
      y += lineHeight + paraSpacingAfter;

      // Parse and render content blocks
      const blocks = parseHtmlToBlocks(editor.getHTML());

      for (const block of blocks) {
        if (block.type === 'heading') {
          if (!isTopOfPage) y += 6 * 0.3528;
          checkPage();
          doc.setFontSize(block.level === 1 ? 13 : block.level === 2 ? 12 : 11);
          doc.setFont('Times', 'Bold');
          const headingLines = doc.splitTextToSize(block.text, contentWidth);
          for (const hl of headingLines) {
            checkPage();
            doc.text(hl, margin, y);
            y += lineHeight;
          }
          if (block.level === 3) {
            const hw = Math.min(doc.getTextWidth(block.text), contentWidth);
            doc.setDrawColor(0);
            doc.setLineWidth(0.15);
            doc.line(margin, y - lineHeight + 0.5, margin + hw, y - lineHeight + 0.5);
          }
          y += paraSpacingAfter;
          isTopOfPage = false;
        } else if (block.type === 'paragraph') {
          if (block.segments.every(s => !s.text.trim())) {
            y += paraSpacingAfter;
            continue;
          }
          if (!isTopOfPage) y += paraSpacingBefore;
          checkPage();
          const isJustified = block.align === 'justify' || !block.align;
          renderSegments(block.segments, margin, contentWidth, isJustified);
          y += paraSpacingAfter;
          isTopOfPage = false;
        } else if (block.type === 'list') {
          const listIndent = 5;
          const bulletWidth = block.ordered ? 6 : 3;
          for (let i = 0; i < block.items.length; i++) {
            if (!isTopOfPage) y += paraSpacingBefore;
            checkPage();
            const bullet = block.ordered ? `${i + 1}. ` : '• ';
            doc.setFontSize(11);
            setFont(false, false);
            doc.text(bullet, margin + listIndent, y);
            renderSegments(block.items[i].segments, margin + listIndent + bulletWidth, contentWidth - listIndent - bulletWidth, false);
            y += paraSpacingAfter;
            isTopOfPage = false;
          }
        } else if (block.type === 'table') {
          const colCount = Math.max(...block.rows.map(r => r.cells.length));
          const colWidth = contentWidth / colCount;
          const cellPadTop = 1.5;
          const cellPadBottom = 2;
          const cellPadX = 1.5;
          for (let ri = 0; ri < block.rows.length; ri++) {
            const row = block.rows[ri];
            const isHeader = ri === 0 && block.hasHeader;
            const cellWrapped: string[][] = [];
            doc.setFontSize(11);
            setFont(isHeader, false);
            let maxLines = 1;
            for (let ci = 0; ci < row.cells.length; ci++) {
              const cellText = row.cells[ci].map(s => s.text).join('');
              const lines: string[] = doc.splitTextToSize(cellText, colWidth - 2 * cellPadX);
              cellWrapped.push(lines);
              if (lines.length > maxLines) maxLines = lines.length;
            }
            const textBlockHeight = maxLines * lineHeight;
            const rowHeight = cellPadTop + textBlockHeight + cellPadBottom;
            checkPage(rowHeight + 1);
            // Draw top border for header row
            if (ri === 0 && block.hasHeader) {
              doc.setDrawColor(0);
              doc.setLineWidth(0.5);
              doc.line(margin, y, margin + contentWidth, y);
            }
            // Render each cell's text
            for (let ci = 0; ci < row.cells.length; ci++) {
              const cx = margin + ci * colWidth;
              const lines = cellWrapped[ci] || [];
              doc.setFontSize(11);
              setFont(isHeader, false);
              for (let cli = 0; cli < lines.length; cli++) {
                doc.text(lines[cli], cx + cellPadX, y + cellPadTop + lineHeight * 0.8 + cli * lineHeight);
              }
            }
            // Draw bottom border after content
            y += rowHeight;
            doc.setDrawColor(isHeader ? 0 : 200);
            doc.setLineWidth(isHeader ? 0.5 : 0.15);
            doc.line(margin, y, margin + contentWidth, y);
            isTopOfPage = false;
          }
          y += paraSpacingAfter;
        }
      }

      doc.save(`${proposalAcronym} FSTP Annex.pdf`);
      toast.success('FSTP annex exported to PDF');
    } catch (err) {
      console.error(err);
      toast.error('Failed to export PDF');
    }
    setExporting(false);
  }, [editor, proposalAcronym, fstpType, parseHtmlToBlocks]);

  const handleExportDocx = useCallback(async () => {
    if (!editor) return;
    setExporting(true);
    try {
      const FONT = 'Times New Roman';
      const SZ = 22;
      const LINE = 240;
      const SP_BEFORE = 60;
      const SP_AFTER = 60;

      const segsToRunOpts = (segs: TextSegment[]): Record<string, unknown>[] =>
        segs.map(s => ({
          text: s.text,
          font: FONT,
          size: s.superscript ? 16 : SZ,
          bold: s.bold,
          italics: s.italic,
          underline: s.underline ? {} : undefined,
          superScript: s.superscript,
        }));

      const segsToRuns = (segs: TextSegment[]): TextRun[] =>
        segsToRunOpts(segs).map(opts => new TextRun(opts as any));

      const alignMap: Record<string, typeof AlignmentType[keyof typeof AlignmentType]> = {
        left: AlignmentType.LEFT,
        center: AlignmentType.CENTER,
        right: AlignmentType.RIGHT,
        justify: AlignmentType.JUSTIFIED,
      };

      const children: (Paragraph | any)[] = [];

      // Title
      children.push(new Paragraph({
        children: [new TextRun({ text: 'Information on financial support to third parties', bold: true, font: FONT, size: 28 })],
        spacing: { after: 240 },
      }));

      // Subheading
      children.push(new Paragraph({
        children: [new TextRun({
          text: fstpType === 'prize'
            ? 'Financial support in the form of a prize'
            : 'Financial support in the form of a grant awarded after a call for proposals',
          bold: true, font: FONT, size: SZ,
        })],
        spacing: { after: 120, line: LINE },
      }));

      // Parse and render blocks
      const blocks = parseHtmlToBlocks(editor.getHTML());

      for (const block of blocks) {
        if (block.type === 'heading') {
          children.push(new Paragraph({
            children: [new TextRun({
              text: block.text,
              bold: true,
              underline: block.level === 3 ? {} : undefined,
              font: FONT,
              size: block.level === 1 ? 26 : block.level === 2 ? 24 : SZ,
            })],
            spacing: {
              before: block.level <= 2 ? 180 : SP_BEFORE,
              after: block.level <= 2 ? 120 : SP_AFTER,
              line: LINE,
            },
          }));
        } else if (block.type === 'paragraph') {
          const runs = segsToRuns(block.segments);
          children.push(new Paragraph({
            children: runs,
            spacing: { before: SP_BEFORE, after: SP_AFTER, line: LINE },
            alignment: block.align ? alignMap[block.align] || AlignmentType.JUSTIFIED : AlignmentType.JUSTIFIED,
          }));
        } else if (block.type === 'list') {
          for (let i = 0; i < block.items.length; i++) {
            const bullet = block.ordered ? `${i + 1}. ` : '• ';
            const runs = segsToRuns(block.items[i].segments);
            children.push(new Paragraph({
              children: [new TextRun({ text: bullet, font: FONT, size: SZ }), ...runs],
              spacing: { before: 40, after: 40, line: LINE },
              indent: { left: convertMillimetersToTwip(10) },
            }));
          }
        } else if (block.type === 'table') {
          const colCount = Math.max(...block.rows.map(r => r.cells.length));
          const pageContentWidthTwip = convertMillimetersToTwip(180);
          const colWidthTwip = Math.floor(pageContentWidthTwip / colCount);
          const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
          const thickBorder = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
          const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

          const docxRows = block.rows.map((row, ri) => {
            const isHdr = ri === 0 && block.hasHeader;
            const borders = {
              top: isHdr || ri === 1 ? thickBorder : thinBorder,
              bottom: ri === block.rows.length - 1 ? thickBorder : isHdr ? thickBorder : thinBorder,
              left: noBorder,
              right: noBorder,
            };
            return new DocxTableRow({
              children: row.cells.map(cellSegs => new DocxTableCell({
                borders,
                width: { size: colWidthTwip, type: WidthType.DXA },
                margins: { top: 40, bottom: 40, left: 80, right: 80 },
                children: [new Paragraph({
                  children: isHdr
                    ? segsToRunOpts(cellSegs).map(opts => new TextRun({ ...opts, bold: true, font: FONT, size: SZ } as any))
                    : segsToRuns(cellSegs),
                  spacing: { before: 0, after: 0, line: LINE },
                })],
              })),
            });
          });

          children.push(new DocxTable({
            width: { size: pageContentWidthTwip, type: WidthType.DXA },
            columnWidths: Array(colCount).fill(colWidthTwip),
            rows: docxRows,
          }));
        }
      }

      const docxDoc = new Document({
        sections: [{
          properties: {
            page: {
              margin: {
                top: convertMillimetersToTwip(15),
                bottom: convertMillimetersToTwip(15),
                left: convertMillimetersToTwip(15),
                right: convertMillimetersToTwip(15),
              },
            },
          },
          headers: {
            default: new Header({
              children: [new Paragraph({
                children: [new TextRun({ text: `${proposalAcronym} — FSTP Annex`, font: FONT, size: 16, color: '888888' })],
                alignment: AlignmentType.RIGHT,
              })],
            }),
          },
          footers: {
            default: new Footer({
              children: [new Paragraph({
                children: [
                  new TextRun({ text: 'Page ', font: FONT, size: 16, color: '888888' }),
                  new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: '888888' }),
                ],
                alignment: AlignmentType.CENTER,
              })],
            }),
          },
          children,
        }],
      });

      const blob = await Packer.toBlob(docxDoc);
      saveAs(blob, `${proposalAcronym} FSTP Annex.docx`);
      toast.success('FSTP annex exported to Word');
    } catch (err) {
      console.error(err);
      toast.error('Failed to export DOCX');
    }
    setExporting(false);
  }, [editor, proposalAcronym, fstpType, parseHtmlToBlocks]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary mr-2" />
        <span className="text-muted-foreground">Loading FSTP content…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with export */}
      <div className="flex items-center justify-end">
        {isCoordinator && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2" disabled={exporting}>
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Export FSTP annex
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportPdf}>
                <FileText className="w-4 h-4 mr-2" />
                Export as PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportDocx}>
                <FileText className="w-4 h-4 mr-2" />
                Export as Word
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Instructions + Response in one card */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">{fstpType === 'prize' ? 'Financial support in the form of a prize' : 'Financial support in the form of a grant awarded after a call for proposals'}</CardTitle>
              <p className="text-sm font-bold italic text-muted-foreground mt-3">Instructions</p>
            </div>
            {isCoordinator && !editingInstructions && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => { setDraftInstructions(data.instructionsText); setEditingInstructions(true); }}
              >
                <Pencil className="w-4 h-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm italic text-muted-foreground leading-relaxed">
            For calls that allow 'Financial support to third parties', project participants must add this document to the application and upload it as separate annex to the proposal part B in the Submission System.
          </p>
          {editingInstructions ? (
            <div className="space-y-2">
              <textarea
                className="w-full text-sm leading-relaxed text-muted-foreground bg-transparent border rounded-md p-3 resize-none overflow-hidden focus:outline-none focus:ring-1 focus:ring-ring"
                value={draftInstructions}
                onChange={(e) => setDraftInstructions(e.target.value)}
                ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
              />
              <div className="flex items-center gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setEditingInstructions(false)}>
                  <X className="w-4 h-4 mr-1" /> Cancel
                </Button>
                <Button size="sm" onClick={async () => { updateInstructions(draftInstructions); await saveNow(); setEditingInstructions(false); }}>
                  <Check className="w-4 h-4 mr-1" /> Save
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm leading-relaxed text-muted-foreground">
              {data.instructionsText.split('\n').map((line, i) => {
                const leadingSpaces = line.match(/^(\s*)/)?.[0].length || 0;
                const marginLeftCh = leadingSpaces > 0 ? leadingSpaces * 0.6 : 0;
                const marginLeft = marginLeftCh > 0 ? `${marginLeftCh}ch` : undefined;
                const trimmed = line.trimStart();

                // Detect sub-items like "a. ..." or "a) ..." and normalize spacing/indent
                const subItemMatch = trimmed.match(/^([a-z][.)])\s+(.*)$/);
                if (subItemMatch) {
                  const normalized = `${subItemMatch[1]} ${subItemMatch[2]}`;
                  const fixedSubItemMargin = '3ch';
                  const fixedSubItemHang = '2ch'; // wrapped lines land at 5ch (same as numbered text column)

                  return (
                    <p key={i} style={{ marginLeft: fixedSubItemMargin, paddingLeft: fixedSubItemHang, textIndent: `-${fixedSubItemHang}` }}>
                      {normalized}
                    </p>
                  );
                }

                // Detect numbered items like "1.   ..."
                const numMatch = trimmed.match(/^(\d+\.\s+)/);
                if (numMatch) {
                  const hangIndent = `${numMatch[1].length}ch`;
                  return (
                    <p key={i} style={{ marginLeft, paddingLeft: hangIndent, textIndent: `-${hangIndent}` }}>
                      {trimmed}
                    </p>
                  );
                }

                return <p key={i} style={{ marginLeft }}>{trimmed || '\u00A0'}</p>;
              })}
            </div>
          )}

          <div className="border rounded-md overflow-hidden">
            {canEdit && (
              <FormattingToolbar
                editor={editor}
                isPartB={false}
                showColor={false}
                showParagraphSpacing={false}
                showImageControls={false}
                showTableEditing={false}
                tableInsertMode="fixed3x3"
                figureInsertMode="urlPrompt"
                showLinkButton={true}
                subheadingPrefix="1.1"
                showSubheadingBodyItem={false}
              />
            )}
            <div className="max-w-none p-4 min-h-[300px] text-sm focus-within:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[280px] [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6 [&_.ProseMirror_li]:my-1">
              <EditorContent editor={editor} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
