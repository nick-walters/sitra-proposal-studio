import { AlignLeft, AlignCenter, AlignRight, AlignJustify } from "lucide-react";
import { ToolbarButton } from "./ToolbarButton";

export type Alignment = "left" | "center" | "right" | "justify";

export interface AlignmentGroupProps {
  onAlign: (alignment: Alignment) => void;
  activeAlignment?: string;
  disabled?: boolean;
}

const ITEMS: { value: Alignment; icon: React.ReactNode; label: string }[] = [
  { value: "left", icon: <AlignLeft className="h-4 w-4" />, label: "Align left" },
  { value: "center", icon: <AlignCenter className="h-4 w-4" />, label: "Align center" },
  { value: "right", icon: <AlignRight className="h-4 w-4" />, label: "Align right" },
  { value: "justify", icon: <AlignJustify className="h-4 w-4" />, label: "Justify" },
];

export function AlignmentGroup({ onAlign, activeAlignment, disabled }: AlignmentGroupProps) {
  return (
    <>
      {ITEMS.map((item) => (
        <ToolbarButton
          key={item.value}
          icon={item.icon}
          label={item.label}
          onClick={() => onAlign(item.value)}
          isActive={!disabled && activeAlignment === item.value}
          disabled={disabled}
        />
      ))}
    </>
  );
}
