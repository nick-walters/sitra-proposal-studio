import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface SingleMonthPickerProps {
  value: number | null;
  projectDuration: number;
  readOnly?: boolean;
  onChange: (month: number | null) => void;
  label?: string;
}

export function SingleMonthPicker({
  value,
  projectDuration,
  readOnly = false,
  onChange,
  label = 'Due:',
}: SingleMonthPickerProps) {
  const [open, setOpen] = useState(false);
  const months = Array.from({ length: projectDuration }, (_, i) => i + 1);

  const fmt = (m: number | null) => m != null ? `M${String(m).padStart(2, '0')}` : null;

  const handleClick = (m: number) => {
    onChange(m);
    setOpen(false);
  };

  return (
    <>
      <span className="text-xs text-muted-foreground">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="cursor-pointer hover:opacity-80 text-xs h-6 px-2 border rounded-md bg-muted" disabled={readOnly}>
            {value != null ? (
              fmt(value)
            ) : (
              <span className="text-muted-foreground italic font-normal">Select</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-2" align="end">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-muted-foreground font-medium">Select month</span>
            {value != null && (
              <button
                className="text-xs text-muted-foreground hover:text-foreground italic cursor-pointer"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                Clear
              </button>
            )}
          </div>
          <div className="grid grid-cols-6 gap-0.5">
            {months.map(m => {
              const isSelected = m === value;
              return (
                <button
                  key={m}
                  className={cn(
                    'px-1 py-0.5 text-xs rounded cursor-pointer text-center',
                    isSelected && 'bg-primary text-primary-foreground font-bold',
                    !isSelected && 'hover:bg-accent',
                  )}
                  onClick={() => handleClick(m)}
                >
                  M{String(m).padStart(2, '0')}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
