import * as React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/components/ui/input';

interface DebouncedInputProps extends Omit<React.ComponentProps<'input'>, 'onChange' | 'onFocus' | 'onBlur'> {
  value: string;
  onDebouncedChange: (value: string) => void;
  debounceMs?: number;
}

const DebouncedInput = React.forwardRef<HTMLInputElement, DebouncedInputProps>(
  ({ value, onDebouncedChange, debounceMs = 500, ...props }, ref) => {
    const [localValue, setLocalValue] = useState(value ?? '');
    const isFocused = useRef(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const callbackRef = useRef(onDebouncedChange);
    callbackRef.current = onDebouncedChange;

    // Sync from props only when not focused
    useEffect(() => {
      if (!isFocused.current) {
        setLocalValue(value ?? '');
      }
    }, [value]);

    // Cleanup timeout on unmount
    useEffect(() => {
      return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
    }, []);

    const flush = useCallback(() => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setLocalValue(newValue);
      flush();
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(newValue);
        timeoutRef.current = null;
      }, debounceMs);
    };

    const handleFocus = () => {
      isFocused.current = true;
    };

    const handleBlur = () => {
      isFocused.current = false;
      // Flush any pending debounced change immediately on blur
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
        callbackRef.current(localValue);
      }
    };

    return (
      <Input
        ref={ref}
        value={localValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...props}
      />
    );
  }
);

DebouncedInput.displayName = 'DebouncedInput';

export { DebouncedInput };
export type { DebouncedInputProps };
