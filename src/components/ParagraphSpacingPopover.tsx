import { useState, useEffect, useCallback } from 'react';
import { Editor } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowUpDown } from 'lucide-react';

interface Props {
  editor: Editor;
  disabled?: boolean;
}

export function ParagraphSpacingPopover({ editor, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [before, setBefore] = useState('');
  const [after, setAfter] = useState('');

  // Read current values from the selected paragraph
  const readCurrent = useCallback(() => {
    if (!editor) return;
    const { $from } = editor.state.selection;
    // Walk up to find the paragraph node
    for (let d = $from.depth; d >= 0; d--) {
      const node = $from.node(d);
      if (node.type.name === 'paragraph') {
        setBefore(node.attrs.spacingBefore != null ? String(node.attrs.spacingBefore) : '');
        setAfter(node.attrs.spacingAfter != null ? String(node.attrs.spacingAfter) : '');
        return;
      }
    }
    setBefore('');
    setAfter('');
  }, [editor]);

  useEffect(() => {
    if (open) readCurrent();
  }, [open, readCurrent]);

  const handleApply = () => {
    const beforeVal = before.trim() === '' ? null : parseFloat(before);
    const afterVal = after.trim() === '' ? null : parseFloat(after);

    // Bypass track changes for formatting-only changes
    const s = (editor.storage as any).trackChanges;
    const was = s?.enabled;
    if (s) s.enabled = false;

    editor.commands.setParagraphSpacing({
      before: beforeVal,
      after: afterVal,
    });

    if (s) s.enabled = was;
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={disabled}
              onMouseDown={(e) => e.preventDefault()}
            >
              <ArrowUpDown className="w-4 h-4" />
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
