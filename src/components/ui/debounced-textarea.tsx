import * as React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Textarea } from '@/components/ui/textarea';

interface DebouncedTextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  value: string;
  onDebouncedChange: (value: string) => void;
  debounceMs?: number;
}

const DebouncedTextarea = React.forwardRef<HTMLTextAreaElement, DebouncedTextareaProps>(
  ({ value, onDebouncedChange, debounceMs = 500, ...props }, ref) => {
    const [localValue, setLocalValue] = useState(value ?? '');
    const isFocused = useRef(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const callbackRef = useRef(onDebouncedChange);
    callbackRef.current = onDebouncedChange;

    useEffect(() => {
      if (!isFocused.current) {
        setLocalValue(value ?? '');
      }
    }, [value]);

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

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setLocalValue(newValue);
      flush();
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(newValue);
        timeoutRef.current = null;
      }, debounceMs);
    };

    const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
      isFocused.current = true;
      if (props.onFocus) (props as any).onFocus(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
      isFocused.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
        callbackRef.current(localValue);
      }
      if (props.onBlur) (props as any).onBlur(e);
    };

    return (
      <Textarea
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

DebouncedTextarea.displayName = 'DebouncedTextarea';

export { DebouncedTextarea };
export type { DebouncedTextareaProps };
