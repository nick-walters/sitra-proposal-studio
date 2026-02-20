import { useState, useCallback, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface EuroCurrencyInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  allowPercent?: boolean;
  showEuroPrefix?: boolean;
}

/**
 * Input for euro amounts or ranges. Allows digits, commas, en-dash (–), and optionally %.
 * Auto-corrects hyphen (-) to en-dash (–). Shows uneditable € prefix.
 */
export function EuroCurrencyInput({
  value,
  onChange,
  disabled = false,
  className,
  placeholder,
  allowPercent = false,
  showEuroPrefix = true,
}: EuroCurrencyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const formatDisplay = (raw: string): string => {
    if (!raw) return '';
    // Format each part of a range separately
    const parts = raw.split('–');
    return parts.map(part => {
      const trimmed = part.trim();
      // If it contains %, leave as-is
      if (trimmed.includes('%')) return trimmed;
      // Try to parse as number and format with commas
      const num = parseFloat(trimmed.replace(/,/g, ''));
      if (!isNaN(num)) {
        return num.toLocaleString('en-IE', { maximumFractionDigits: 0 });
      }
      return trimmed;
    }).join('–');
  };

  const [isFocused, setIsFocused] = useState(false);
  const [rawInput, setRawInput] = useState(value || '');

  const displayValue = isFocused ? rawInput : formatDisplay(value);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    setRawInput(value || '');
  }, [value]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    // Clean and save
    const cleaned = rawInput.replace(/-/g, '–').trim();
    onChange(cleaned);
  }, [rawInput, onChange]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    // Only allow digits, commas, hyphens, en-dashes, spaces, and optionally %
    const allowedPattern = allowPercent ? /[^0-9,\-–\s%]/g : /[^0-9,\-–\s]/g;
    val = val.replace(allowedPattern, '');
    // Auto-correct hyphen to en-dash
    val = val.replace(/-/g, '–');
    setRawInput(val);
  }, [allowPercent]);

  return (
    <div className="relative flex items-center">
      {showEuroPrefix && (
        <span className="absolute left-2.5 text-sm text-muted-foreground pointer-events-none select-none z-10">€</span>
      )}
      <Input
        ref={inputRef}
        type="text"
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(showEuroPrefix && 'pl-7', className)}
      />
    </div>
  );
}
