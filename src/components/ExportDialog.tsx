import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Download, FileText, FileType } from 'lucide-react';
import { usePageEstimate } from '@/hooks/usePageEstimate';

export type ExportFormat = 'pdf' | 'docx';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (format: ExportFormat, includeWatermark: boolean) => void;
  proposalId?: string;
}

export function ExportDialog({ open, onOpenChange, onExport, proposalId }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [includeWatermark, setIncludeWatermark] = useState(true);
  const { estimatedPages, totalWords } = usePageEstimate(proposalId || '');

  const handleExport = () => {
    onExport(format, includeWatermark);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Export Part B</DialogTitle>
          <DialogDescription>
            Choose the format and watermark preference for your export.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Page estimate */}
          {estimatedPages !== null && (
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Estimated length</Label>
                <p className="text-xs text-muted-foreground">
                  {totalWords.toLocaleString()} words across all sections
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium">{estimatedPages} {estimatedPages === 1 ? 'page' : 'pages'}</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                  Est.
                </Badge>
              </div>
            </div>
          )}

          {/* Format selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Format</Label>
            <RadioGroup
              value={format}
              onValueChange={(v) => setFormat(v as ExportFormat)}
              className="grid grid-cols-2 gap-3"
            >
              <Label
                htmlFor="format-pdf"
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 cursor-pointer transition-colors ${
                  format === 'pdf'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/30'
                }`}
              >
                <RadioGroupItem value="pdf" id="format-pdf" className="sr-only" />
                <FileText className="h-8 w-8 text-destructive" />
                <span className="text-sm font-medium">PDF</span>
              </Label>
              <Label
                htmlFor="format-docx"
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 cursor-pointer transition-colors ${
                  format === 'docx'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/30'
                }`}
              >
                <RadioGroupItem value="docx" id="format-docx" className="sr-only" />
                <FileType className="h-8 w-8 text-primary" />
                <span className="text-sm font-medium">DOCX</span>
              </Label>
            </RadioGroup>
          </div>

          {/* Watermark toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="watermark-toggle" className="text-sm font-medium">
                Confidential draft watermark
              </Label>
              <p className="text-xs text-muted-foreground">
                Adds a diagonal "Confidential draft" overlay
              </p>
            </div>
            <Switch
              id="watermark-toggle"
              checked={includeWatermark}
              onCheckedChange={setIncludeWatermark}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} className="gap-2">
            <Download className="h-4 w-4" />
            Export {format.toUpperCase()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
