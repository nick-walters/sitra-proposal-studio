import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowUpDown } from 'lucide-react';

interface Props {
  /** CSS selector or ref to the contentEditable container */
  getContainer: () => HTMLElement | null;
  disabled?: boolean;
}

/**
 * Paragraph spacing popover for contentEditable (non-tiptap) editors.
 * Reads/writes margin-top and margin-bottom on the current paragraph.
 */
export function ParagraphSpacingExecPopover({ getContainer, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [before, setBefore] = useState('');
  const [after, setAfter] = useState('');

  const getCurrentParagraph = useCallback((): HTMLElement | null => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    let node: Node | null = sel.anchorNode;
    const container = getContainer();
    if (!container) return null;

    while (node && node !== container) {
      if (node instanceof HTMLElement && (node.tagName === 'P' || node.tagName === 'DIV') && node.parentElement === container) {
        return node;
      }
      node = node.parentNode;
    }
    return null;
  }, [getContainer]);

  const handleOpen = useCallback((isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      const p = getCurrentParagraph();
      if (p) {
        const mt = p.style.marginTop;
        const mb = p.style.marginBottom;
        setBefore(mt && mt.endsWith('pt') ? String(parseFloat(mt)) : '');
        setAfter(mb && mb.endsWith('pt') ? String(parseFloat(mb)) : '');
      } else {
        setBefore('');
        setAfter('');
      }
    }
  }, [getCurrentParagraph]);

  const handleApply = () => {
    const p = getCurrentParagraph();
    if (!p) {
      setOpen(false);
      return;
    }
    const bVal = before.trim() === '' ? null : parseFloat(before);
    const aVal = after.trim() === '' ? null : parseFloat(after);

    p.style.marginTop = bVal != null ? `${bVal}pt` : '';
    p.style.marginBottom = aVal != null ? `${aVal}pt` : '';

    // Also set data attributes for persistence
    if (bVal != null) p.setAttribute('data-spacing-before', String(bVal));
    else p.removeAttribute('data-spacing-before');
    if (aVal != null) p.setAttribute('data-spacing-after', String(aVal));
    else p.removeAttribute('data-spacing-after');

    // Trigger input event so the editor saves
    p.closest('[contenteditable]')?.dispatchEvent(new Event('input', { bubbles: true }));

    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={disabled}
              onMouseDown={(e) = aria-label="Arrow Up Down" title="Arrow Up Down"> e.preventDefault()}
            >
              <ArrowUpDown className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          Paragraph spacing
        </TooltipContent>
      </Tooltip>
      <PopoverContent className="w-56 p-3" align="start" side="bottom">
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Paragraph spacing (pt)</p>
          <div className="flex items-center gap-2">
            <Label className="text-xs w-12 shrink-0">Before</Label>
            <Input
              type="number"
              min={0}
              max={72}
              step={1}
              value={before}
              onChange={(e) => setBefore(e.target.value)}
              className="h-7 text-xs"
              placeholder="0"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs w-12 shrink-0">After</Label>
            <Input
              type="number"
              min={0}
              max={72}
              step={1}
              value={after}
              onChange={(e) => setAfter(e.target.value)}
              className="h-7 text-xs"
              placeholder="0"
            />
          </div>
          <Button size="sm" className="w-full h-7 text-xs" onClick={handleApply}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
