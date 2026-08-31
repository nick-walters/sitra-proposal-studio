import { useState } from 'react';
import { formatNumber } from '@/lib/formatNumber';

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
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Download, FileText, FileType } from 'lucide-react';
import { usePageEstimate } from '@/hooks/usePageEstimate';

function detectBrowser(): 'chromium' | 'firefox' | 'safari' | 'unknown' {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('edg/') || ua.includes('chrome/') || ua.includes('chromium/')) return 'chromium';
  if (ua.includes('firefox/')) return 'firefox';
  if (ua.includes('safari/') && !ua.includes('chrome/')) return 'safari';
  return 'unknown';
}

export type ExportFormat = 'pdf' | 'docx';

const PART_B_SUBSECTIONS: Array<{ number: string; title: string }> = [
  { number: '1.1', title: 'Objectives & ambition' },
  { number: '1.2', title: 'Methodology' },
  { number: '2.1', title: 'Project’s pathways towards impact' },
  { number: '2.2', title: 'Measures to maximise impact' },
  { number: '3.1', title: 'Work plan & resources' },
  { number: '3.2', title: 'Capacity of participants & consortium as a whole' },
];

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (format: ExportFormat, selectedSections?: string[]) => void;
  proposalId?: string;
}

export function ExportDialog({ open, onOpenChange, onExport, proposalId }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('docx');
  const [selected, setSelected] = useState<string[]>(PART_B_SUBSECTIONS.map((s) => s.number));
  const { estimatedPages, totalWords } = usePageEstimate(proposalId || '');
  const browser = detectBrowser();
  const isOptimalBrowser = browser === 'chromium';

  const allSelected = selected.length === PART_B_SUBSECTIONS.length;

  const toggle = (number: string, checked: boolean) => {
    setSelected((prev) =>
      checked ? [...prev, number] : prev.filter((n) => n !== number),
    );
  };

  const handleExport = () => {
    onExport(format, allSelected ? undefined : selected);
    onOpenChange(false);
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Export part B</DialogTitle>
          <DialogDescription>
            Choose the export format for your proposal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Page estimate */}
          {estimatedPages !== null && (
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Estimated length</Label>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(totalWords)} words across all sections
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

          {/* Subsection selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Sections to include</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() =>
                  setSelected(allSelected ? [] : PART_B_SUBSECTIONS.map((s) => s.number))
                }
              >
                {allSelected ? 'Clear all' : 'Select all'}
              </Button>
            </div>
            <div className="space-y-2">
              {PART_B_SUBSECTIONS.map((s) => (
                <div key={s.number} className="flex items-center gap-2">
                  <Checkbox
                    id={`section-${s.number}`}
                    checked={selected.includes(s.number)}
                    onCheckedChange={(checked) => toggle(s.number, checked === true)}
                  />
                  <Label
                    htmlFor={`section-${s.number}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {s.number}. {s.title}
                  </Label>
                </div>
              ))}
            </div>
            {!allSelected && selected.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Partial export. Section numbering, cross-references and figure and table
                numbers stay exactly as they are in the full proposal — nothing is
                renumbered.
              </p>
            )}
          </div>

          {format === 'pdf' && !isOptimalBrowser && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              <strong>For best results, export from Microsoft Edge or Google Chrome.</strong>
              {' '}You can still export from this browser, but page layout, headers, footers,
              and page numbers may render differently.
            </div>
          )}

          {format === 'pdf' && isOptimalBrowser && (
            <p className="text-xs text-muted-foreground">
              PDF export opens the browser print dialog. Select "Save as PDF" as the destination.
            </p>
          )}

          {format === 'docx' && (
            <div className="rounded-lg border border-blue-300 bg-blue-50 p-3 text-xs text-blue-900">
              <strong>Word export is provided as a fallback for offline editing.</strong>
              {' '}For best visual fidelity, use the PDF export. Some advanced formatting
              (cross-reference badges, tables) may differ slightly from the platform.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} className="gap-2" disabled={selected.length === 0}>
            <Download className="h-4 w-4" />
            Export {format.toUpperCase()}
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
