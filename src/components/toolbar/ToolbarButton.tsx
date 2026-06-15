import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface ToolbarButtonProps {
  icon: ReactNode;
  label: string;
  isActive?: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
  size?: "sm" | "default";
}

/**
 * Shared toolbar button primitive used across all editor toolbars.
 * Uses onMouseDown+preventDefault to keep editor focus.
 */
export function ToolbarButton({
  icon,
  label,
  isActive,
  disabled,
  onClick,
  className,
  size = "sm",
}: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={isActive ? "secondary" : "ghost"}
          size="icon"
          className={cn(size === "sm" ? "h-7 w-7" : "h-8 w-8", className)}
          disabled={disabled}
          onMouseDown={(e) => {
            e.preventDefault();
            if (!disabled) onClick();
          }}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
