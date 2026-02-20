import { Bold, Italic, Underline, List, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface TopicFormattingToolbarProps {
  onInsertFootnote?: () => void;
}

export function TopicFormattingToolbar({
  onInsertFootnote,
}: TopicFormattingToolbarProps) {
  const exec = (command: string) => {
    document.execCommand(command, false);
  };

  return (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b flex items-center gap-0.5 p-1.5 flex-wrap">
      {/* Bold */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => exec('bold')}>
            <Bold className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Bold (Ctrl+B)</TooltipContent>
      </Tooltip>

      {/* Italic */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => exec('italic')}>
            <Italic className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Italic (Ctrl+I)</TooltipContent>
      </Tooltip>

      {/* Underline */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => exec('underline')}>
            <Underline className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Underline (Ctrl+U)</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-5 mx-1" />

      {/* Bullet List */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => exec('insertUnorderedList')}>
            <List className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Bullet List</TooltipContent>
      </Tooltip>

      {/* Numbered List */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => exec('insertOrderedList')}>
            <ListOrdered className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Numbered List</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-5 mx-1" />

      {/* Footnote */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs px-2"
            onClick={onInsertFootnote}
          >
            <sup className="text-[10px] font-bold">n</sup>
            Footnote
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Insert Footnote</TooltipContent>
      </Tooltip>
    </div>
  );
}
