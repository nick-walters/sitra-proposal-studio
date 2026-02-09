import { useState, useCallback, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { formatNumber, parseFormattedNumber } from '@/lib/formatNumber';
import { cn } from '@/lib/utils';

interface FormattedNumberInputProps {
  value: number | '';
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  step?: string;
  min?: string;
  decimals?: number;
}

export function FormattedNumberInput({
  value,
  onChange,
  disabled = false,
  className,
  placeholder,
  decimals = 0,
}: FormattedNumberInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [rawValue, setRawValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const displayValue = isFocused
    ? rawValue
    : value === '' || value === 0
      ? ''
      : formatNumber(value, decimals);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    setRawValue(value === '' || value === 0 ? '' : value.toString());
  }, [value]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    const parsed = parseFormattedNumber(rawValue);
    onChange(parsed);
  }, [rawValue, onChange]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setRawValue(e.target.value);
  }, []);

  return (
    <Input
      ref={inputRef}
      type={isFocused ? 'number' : 'text'}
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      disabled={disabled}
      placeholder={placeholder}
      className={cn('[&::-webkit-inner-spin-button]:appearance-none', className)}
    />
  );
}
