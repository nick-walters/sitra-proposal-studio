import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { HeadingExitOnEnter } from '@/extensions/HeadingExitOnEnter';
import { HeadingNumberLabel } from '@/extensions/HeadingNumberLabel';
import { renumberH3Headings } from '@/lib/renumberH3Headings';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import { OrderedListStyled } from '@/extensions/OrderedListStyled';
import { OrderedListDropdown } from './OrderedListDropdown';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { SaveIndicator } from '@/components/SaveIndicator';
import { useFstpContent } from '@/hooks/useFstpContent';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Link as LinkIcon,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Undo,
  Redo,
  
  Download,
  FileText,
  Loader2,
  Table as TableIcon,
  Image as ImageIcon,
  Pencil,
  Check,
  X,
  ChevronDown,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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

function FstpToolbarButton({ icon, tooltip, onClick, active, disabled }: {
  icon: React.ReactNode;
  tooltip: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={active ? "secondary" : "ghost"}
          size="icon"
          className="h-7 w-7"
          onClick={onClick}
          disabled={disabled}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function FstpToolbar({ editor }: { editor: any }) {
  // Force re-render on editor state changes so isActive() reflects current state
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const handler = () => setTick((t) => t + 1);
    editor.on('selectionUpdate', handler);
    editor.on('transaction', handler);
    return () => {
      editor.off('selectionUpdate', handler);
      editor.off('transaction', handler);
    };
  }, [editor]);

  if (!editor) return null;

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className="editor-toolbar border-b border-border bg-card px-2 py-1">
      <div className="flex items-center gap-0">
        {/* Undo Redo */}
        <FstpToolbarButton
          icon={<Undo className="w-4 h-4" />}
          tooltip="Undo (Ctrl+Z)"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        />
        <FstpToolbarButton
          icon={<Redo className="w-4 h-4" />}
          tooltip="Redo (Ctrl+Y)"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        />

        <Separator orientation="vertical" className="h-5 mx-1.5" />

        {/* Subheading dropdown */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={editor.isActive('heading', { level: 3 }) || (editor.isActive('bold') && editor.isActive('underline')) ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
                >
                  <span className="font-black underline">Subheading</span>
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Insert subheading
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuItem onClick={() => {
              const placeholder = `1.1.0. `;
              editor.chain().focus().toggleHeading({ level: 3 }).run();
              if (editor.isActive('heading', { level: 3 })) {
                const $from = editor.state.selection.$from;
                const startOfNode = $from.start();
                const currentText = $from.parent.textContent;
                const hasPrefix = /^\d+\.\d+\.\d+\.\s/.test(currentText);
                if (!hasPrefix) {
                  editor.chain().focus().insertContentAt(startOfNode, placeholder).run();
                }
                renumberH3Headings(editor, '1.1');
              }
            }}>
              <span className="text-sm font-semibold underline">1.1.1. Numbered subheading</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              editor.chain().focus().toggleBold().run();
              editor.chain().focus().toggleUnderline().run();
            }}>
              <span className="text-sm font-bold underline">Unnumbered subheading</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={editor.isActive('bold') ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <span className="font-black text-sm">B</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Bold (Ctrl+B)
          </TooltipContent>
        </Tooltip>
        <FstpToolbarButton
          icon={<Italic className="w-3.5 h-3.5" />}
          tooltip="Italic (Ctrl+I)"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
        />
        <FstpToolbarButton
          icon={<UnderlineIcon className="w-4 h-4" />}
          tooltip="Underline (Ctrl+U)"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive('underline')}
        />
        <FstpToolbarButton
          icon={<LinkIcon className="w-4 h-4" />}
          tooltip="Insert link"
          onClick={setLink}
          active={editor.isActive('link')}
        />

        <Separator orientation="vertical" className="h-5 mx-1.5" />

        {/* Bullet Numbered */}
        <FstpToolbarButton
          icon={<List className="w-4 h-4" />}
          tooltip="Bullet list"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
        />
        <OrderedListDropdown
          editor={editor}
          active={editor.isActive('orderedList')}
        />

        <Separator orientation="vertical" className="h-5 mx-1.5" />

        {/* Left Centre Right Justify */}
        <FstpToolbarButton
          icon={<AlignLeft className="w-4 h-4" />}
          tooltip="Align left"
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          active={editor.isActive({ textAlign: 'left' })}
        />
        <FstpToolbarButton
          icon={<AlignCenter className="w-4 h-4" />}
          tooltip="Align center"
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          active={editor.isActive({ textAlign: 'center' })}
        />
        <FstpToolbarButton
          icon={<AlignRight className="w-4 h-4" />}
          tooltip="Align right"
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          active={editor.isActive({ textAlign: 'right' })}
        />
        <FstpToolbarButton
          icon={<AlignJustify className="w-4 h-4" />}
          tooltip="Justify"
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          active={editor.isActive({ textAlign: 'justify' })}
        />

        <Separator orientation="vertical" className="h-5 mx-1.5" />

        {/* Table */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 gap-1"
              onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            >
              <TableIcon className="w-4 h-4" />
              <span className="text-xs">Table</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Insert table</TooltipContent>
        </Tooltip>

        {/* Figure */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 gap-1"
              onClick={() => {
                const url = window.prompt('Enter image URL:');
                if (url) editor.chain().focus().setImage({ src: url }).run();
              }}
            >
              <ImageIcon className="w-4 h-4" />
              <span className="text-xs">Figure</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Insert figure</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
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
    div.innerHTML = html;
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
    setExporting(true);
    try {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const margin = 15;
      const pageWidth = 210 - 2 * margin;
      const lineHeight = 11 * 0.3528 * 1.0; // 11pt × mm/pt × 1.0 line spacing ≈ 3.88mm
      const paraSpacingBefore = 6 * 0.3528; // 6pt before
      const paraSpacingAfter = 6 * 0.3528;  // 6pt after
      let y = margin;

      doc.setFont('Times', 'Roman');

      // Title — 14pt bold, 12pt after
      doc.setFontSize(14);
      doc.setFont('Times', 'Bold');
      doc.text('Information on financial support to third parties', margin, y);
      y += 14 * 0.3528 + 12 * 0.3528; // line + 12pt spacing

      // Subheading — 11pt bold, 6pt after
      doc.setFontSize(11);
      doc.setFont('Times', 'Bold');
      const subheading = fstpType === 'prize'
        ? 'Financial support in the form of a prize'
        : 'Financial support in the form of a grant awarded after a call for proposals';
      doc.text(subheading, margin, y);
      y += lineHeight + paraSpacingAfter;

      // Response content — 11pt Roman, 6pt before/after paragraphs
      doc.setFont('Times', 'Roman');
      doc.setFontSize(11);
      const responseText = getPlainText();
      const respParas = responseText.split('\n');
      for (const para of respParas) {
        if (!para.trim()) {
          y += paraSpacingAfter;
          continue;
        }
        y += paraSpacingBefore;
        const lines = doc.splitTextToSize(para, pageWidth);
        for (const line of lines) {
          if (y > 297 - margin) { doc.addPage(); y = margin; }
          doc.text(line, margin, y);
          y += lineHeight;
        }
        y += paraSpacingAfter;
      }

      doc.save(`${proposalAcronym} FSTP Annex.pdf`);
      toast.success('FSTP annex exported to PDF');
    } catch (err) {
      console.error(err);
      toast.error('Failed to export PDF');
    }
    setExporting(false);
  }, [data, getPlainText, proposalAcronym]);

  const handleExportDocx = useCallback(async () => {
    setExporting(true);
    try {
      const responseText = getPlainText();
      const children: Paragraph[] = [];

      // Title — 14pt bold, 12pt (240 twips) after
      children.push(new Paragraph({
        children: [new TextRun({ text: 'Information on financial support to third parties', bold: true, font: 'Times New Roman', size: 28 })],
        spacing: { after: 240 },
      }));

      // Subheading — 11pt bold, 6pt (120 twips) after
      children.push(new Paragraph({
        children: [new TextRun({
          text: fstpType === 'prize'
            ? 'Financial support in the form of a prize'
            : 'Financial support in the form of a grant awarded after a call for proposals',
          bold: true,
          font: 'Times New Roman',
          size: 22,
        })],
        spacing: { after: 120 },
      }));

      // Response — 11pt Roman, 6pt before/after (120 twips), 1.0 line spacing (240 twips)
      const respParas = responseText.split('\n');
      for (const para of respParas) {
        children.push(new Paragraph({
          children: para.trim() ? [new TextRun({ text: para, font: 'Times New Roman', size: 22 })] : [],
          spacing: { before: 120, after: 120, line: 240 },
        }));
      }

      const doc = new Document({
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
                children: [new TextRun({ text: `${proposalAcronym} — FSTP Annex`, font: 'Times New Roman', size: 16, color: '888888' })],
                alignment: AlignmentType.RIGHT,
              })],
            }),
          },
          children,
        }],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${proposalAcronym} FSTP Annex.docx`);
      toast.success('FSTP annex exported to Word');
    } catch (err) {
      console.error(err);
      toast.error('Failed to export DOCX');
    }
    setExporting(false);
  }, [data, getPlainText, proposalAcronym]);

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
            {canEdit && <FstpToolbar editor={editor} />}
            <div className="max-w-none p-4 min-h-[300px] text-sm focus-within:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[280px] [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6 [&_.ProseMirror_li]:my-1">
              <EditorContent editor={editor} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
