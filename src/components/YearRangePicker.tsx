import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface YearRangePickerProps {
  startYear: number | null;
  endYear: number | null;
  onChange: (startYear: number | null, endYear: number | null) => void;
  disabled?: boolean;
  minYear?: number;
  maxYear?: number;
  placeholder?: string;
  className?: string;
}

export function formatYearRange(start: number | null, end: number | null): string | null {
  if (start == null && end == null) return null;
  if (start != null && end != null) return start === end ? String(start) : `${start}–${end}`;
  return String(start ?? end);
}

export function YearRangePicker({
  startYear,
  endYear,
  onChange,
  disabled = false,
  minYear = 2000,
  maxYear = new Date().getFullYear() + 10,
  placeholder = 'Select years',
  className,
}: YearRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [pendingStart, setPendingStartState] = useState<number | null>(null);
  const pendingStartRef = useRef<number | null>(null);
  const setPendingStart = (v: number | null) => {
    pendingStartRef.current = v;
    setPendingStartState(v);
  };
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const currentYearRef = useRef<HTMLButtonElement | null>(null);

  const years = useMemo(
    () => Array.from({ length: Math.max(0, maxYear - minYear + 1) }, (_, i) => minYear + i),
    [minYear, maxYear],
  );
  const currentYear = new Date().getFullYear();

  const label = formatYearRange(startYear, endYear);

  useEffect(() => {
    if (!open) {
      setPendingStart(null);
      return;
    }
    const id = window.setTimeout(() => {
      currentYearRef.current?.scrollIntoView({ block: 'center' });
    }, 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const handleOpenChange = (next: boolean) => {
    if (disabled) return;
    const pending = pendingStartRef.current;
    if (!next && pending != null) {
      // Single-click convenience: dismissing with only a start picked saves a one-year range.
      setPendingStart(null);
      onChange(pending, pending);
    }
    setOpen(next);
  };

  const handleYearClick = (year: number) => {
    if (pendingStart == null) {
      setPendingStart(year);
      return;
    }
    if (year < pendingStart) {
      setPendingStart(year);
      return;
    }
    onChange(pendingStart, year);
    setPendingStart(null);
    setOpen(false);
  };

  if (disabled) {
    return (
      <span className={cn('truncate text-xs', !label && 'text-muted-foreground', className)}>
        {label ?? '—'}
      </span>
    );
  }

  const rangeStart = pendingStart ?? startYear;
  const rangeEnd = pendingStart != null ? null : endYear;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Duration years"
          className={cn('h-8 w-full justify-start text-xs font-normal', className)}
        >
          {label ?? <span className="text-muted-foreground">{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div ref={scrollRef} className="max-h-56 overflow-y-auto">
          <div className="grid grid-cols-6 gap-1">
            {years.map((y) => {
              const isStart = rangeStart === y;
              const isEnd = rangeEnd === y;
              const inRange =
                rangeStart != null && rangeEnd != null && y > rangeStart && y < rangeEnd;
              const selectable = pendingStart != null && y >= pendingStart;
              return (
                <button
                  key={y}
                  ref={y === currentYear ? currentYearRef : undefined}
                  type="button"
                  onClick={() => handleYearClick(y)}
                  className={cn(
                    'rounded px-1 py-1 text-[11px] transition-colors hover:bg-accent',
                    inRange && 'bg-accent/60',
                    selectable && !isStart && 'hover:bg-primary/20',
                    (isStart || isEnd) && 'bg-primary font-semibold text-primary-foreground',
                  )}
                >
                  {y}
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
          <span className="text-[11px] text-muted-foreground">
            {pendingStart != null ? 'Select the end year' : ''}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              setPendingStart(null);
              onChange(null, null);
              setOpen(false);
            }}
          >
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default YearRangePicker;
