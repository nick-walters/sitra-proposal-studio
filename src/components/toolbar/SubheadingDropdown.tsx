import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface SubheadingDropdownProps {
  onNumbered: () => void;
  onUnnumbered: () => void;
  /** When provided, renders a "Body" reset item above the others. */
  onBody?: () => void;
  disabled?: boolean;
  label?: string;
  isActive?: boolean;
  /** Custom label for the numbered item (e.g. with prefix like "1.1.1. Numbered subheading"). */
  numberedLabel?: string;
  /** Custom label for the unnumbered item. */
  unnumberedLabel?: string;
  bodyLabel?: string;
}

export function SubheadingDropdown({
  onNumbered,
  onUnnumbered,
  onBody,
  disabled,
  label = "Subheading",
  isActive,
  numberedLabel = "Numbered subheading",
  unnumberedLabel = "Unnumbered subheading",
  bodyLabel = "Body",
}: SubheadingDropdownProps) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant={isActive ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              disabled={disabled}
            >
              <span className="font-black underline">{label}</span>
              <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          Insert subheading
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-64">
        {onBody && (
          <>
            <DropdownMenuItem onClick={onBody}>
              <span className="text-sm">{bodyLabel}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={onNumbered}>
          <span className="text-sm font-semibold underline">{numberedLabel}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onUnnumbered}>
          <span className="text-sm font-bold underline">{unnumberedLabel}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
