import { Bold, Italic, Underline, List, Link } from "lucide-react";
import { OrderedListDropdown } from "./OrderedListDropdown";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ToolbarButton, TextFormattingGroup } from "./toolbar";

interface TopicFormattingToolbarProps {
  onInsertFootnote?: () => void;
  onInsertLink?: () => void;
}

export function TopicFormattingToolbar({
  onInsertFootnote,
  onInsertLink,
}: TopicFormattingToolbarProps) {
  const exec = (command: string) => {
    document.execCommand(command, false);
  };

  return (
    <div className="bg-background/95 backdrop-blur-sm border rounded-md rounded-b-none border-b flex items-center gap-0.5 p-1.5 flex-wrap">
      <TextFormattingGroup
        onBold={() => exec('bold')}
        onItalic={() => exec('italic')}
        onUnderline={() => exec('underline')}
        boldIcon={<Bold className="h-4 w-4" />}
      />

      <Separator orientation="vertical" className="h-5 mx-1" />

      <ToolbarButton
        icon={<List className="h-4 w-4" />}
        label="Bullet list"
        onClick={() => exec('insertUnorderedList')}
      />

      <OrderedListDropdown
        onInsertOrderedList={(style) => {
          exec('insertOrderedList');
          const sel = window.getSelection();
          if (sel?.anchorNode) {
            const ol = (sel.anchorNode as HTMLElement).closest?.('ol')
              || (sel.anchorNode.parentElement?.closest?.('ol'));
            if (ol) {
              ol.style.listStyleType = style;
              ol.setAttribute('data-list-style', style);
            }
          }
        }}
      />

      <Separator orientation="vertical" className="h-5 mx-1" />

      <ToolbarButton
        icon={<Link className="h-4 w-4" />}
        label="Insert link"
        onClick={() => onInsertLink?.()}
      />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs px-2"
            onClick={onInsertFootnote}
          >
            <sup className="text-[10px] font-bold">1</sup>
            Footnote
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Insert footnote</TooltipContent>
      </Tooltip>
    </div>
  );
}
