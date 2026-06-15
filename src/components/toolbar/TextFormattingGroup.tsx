import { ReactNode } from "react";
import { Italic, Underline } from "lucide-react";
import { ToolbarButton } from "./ToolbarButton";

export interface TextFormattingGroupProps {
  onBold: () => void;
  onItalic: () => void;
  onUnderline: () => void;
  isBoldActive?: boolean;
  isItalicActive?: boolean;
  isUnderlineActive?: boolean;
  disabled?: boolean;
  /** Custom Bold glyph — defaults to a bold "B" character to match the document/draft toolbars. */
  boldIcon?: ReactNode;
}

export function TextFormattingGroup({
  onBold,
  onItalic,
  onUnderline,
  isBoldActive,
  isItalicActive,
  isUnderlineActive,
  disabled,
  boldIcon,
}: TextFormattingGroupProps) {
  return (
    <>
      <ToolbarButton
        icon={boldIcon ?? <span className="font-black text-sm">B</span>}
        label="Bold (Ctrl+B)"
        onClick={onBold}
        isActive={isBoldActive}
        disabled={disabled}
      />
      <ToolbarButton
        icon={<Italic className="h-4 w-4" />}
        label="Italic (Ctrl+I)"
        onClick={onItalic}
        isActive={isItalicActive}
        disabled={disabled}
      />
      <ToolbarButton
        icon={<Underline className="h-4 w-4" />}
        label="Underline (Ctrl+U)"
        onClick={onUnderline}
        isActive={isUnderlineActive}
        disabled={disabled}
      />
    </>
  );
}
