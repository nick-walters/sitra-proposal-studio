import { useState } from 'react';
import { Editor } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calculator, HelpCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface TableFormulaDialogProps {
  isOpen: boolean;
  onClose: () => void;
  editor: Editor | null;
}

type FormulaType = 'SUM' | 'COUNT' | 'AVERAGE' | 'CUSTOM';

export function TableFormulaDialog({ isOpen, onClose, editor }: TableFormulaDialogProps) {
  const [formulaType, setFormulaType] = useState<FormulaType>('SUM');
  const [startCell, setStartCell] = useState('A1');
  const [endCell, setEndCell] = useState('A10');
  const [customFormula, setCustomFormula] = useState('');

  const getFormula = (): string => {
    if (formulaType === 'CUSTOM') {
      return customFormula.startsWith('=') ? customFormula : `=${customFormula}`;
    }
    return `=${formulaType}(${startCell.toUpperCase()}:${endCell.toUpperCase()})`;
  };

  const handleInsert = () => {
    if (!editor) return;
    
    const formula = getFormula();
    editor.chain().focus().insertContent(formula).run();
    onClose();
  };

  const examples = {
    SUM: 'Adds all numbers in the range. E.g., =SUM(B2:B10) adds values from B2 to B10.',
    COUNT: 'Counts cells with numbers. E.g., =COUNT(A1:A5) counts numeric cells.',
    AVERAGE: 'Calculates the average. E.g., =AVERAGE(C2:C8) averages the values.',
    CUSTOM: 'Enter any formula manually using cell references like A1, B2, etc.',
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5" />
            Insert Table Formula
          </DialogTitle>
          <DialogDescription>
            Add a formula to calculate values from table cells
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Formula type selection */}
          <div className="space-y-2">
            <Label>Formula Type</Label>
            <Select
              value={formulaType}
              onValueChange={(value) => setFormulaType(value as FormulaType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SUM">SUM - Add values</SelectItem>
                <SelectItem value="COUNT">COUNT - Count numbers</SelectItem>
                <SelectItem value="AVERAGE">AVERAGE - Calculate average</SelectItem>
                <SelectItem value="CUSTOM">Custom formula</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{examples[formulaType]}</p>
          </div>

          {formulaType !== 'CUSTOM' ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-cell" className="flex items-center gap-1">
                  Start Cell
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="w-3 h-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Column letter + row number (e.g., A1, B2)
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <Input
                  id="start-cell"
                  value={startCell}
                  onChange={(e) => setStartCell(e.target.value)}
                  placeholder="A1"
                  className="uppercase"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-cell">End Cell</Label>
                <Input
                  id="end-cell"
                  value={endCell}
                  onChange={(e) => setEndCell(e.target.value)}
                  placeholder="A10"
                  className="uppercase"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="custom-formula">Custom Formula</Label>
              <Input
                id="custom-formula"
                value={customFormula}
                onChange={(e) => setCustomFormula(e.target.value)}
                placeholder="=SUM(A1:A10)"
              />
            </div>
          )}

          {/* Formula preview */}
          <div className="bg-muted/50 p-3 rounded-md">
            <Label className="text-xs text-muted-foreground">Formula Preview</Label>
            <code className="block mt-1 text-sm font-mono">{getFormula()}</code>
          </div>

          {/* Cell reference help */}
          <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-md">
            <p className="font-medium mb-1">Cell References:</p>
            <ul className="space-y-0.5 ml-2">
              <li>Columns: A, B, C... (left to right)</li>
              <li>Rows: 1, 2, 3... (top to bottom, including header)</li>
              <li>Example: B2 = Second column, second row</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleInsert}>
            Insert Formula
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
