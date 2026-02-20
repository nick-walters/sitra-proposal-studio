import { useRef, useEffect, useCallback, useState } from 'react';
import { cn } from '@/lib/utils';

interface TopicRichTextAreaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minHeight?: string;
  onFocus?: () => void;
}

export function TopicRichTextArea({
  value,
  onChange,
  placeholder = '',
  disabled = false,
  minHeight = '150px',
  onFocus,
}: TopicRichTextAreaProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialMount = useRef(true);

  // Set initial content
  useEffect(() => {
    if (editorRef.current && isInitialMount.current) {
      editorRef.current.innerHTML = value || '';
      isInitialMount.current = false;
    }
  }, []);

  // Sync external value changes when not focused
  useEffect(() => {
    if (editorRef.current && !isFocused) {
      const currentContent = editorRef.current.innerHTML;
      if (currentContent !== value) {
        editorRef.current.innerHTML = value || '';
      }
    }
  }, [value, isFocused]);

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    const newValue = editorRef.current.innerHTML;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChange(newValue);
    }, 500);
  }, [onChange]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const showPlaceholder = !value && !isFocused;

  return (
    <div className="border rounded-md overflow-hidden relative">
      <div
        ref={editorRef}
        contentEditable={!disabled}
        onInput={handleInput}
        onFocus={() => { setIsFocused(true); onFocus?.(); }}
        onBlur={() => setIsFocused(false)}
        className={cn(
          "p-3 outline-none resize-y overflow-auto text-sm",
          "[&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4",
          disabled && "cursor-not-allowed opacity-50"
        )}
        style={{ minHeight, fontFamily: 'Arial, Helvetica, sans-serif' }}
        suppressContentEditableWarning
      />
      {showPlaceholder && (
        <div className="absolute top-3 left-3 text-muted-foreground text-sm pointer-events-none">
          {placeholder}
        </div>
      )}
    </div>
  );
}
