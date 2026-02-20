import { useRef, useEffect, useCallback, useState } from 'react';
import { cn } from '@/lib/utils';

interface TopicRichTextAreaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minHeight?: string;
  onFocus?: () => void;
  footnotes?: { id: string; text: string }[];
  onFootnotesChange?: (footnotes: { id: string; text: string }[]) => void;
  footnoteStartNumber?: number;
}

export function TopicRichTextArea({
  value,
  onChange,
  placeholder = '',
  disabled = false,
  minHeight = '150px',
  onFocus,
  footnotes = [],
  onFootnotesChange,
  footnoteStartNumber = 1,
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

  // Handle paste: strip font sizes, keep structure
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');

    if (html) {
      // Parse HTML, strip font-size and font-family styles but keep structure
      const temp = document.createElement('div');
      temp.innerHTML = html;
      // Remove font-size and font-family from all elements
      temp.querySelectorAll('*').forEach(el => {
        const htmlEl = el as HTMLElement;
        if (htmlEl.style) {
          htmlEl.style.fontSize = '';
          htmlEl.style.fontFamily = '';
          htmlEl.style.lineHeight = '';
        }
        // Remove font tags
        if (el.tagName === 'FONT') {
          const span = document.createElement('span');
          span.innerHTML = el.innerHTML;
          el.replaceWith(span);
        }
      });
      document.execCommand('insertHTML', false, temp.innerHTML);
    } else {
      // Plain text: convert line breaks to paragraphs
      const paragraphs = text.split(/\n\n|\r\n\r\n/).map(p => {
        const lines = p.split(/\n|\r\n/).join('<br>');
        return `<p>${lines}</p>`;
      }).join('');
      document.execCommand('insertHTML', false, paragraphs || text);
    }
  }, []);

  // Sync footnotes: remove orphaned footnotes whose markers were deleted from HTML
  const syncFootnotesWithContent = useCallback(() => {
    if (!editorRef.current || !onFootnotesChange || !footnotes.length) return;
    const markers = editorRef.current.querySelectorAll('sup[data-footnote-id]');
    const presentIds = new Set<string>();
    markers.forEach(m => {
      const id = m.getAttribute('data-footnote-id');
      if (id) presentIds.add(id);
    });
    // If no tracked markers exist at all, check if content is effectively empty
    // to clear legacy footnotes that had no data-footnote-id
    if (presentIds.size === 0) {
      const allSups = editorRef.current.querySelectorAll('sup.footnote-marker');
      if (allSups.length === 0) {
        onFootnotesChange([]);
        return;
      }
    }
    const filtered = footnotes.filter(fn => presentIds.has(fn.id));
    if (filtered.length !== footnotes.length) {
      onFootnotesChange(filtered);
    }
    // Renumber markers sequentially
    const startNum = footnoteStartNumber;
    let idx = 0;
    markers.forEach(m => {
      const id = m.getAttribute('data-footnote-id');
      if (id && filtered.some(fn => fn.id === id)) {
        m.textContent = `${startNum + idx}`;
        idx++;
      }
    });
  }, [footnotes, onFootnotesChange, footnoteStartNumber]);

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    syncFootnotesWithContent();
    const newValue = editorRef.current.innerHTML;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChange(newValue);
    }, 500);
  }, [onChange, syncFootnotesWithContent]);

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
        onPaste={handlePaste}
        onFocus={() => { setIsFocused(true); onFocus?.(); }}
        onBlur={() => setIsFocused(false)}
        className={cn(
          "p-3 outline-none resize-y overflow-auto text-sm topic-rich-text-content",
          "[&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4",
          "[&_a]:text-primary [&_a]:underline [&_a]:cursor-pointer",
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
      {/* Footnotes area */}
      {footnotes.length > 0 && (
        <div className="border-t px-3 py-2 space-y-1 bg-muted/30">
          {footnotes.map((fn, idx) => {
            const displayNum = footnoteStartNumber + idx;
            return (
              <div key={fn.id} className="flex items-start gap-1.5 text-xs">
                <sup className="text-primary font-semibold text-[10px] relative top-[-0.15em] shrink-0">{displayNum}</sup>
                {!disabled ? (
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    className="flex-1 bg-transparent border-b border-dashed border-muted-foreground/30 outline-none text-xs py-0.5 focus:border-primary [&_a]:text-primary [&_a]:underline"
                    dangerouslySetInnerHTML={{ __html: fn.text || '' }}
                    onBlur={(e) => {
                      if (onFootnotesChange) {
                        const updated = [...footnotes];
                        updated[idx] = { ...fn, text: e.currentTarget.innerHTML };
                        onFootnotesChange(updated);
                      }
                    }}
                    data-placeholder="Enter reference (paste links supported)..."
                  />
                ) : (
                  <span className="text-muted-foreground [&_a]:text-primary [&_a]:underline" dangerouslySetInnerHTML={{ __html: fn.text || '–' }} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Read-only view for rich text with clickable links */
export function TopicRichTextReadonly({ html, footnotes = [], emptyMessage = '–', footnoteStartNumber = 1 }: {
  html?: string;
  footnotes?: { id: string; text: string }[];
  emptyMessage?: string;
  footnoteStartNumber?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Make links clickable in read-only mode
  useEffect(() => {
    if (!ref.current) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      if (anchor) {
        e.preventDefault();
        window.open(anchor.href, '_blank', 'noopener,noreferrer');
      }
    };
    ref.current.addEventListener('click', handleClick);
    return () => ref.current?.removeEventListener('click', handleClick);
  }, []);

  if (!html) {
    return <p className="text-sm text-muted-foreground italic">{emptyMessage}</p>;
  }

  return (
    <div>
      <div
        ref={ref}
        className="text-sm topic-rich-text-content [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_a]:text-primary [&_a]:underline [&_a]:cursor-pointer"
        style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {footnotes.length > 0 && (
        <div className="border-t mt-2 pt-2 space-y-0.5">
          {footnotes.map((fn, idx) => (
            <div key={fn.id} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <sup className="text-primary font-semibold text-[10px] mt-0.5">{footnoteStartNumber + idx}</sup>
              <span className="[&_a]:text-primary [&_a]:underline [&_a]:cursor-pointer" dangerouslySetInnerHTML={{ __html: fn.text || '–' }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
