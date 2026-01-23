import { useState, useEffect } from "react";
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
import { Info, Lightbulb, ClipboardCheck } from "lucide-react";
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

export function GuidelineEditorDialog({
  isOpen,
  onClose,
  guideline,
  sectionId,
  existingGuidelinesCount,
  onSave,
}: GuidelineEditorDialogProps) {
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    guideline_type: 'official' as 'official' | 'sitra_tip' | 'evaluation',
    order_index: existingGuidelinesCount,
  });

  const isEditing = !!guideline;

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

          {/* Content */}
          <div className="space-y-2">
            <Label htmlFor="content">Content *</Label>
            <Textarea
              id="content"
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="Enter the guideline content. Use bullet points with • or - at the start of lines. Use ⚠️ or ! at the start of a line to mark warnings."
              className="min-h-[200px] font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Tips: Start lines with • or - for bullet points. Start with ⚠️ or ! for warning highlights.
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
