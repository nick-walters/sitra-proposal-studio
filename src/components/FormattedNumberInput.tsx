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
  allowZero?: boolean;
}

export function FormattedNumberInput({
  value,
  onChange,
  disabled = false,
  className,
  placeholder,
  decimals = 0,
  allowZero = false,
}: FormattedNumberInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [rawValue, setRawValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const isEmptyValue = (allowZero || decimals > 0) ? value === '' : value === '' || value === 0;

  const displayValue = isFocused
    ? rawValue
    : isEmptyValue
      ? ''
      : formatNumber(value as number, decimals);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    setRawValue(isEmptyValue ? '' : (value as number).toString());
  }, [value, isEmptyValue]);

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
