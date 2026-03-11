import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
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
  Heading2,
  Download,
  FileText,
  Loader2,
  Table as TableIcon,
  Image as ImageIcon,
  Pencil,
  Check,
  X,
  Image as ImageIcon,
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
}

function FstpToolbar({ editor }: { editor: any }) {
  if (!editor) return null;

  const ToolbarButton = ({ onClick, active, title, children }: any) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 ${active ? 'bg-accent text-accent-foreground' : ''}`}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">{title}</TooltipContent>
    </Tooltip>
  );

  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 border-b bg-background flex-wrap">
      <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Undo">
        <Undo className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="Redo">
        <Redo className="w-4 h-4" />
      </ToolbarButton>

      <Separator orientation="vertical" className="h-6 mx-1" />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive('heading', { level: 2 })}
        title="Subheading"
      >
        <Heading2 className="w-4 h-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        title="Bold"
      >
        <Bold className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        title="Italic"
      >
        <Italic className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive('underline')}
        title="Underline"
      >
        <UnderlineIcon className="w-4 h-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => {
          const url = window.prompt('Enter URL:');
          if (url) editor.chain().focus().setLink({ href: url }).run();
        }}
        active={editor.isActive('link')}
        title="Link"
      >
        <LinkIcon className="w-4 h-4" />
      </ToolbarButton>

      <Separator orientation="vertical" className="h-6 mx-1" />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        title="Bullet list"
      >
        <List className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
        title="Numbered list"
      >
        <ListOrdered className="w-4 h-4" />
      </ToolbarButton>

      <Separator orientation="vertical" className="h-6 mx-1" />

      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        active={editor.isActive({ textAlign: 'left' })}
        title="Align left"
      >
        <AlignLeft className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        active={editor.isActive({ textAlign: 'center' })}
        title="Align center"
      >
        <AlignCenter className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        active={editor.isActive({ textAlign: 'right' })}
        title="Align right"
      >
        <AlignRight className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('justify').run()}
        active={editor.isActive({ textAlign: 'justify' })}
        title="Justify"
      >
        <AlignJustify className="w-4 h-4" />
      </ToolbarButton>

      <Separator orientation="vertical" className="h-6 mx-1" />

      <ToolbarButton
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        title="Table"
      >
        <TableIcon className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => {
          const url = window.prompt('Enter image URL:');
          if (url) editor.chain().focus().setImage({ src: url }).run();
        }}
        title="Figure"
      >
        <ImageIcon className="w-4 h-4" />
      </ToolbarButton>
    </div>
  );
}

export function FstpTab({ proposalId, proposalAcronym, canEdit, isCoordinator }: FstpTabProps) {
  const { data, loading, saving, lastSaved, hasUnsavedChanges, updateInstructions, updateResponse, saveNow } = useFstpContent(proposalId);
  const [exporting, setExporting] = useState(false);
  const [editingInstructions, setEditingInstructions] = useState(false);
  const [draftInstructions, setDraftInstructions] = useState('');
  const isInitRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      ResizableImage,
    ],
    content: data.responseContent || '<p></p>',
    editable: canEdit,
    onUpdate: ({ editor: e }) => {
      if (isInitRef.current) {
        updateResponse(e.getHTML());
      }
    },
  });

  // Sync content from DB on first load
  useEffect(() => {
    if (editor && data.responseContent && !isInitRef.current) {
      const currentContent = editor.getHTML();
      if (currentContent === '<p></p>' || currentContent === '') {
        editor.commands.setContent(data.responseContent || '<p></p>');
      }
      isInitRef.current = true;
    }
  }, [editor, data.responseContent]);

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

  const getPlainText = useCallback(() => {
    if (!editor) return '';
    return editor.getText();
  }, [editor]);

  const handleExportPdf = useCallback(async () => {
    setExporting(true);
    try {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const margin = 15;
      const pageWidth = 210 - 2 * margin;
      let y = margin;

      doc.setFont('Times', 'Roman');

      // Title
      doc.setFontSize(14);
      doc.setFont('Times', 'Bold');
      doc.text('Financial Support to Third Parties (FSTP)', margin, y);
      y += 10;

      // Instructions
      doc.setFontSize(10);
      doc.setFont('Times', 'Italic');
      const instrLines = doc.splitTextToSize(data.instructionsText, pageWidth);
      for (const line of instrLines) {
        if (y > 280) { doc.addPage(); y = margin; }
        doc.text(line, margin, y);
        y += 4.5;
      }

      y += 6;

      // Response
      doc.setFont('Times', 'Roman');
      doc.setFontSize(11);
      const responseText = getPlainText();
      const respLines = doc.splitTextToSize(responseText, pageWidth);
      for (const line of respLines) {
        if (y > 280) { doc.addPage(); y = margin; }
        doc.text(line, margin, y);
        y += 5;
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

      // Title
      children.push(new Paragraph({
        children: [new TextRun({ text: 'Financial Support to Third Parties (FSTP)', bold: true, font: 'Times New Roman', size: 28 })],
        spacing: { after: 200 },
      }));

      // Instructions
      const instrParas = data.instructionsText.split('\n').filter(Boolean);
      for (const para of instrParas) {
        children.push(new Paragraph({
          children: [new TextRun({ text: para, font: 'Times New Roman', size: 20, italics: true })],
          spacing: { after: 60 },
        }));
      }

      children.push(new Paragraph({ spacing: { after: 200 } }));

      // Response
      const respParas = responseText.split('\n').filter(Boolean);
      for (const para of respParas) {
        children.push(new Paragraph({
          children: [new TextRun({ text: para, font: 'Times New Roman', size: 22 })],
          spacing: { after: 60 },
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
      {/* Header with save indicator and export */}
      <div className="flex items-center justify-between">
        <SaveIndicator
          saving={saving}
          lastSaved={lastSaved}
          hasUnsavedChanges={hasUnsavedChanges}
          onSaveNow={saveNow}
        />
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
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Financial support in the form of a grant awarded after a call for proposals</CardTitle>
          <p className="text-sm text-muted-foreground">Instructions</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {isCoordinator && canEdit ? (
            <textarea
              className="w-full text-sm leading-relaxed text-muted-foreground bg-transparent border rounded-md p-3 resize-none overflow-hidden focus:outline-none focus:ring-1 focus:ring-ring"
              value={data.instructionsText}
              onChange={(e) => updateInstructions(e.target.value)}
              ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
              onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
            />
          ) : (
            <div className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
              {data.instructionsText}
            </div>
          )}

          <div className="border rounded-md overflow-hidden">
            {canEdit && <FstpToolbar editor={editor} />}
            <div className="prose prose-sm max-w-none p-4 min-h-[300px] focus-within:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[280px]">
              <EditorContent editor={editor} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
