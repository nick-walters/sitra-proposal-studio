import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  Info, 
  Lightbulb, 
  ClipboardCheck,
  Bold,
  Italic,
  Underline,
  List,
  Link,
  AlertTriangle,
  Heading3,
} from "lucide-react";
import type { SectionGuideline } from "@/types/templates";

interface GuidelineEditorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  guideline?: SectionGuideline | null;
  sectionId: string;
  existingGuidelinesCount: number;
  onSave: (data: Partial<SectionGuideline>) => void;
}

const GUIDELINE_TYPES = [
  { value: 'evaluation', label: 'Evaluation Criterion', icon: ClipboardCheck, color: 'bg-amber-100 text-amber-700' },
  { value: 'official', label: 'Official Guidelines', icon: Info, color: 'bg-blue-100 text-blue-700' },
  { value: 'sitra_tip', label: "Sitra's Tips", icon: Lightbulb, color: 'bg-gray-100 text-gray-700' },
];

interface FormatButtonProps {
  icon: React.ReactNode;
  tooltip: string;
  onClick: () => void;
  disabled?: boolean;
}

function FormatButton({ icon, tooltip, onClick, disabled }: FormatButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onClick}
          disabled={disabled}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

export function GuidelineEditorDialog({
  isOpen,
  onClose,
  guideline,
  sectionId,
  existingGuidelinesCount,
  onSave,
}: GuidelineEditorDialogProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    guideline_type: 'official' as 'official' | 'sitra_tip' | 'evaluation',
    order_index: existingGuidelinesCount,
  });

  const isEditing = !!guideline;
  const isSitraTip = formData.guideline_type === 'sitra_tip';

  useEffect(() => {
    if (guideline) {
      setFormData({
        title: guideline.title,
        content: guideline.content,
        guideline_type: guideline.guideline_type as 'official' | 'sitra_tip' | 'evaluation',
        order_index: guideline.order_index,
      });
    } else {
      setFormData({
        title: '',
        content: '',
        guideline_type: 'official',
        order_index: existingGuidelinesCount,
      });
    }
  }, [guideline, existingGuidelinesCount]);

  const insertAtCursor = (prefix: string, suffix: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = formData.content.substring(start, end);
    const newText = prefix + selectedText + suffix;
    
    const newContent = 
      formData.content.substring(0, start) + 
      newText + 
      formData.content.substring(end);
    
    setFormData({ ...formData, content: newContent });
    
    // Restore focus and selection
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + prefix.length + selectedText.length + suffix.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const wrapSelection = (wrapper: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = formData.content.substring(start, end);
    
    const newContent = 
      formData.content.substring(0, start) + 
      wrapper + selectedText + wrapper + 
      formData.content.substring(end);
    
    setFormData({ ...formData, content: newContent });
    
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + wrapper.length, end + wrapper.length);
    }, 0);
  };

  const insertSubheading = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const selectedText = formData.content.substring(textarea.selectionStart, textarea.selectionEnd);
    const prefix = '\n### ';
    const suffix = '\n';
    
    const newContent = 
      formData.content.substring(0, start) + 
      prefix + (selectedText || 'Subheading') + suffix + 
      formData.content.substring(textarea.selectionEnd);
    
    setFormData({ ...formData, content: newContent });
  };

  const insertBold = () => wrapSelection('**');
  const insertItalic = () => wrapSelection('*');
  const insertUnderline = () => wrapSelection('__');
  
  const insertBullet = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const content = formData.content;
    
    // Find the start of the current line
    let lineStart = start;
    while (lineStart > 0 && content[lineStart - 1] !== '\n') {
      lineStart--;
    }
    
    const newContent = 
      content.substring(0, lineStart) + 
      '• ' + 
      content.substring(lineStart);
    
    setFormData({ ...formData, content: newContent });
    
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + 2, start + 2);
    }, 0);
  };

  const insertLink = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = formData.content.substring(start, end);
    
    const url = prompt('Enter URL:', 'https://');
    if (!url) return;
    
    const linkText = selectedText || 'Link text';
    const markdown = `[${linkText}](${url})`;
    
    const newContent = 
      formData.content.substring(0, start) + 
      markdown + 
      formData.content.substring(end);
    
    setFormData({ ...formData, content: newContent });
  };

  const insertWarningBox = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const selectedText = formData.content.substring(textarea.selectionStart, textarea.selectionEnd);
    const prefix = '\n⚠️ ';
    const suffix = '\n';
    
    const newContent = 
      formData.content.substring(0, start) + 
      prefix + (selectedText || 'Warning text here') + suffix + 
      formData.content.substring(textarea.selectionEnd);
    
    setFormData({ ...formData, content: newContent });
  };

  const handleSubmit = () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      return;
    }
    onSave(formData);
    onClose();
  };

  const selectedType = GUIDELINE_TYPES.find(t => t.value === formData.guideline_type);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Add'} Guideline</DialogTitle>
          <DialogDescription>
            {isEditing 
              ? 'Update the guideline content and settings.' 
              : 'Create a new guideline for this section.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Guideline Type */}
          <div className="space-y-2">
            <Label>Guideline Type *</Label>
            <Select
              value={formData.guideline_type}
              onValueChange={(value: 'official' | 'sitra_tip' | 'evaluation') => 
                setFormData({ ...formData, guideline_type: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GUIDELINE_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex items-center gap-2">
                      <type.icon className="w-4 h-4" />
                      <span>{type.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedType && (
              <Badge className={selectedType.color}>
                {selectedType.label}
              </Badge>
            )}
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Technology Readiness Levels (TRL)"
            />
          </div>

          {/* Formatting Toolbar */}
          <div className="space-y-2">
            <Label>Content *</Label>
            <div className="flex items-center gap-1 p-1 border rounded-t-md bg-muted/50">
              <FormatButton
                icon={<Heading3 className="w-4 h-4" />}
                tooltip="Subheading (Sitra's Tips only)"
                onClick={insertSubheading}
                disabled={!isSitraTip}
              />
              <div className="w-px h-6 bg-border mx-1" />
              <FormatButton
                icon={<Bold className="w-4 h-4" />}
                tooltip="Bold (**text**)"
                onClick={insertBold}
              />
              <FormatButton
                icon={<Italic className="w-4 h-4" />}
                tooltip="Italic (*text*)"
                onClick={insertItalic}
              />
              <FormatButton
                icon={<Underline className="w-4 h-4" />}
                tooltip="Underline (__text__)"
                onClick={insertUnderline}
              />
              <div className="w-px h-6 bg-border mx-1" />
              <FormatButton
                icon={<List className="w-4 h-4" />}
                tooltip="Bullet point (•)"
                onClick={insertBullet}
              />
              <FormatButton
                icon={<Link className="w-4 h-4" />}
                tooltip="Insert hyperlink"
                onClick={insertLink}
              />
              <div className="w-px h-6 bg-border mx-1" />
              <FormatButton
                icon={<AlertTriangle className="w-4 h-4" />}
                tooltip="Warning/exclamation box (⚠️)"
                onClick={insertWarningBox}
              />
            </div>
            <Textarea
              ref={textareaRef}
              id="content"
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="Enter the guideline content. Use the toolbar above for formatting."
              className="min-h-[200px] font-mono text-sm rounded-t-none border-t-0"
            />
            <p className="text-xs text-muted-foreground">
              Formatting: **bold**, *italic*, __underline__, • bullets, [text](url) links, ⚠️ warnings
            </p>
          </div>

          {/* Order Index */}
          <div className="space-y-2">
            <Label htmlFor="order_index">Display Order</Label>
            <Input
              id="order_index"
              type="number"
              value={formData.order_index}
              onChange={(e) => setFormData({ ...formData, order_index: parseInt(e.target.value) || 0 })}
              min={0}
            />
            <p className="text-xs text-muted-foreground">
              Lower numbers appear first within each guideline type.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button 
            onClick={handleSubmit}
            disabled={!formData.title.trim() || !formData.content.trim()}
          >
            {isEditing ? 'Update' : 'Create'} Guideline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
