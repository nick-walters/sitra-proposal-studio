import * as React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { useUnloadFlush } from '@/lib/unloadFlush';

interface DebouncedInputProps extends Omit<React.ComponentProps<'input'>, 'onChange'> {
  value: string;
  onDebouncedChange: (value: string) => void;
  debounceMs?: number;
}

const DebouncedInput = React.forwardRef<HTMLInputElement, DebouncedInputProps>(
  ({ value, onDebouncedChange, debounceMs = 500, onFocus, onBlur, ...props }, ref) => {
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

    /** Cancels the timer without writing (used before restarting it). */
    const cancel = useCallback(() => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }, []);

    // The newest un-written value, so unmount and tab close can write it
    // rather than throw away the last keystrokes.
    const pendingRef = useRef<string | null>(null);
    const flushPending = useCallback(() => {
      cancel();
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending !== null) callbackRef.current(pending);
    }, [cancel]);

    const flushRef = useRef(flushPending);
    flushRef.current = flushPending;
    useEffect(() => () => flushRef.current(), []);
    useUnloadFlush(useCallback(() => flushRef.current(), []));

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setLocalValue(newValue);
      pendingRef.current = newValue;
      cancel();
      timeoutRef.current = setTimeout(() => {
        pendingRef.current = null;
        callbackRef.current(newValue);
        timeoutRef.current = null;
      }, debounceMs);
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      isFocused.current = true;
      onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      isFocused.current = false;
      // Flush any pending debounced change immediately on blur
      flushPending();
      onBlur?.(e);
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
