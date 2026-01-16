import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Heading1,
  Heading2,
  Heading3,
  Image,
  Link,
  Undo,
  Redo,
  MessageSquare,
  History,
  Download,
  Save,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ToolbarButtonProps {
  icon: React.ReactNode;
  tooltip: string;
  onClick?: () => void;
  active?: boolean;
}

function ToolbarButton({ icon, tooltip, onClick, active }: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={active ? "secondary" : "ghost"}
          size="icon"
          className="h-8 w-8"
          onClick={onClick}
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

export function EditorToolbar() {
  return (
    <div className="editor-toolbar rounded-t-lg">
      <div className="flex items-center gap-0.5">
        <ToolbarButton icon={<Undo className="w-4 h-4" />} tooltip="Undo (Ctrl+Z)" />
        <ToolbarButton icon={<Redo className="w-4 h-4" />} tooltip="Redo (Ctrl+Y)" />
      </div>

      <Separator orientation="vertical" className="h-6 mx-2" />

      <div className="flex items-center gap-0.5">
        <ToolbarButton icon={<Heading1 className="w-4 h-4" />} tooltip="Heading 1" />
        <ToolbarButton icon={<Heading2 className="w-4 h-4" />} tooltip="Heading 2" />
        <ToolbarButton icon={<Heading3 className="w-4 h-4" />} tooltip="Heading 3" />
      </div>

      <Separator orientation="vertical" className="h-6 mx-2" />

      <div className="flex items-center gap-0.5">
        <ToolbarButton icon={<Bold className="w-4 h-4" />} tooltip="Bold (Ctrl+B)" />
        <ToolbarButton icon={<Italic className="w-4 h-4" />} tooltip="Italic (Ctrl+I)" />
        <ToolbarButton icon={<Underline className="w-4 h-4" />} tooltip="Underline (Ctrl+U)" />
        <ToolbarButton icon={<Strikethrough className="w-4 h-4" />} tooltip="Strikethrough" />
      </div>

      <Separator orientation="vertical" className="h-6 mx-2" />

      <div className="flex items-center gap-0.5">
        <ToolbarButton icon={<List className="w-4 h-4" />} tooltip="Bullet List" />
        <ToolbarButton icon={<ListOrdered className="w-4 h-4" />} tooltip="Numbered List" />
      </div>

      <Separator orientation="vertical" className="h-6 mx-2" />

      <div className="flex items-center gap-0.5">
        <ToolbarButton icon={<AlignLeft className="w-4 h-4" />} tooltip="Align Left" />
        <ToolbarButton icon={<AlignCenter className="w-4 h-4" />} tooltip="Align Center" />
        <ToolbarButton icon={<AlignRight className="w-4 h-4" />} tooltip="Align Right" />
        <ToolbarButton icon={<AlignJustify className="w-4 h-4" />} tooltip="Justify" />
      </div>

      <Separator orientation="vertical" className="h-6 mx-2" />

      <div className="flex items-center gap-0.5">
        <ToolbarButton icon={<Image className="w-4 h-4" />} tooltip="Insert Image" />
        <ToolbarButton icon={<Link className="w-4 h-4" />} tooltip="Insert Link" />
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-0.5">
        <ToolbarButton icon={<MessageSquare className="w-4 h-4" />} tooltip="Comments" />
        <ToolbarButton icon={<History className="w-4 h-4" />} tooltip="Version History" />
        <Separator orientation="vertical" className="h-6 mx-2" />
        <ToolbarButton icon={<Save className="w-4 h-4" />} tooltip="Save (Ctrl+S)" />
        <ToolbarButton icon={<Download className="w-4 h-4" />} tooltip="Export PDF" />
      </div>
    </div>
  );
}
