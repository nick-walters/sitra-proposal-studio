import { useState } from "react";
import { Table as TableIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface TableGridPickerProps {
  onInsert: (rows: number, cols: number) => void;
  disabled?: boolean;
  maxRows?: number;
  maxCols?: number;
  /** Optional controlled state */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function TableGridPicker({
  onInsert,
  disabled,
  maxRows = 8,
  maxCols = 8,
  open,
  onOpenChange,
}: TableGridPickerProps) {
  const [hoveredRows, setHoveredRows] = useState(0);
  const [hoveredCols, setHoveredCols] = useState(0);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 gap-1"
              disabled={disabled}
            >
              <TableIcon className="h-4 w-4" />
              <span className="text-xs">Table</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          Insert table
        </TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-auto p-0">
        <div className="p-2">
          <div className="text-xs text-muted-foreground mb-2 text-center">
            {hoveredRows > 0 && hoveredCols > 0
              ? `${hoveredRows} × ${hoveredCols} table`
              : "Select table size"}
          </div>
          <div
            className="grid gap-0.5"
            style={{ gridTemplateColumns: `repeat(${maxCols}, 1fr)` }}
            onMouseLeave={() => {
              setHoveredRows(0);
              setHoveredCols(0);
            }}
          >
            {Array.from({ length: maxRows * maxCols }).map((_, index) => {
              const row = Math.floor(index / maxCols) + 1;
              const col = (index % maxCols) + 1;
              const isHighlighted = row <= hoveredRows && col <= hoveredCols;
              const isHeaderRow = row === 1 && isHighlighted;

              return (
                <button
                  key={index}
                  type="button"
                  className={`w-4 h-4 border rounded-sm transition-colors ${
                    isHeaderRow
                      ? "bg-foreground border-foreground"
                      : isHighlighted
                        ? "bg-primary/40 border-primary/60"
                        : "bg-muted border-border hover:border-primary/50"
                  }`}
                  onMouseEnter={() => {
                    setHoveredRows(row);
                    setHoveredCols(col);
                  }}
                  onClick={() => onInsert(row, col)}
                />
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
