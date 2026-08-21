import type { Editor } from '@tiptap/react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ChevronsDown,
  ChevronsUp,
  Minus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getEditorCapabilities } from '@/lib/fieldCapabilities';
import { getCellAlign } from '@/lib/tableCellAlignRegistry';
import {
  TABLE_DEFAULT_ALIGN_H,
  TABLE_DEFAULT_ALIGN_V,
  type CellAlignH,
  type CellAlignV,
} from '@/lib/tableStyleSpec';

const H_OPTIONS: { value: CellAlignH; label: string; icon: typeof AlignLeft }[] = [
  { value: 'left', label: 'Align cell left', icon: AlignLeft },
  { value: 'center', label: 'Align cell centre', icon: AlignCenter },
  { value: 'right', label: 'Align cell right', icon: AlignRight },
  { value: 'justify', label: 'Justify cell', icon: AlignJustify },
];

const V_OPTIONS: { value: CellAlignV; label: string; icon: typeof AlignLeft }[] = [
  { value: 'top', label: 'Align cell to the top', icon: ChevronsUp },
  { value: 'middle', label: 'Centre cell vertically', icon: Minus },
  { value: 'bottom', label: 'Align cell to the bottom', icon: ChevronsDown },
];

/**
 * Per-cell alignment, shown only while the caret sits in a table-block cell.
 * Visibility comes from the field's declared `tableCellAlign` capability, not
 * from a hardcoded check on the focused component.
 */
export function CellAlignControls({ editor, disabled }: { editor: Editor | null; disabled?: boolean }) {
  const capabilities = getEditorCapabilities(editor);
  const controller = getCellAlign(editor);
  if (!capabilities.tableCellAlign || !controller) return null;

  const activeH = controller.alignH ?? TABLE_DEFAULT_ALIGN_H;
  const activeV = controller.alignV ?? TABLE_DEFAULT_ALIGN_V;

  return (
    <div className="flex items-center gap-0.5 border-l border-border pl-1">
      {H_OPTIONS.map(({ value, label, icon: Icon }) => (
        <Tooltip key={value}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={activeH === value ? 'secondary' : 'ghost'}
              size="icon"
              className="h-7 w-7"
              aria-label={label}
              disabled={disabled}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => controller.setAlignH(value)}
            >
              <Icon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {label}
          </TooltipContent>
        </Tooltip>
      ))}
      {V_OPTIONS.map(({ value, label, icon: Icon }) => (
        <Tooltip key={value}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={activeV === value ? 'secondary' : 'ghost'}
              size="icon"
              className="h-7 w-7"
              aria-label={label}
              disabled={disabled}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => controller.setAlignV(value)}
            >
              <Icon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {label}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

export default CellAlignControls;
