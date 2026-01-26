import { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Bold, Italic, Underline, List } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WPSimpleEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  minHeight?: string;
}

export function WPSimpleEditor({
  value,
  onChange,
  placeholder = '',
  className,
  disabled = false,
  minHeight = '100px',
}: WPSimpleEditorProps) {
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

  // Sync external value changes
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
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      onChange(newValue);
    }, 500);
  }, [onChange]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput();
  };

  const handleBold = () => execCommand('bold');
  const handleItalic = () => execCommand('italic');
  const handleUnderline = () => execCommand('underline');
  const handleBulletList = () => execCommand('insertUnorderedList');

  const showPlaceholder = !value && !isFocused;

  return (
    <div className={cn("border rounded-md overflow-hidden", disabled && "opacity-50", className)}>
      {/* Toolbar */}
      {!disabled && (
        <div className="flex items-center gap-1 p-1.5 border-b bg-muted/30">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={handleBold}
            title="Bold"
          >
            <Bold className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={handleItalic}
            title="Italic"
          >
            <Italic className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={handleUnderline}
            title="Underline"
          >
            <Underline className="h-3.5 w-3.5" />
          </Button>
          <div className="w-px h-4 bg-border mx-1" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={handleBulletList}
            title="Bullet list"
          >
            <List className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      
      {/* Editor */}
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable={!disabled}
          onInput={handleInput}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={cn(
            "p-3 outline-none resize-y overflow-auto text-sm",
            "[&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4",
            disabled && "cursor-not-allowed"
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
    </div>
  );
}
