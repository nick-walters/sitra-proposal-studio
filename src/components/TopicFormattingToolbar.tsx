import { Bold, Italic, Underline, List, Superscript } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";

interface TopicFormattingToolbarProps {
  activeTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onTextChange?: (newValue: string) => void;
  onInsertFootnote?: () => void;
}

function wrapSelection(
  textarea: HTMLTextAreaElement,
  prefix: string,
  suffix: string,
  onTextChange: (val: string) => void
) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selected = text.slice(start, end);
  const newText = text.slice(0, start) + prefix + selected + suffix + text.slice(end);
  onTextChange(newText);
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(start + prefix.length, end + prefix.length);
  });
}

function insertBullet(
  textarea: HTMLTextAreaElement,
  onTextChange: (val: string) => void
) {
  const start = textarea.selectionStart;
  const text = textarea.value;
  // Find start of current line
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const newText = text.slice(0, lineStart) + "• " + text.slice(lineStart);
  onTextChange(newText);
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(start + 2, start + 2);
  });
}

export function TopicFormattingToolbar({
  activeTextareaRef,
  onTextChange,
  onInsertFootnote,
}: TopicFormattingToolbarProps) {
  const handleFormat = (prefix: string, suffix: string) => {
    const textarea = activeTextareaRef.current;
    if (!textarea || !onTextChange) return;
    wrapSelection(textarea, prefix, suffix, onTextChange);
  };

  const handleBullet = () => {
    const textarea = activeTextareaRef.current;
    if (!textarea || !onTextChange) return;
    insertBullet(textarea, onTextChange);
  };

  return (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b px-3 py-1.5 flex items-center gap-0.5">
      <Toggle
        size="sm"
        className="h-7 w-7 p-0"
        pressed={false}
        onPressedChange={() => handleFormat("**", "**")}
        title="Bold"
      >
        <Bold className="w-3.5 h-3.5" />
      </Toggle>
      <Toggle
        size="sm"
        className="h-7 w-7 p-0"
        pressed={false}
        onPressedChange={() => handleFormat("*", "*")}
        title="Italic"
      >
        <Italic className="w-3.5 h-3.5" />
      </Toggle>
      <Toggle
        size="sm"
        className="h-7 w-7 p-0"
        pressed={false}
        onPressedChange={() => handleFormat("__", "__")}
        title="Underline"
      >
        <Underline className="w-3.5 h-3.5" />
      </Toggle>
      <Toggle
        size="sm"
        className="h-7 w-7 p-0"
        pressed={false}
        onPressedChange={handleBullet}
        title="Bullet point"
      >
        <List className="w-3.5 h-3.5" />
      </Toggle>

      <Separator orientation="vertical" className="h-5 mx-1" />

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 text-xs px-2"
        onClick={onInsertFootnote}
        title="Insert footnote"
      >
        <sup className="text-[10px] font-bold">n</sup>
        Footnote
      </Button>
    </div>
  );
}
