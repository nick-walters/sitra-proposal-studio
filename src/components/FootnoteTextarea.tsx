import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, FootprintsIcon } from "lucide-react";
import { useRef, useCallback } from "react";

export interface Footnote {
  id: string;
  text: string;
}

interface FootnoteTextareaProps {
  value: string;
  onChange: (value: string) => void;
  footnotes: Footnote[];
  onFootnotesChange: (footnotes: Footnote[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minHeight?: string;
  hideInlineFootnoteButton?: boolean;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  onFocus?: () => void;
}

export function FootnoteTextarea({
  value,
  onChange,
  footnotes,
  onFootnotesChange,
  placeholder,
  disabled = false,
  className,
  minHeight = "150px",
  hideInlineFootnoteButton = false,
  textareaRef: externalRef,
  onFocus,
}: FootnoteTextareaProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalRef || internalRef;

  const insertFootnote = useCallback(() => {
    const nextNumber = footnotes.length + 1;
    const newFootnote: Footnote = {
      id: crypto.randomUUID(),
      text: "",
    };

    // Insert superscript marker at cursor position
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const marker = `[${nextNumber}]`;
      const newValue = value.slice(0, start) + marker + value.slice(end);
      onChange(newValue);

      // Restore cursor after marker
      requestAnimationFrame(() => {
        textarea.focus();
        const newPos = start + marker.length;
        textarea.setSelectionRange(newPos, newPos);
      });
    } else {
      onChange(value + `[${nextNumber}]`);
    }

    onFootnotesChange([...footnotes, newFootnote]);
  }, [value, onChange, footnotes, onFootnotesChange]);

  const updateFootnoteText = useCallback(
    (index: number, text: string) => {
      const updated = footnotes.map((fn, i) => (i === index ? { ...fn, text } : fn));
      onFootnotesChange(updated);
    },
    [footnotes, onFootnotesChange]
  );

  const removeFootnote = useCallback(
    (index: number) => {
      const numberToRemove = index + 1;
      // Remove the marker from text
      let newValue = value.replace(new RegExp(`\\[${numberToRemove}\\]`, "g"), "");
      // Renumber remaining markers
      for (let i = numberToRemove + 1; i <= footnotes.length; i++) {
        newValue = newValue.replace(new RegExp(`\\[${i}\\]`, "g"), `[${i - 1}]`);
      }
      onChange(newValue);
      onFootnotesChange(footnotes.filter((_, i) => i !== index));
    },
    [value, onChange, footnotes, onFootnotesChange]
  );

  return (
    <div className="space-y-2">
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={`text-sm resize-none text-left ${className || ""}`}
          style={{ minHeight }}
          onFocus={onFocus}
        />
        {!disabled && !hideInlineFootnoteButton && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="absolute top-1.5 right-1.5 h-7 gap-1 text-xs bg-background/90 backdrop-blur-sm"
            onClick={insertFootnote}
            title="Insert footnote"
          >
            <sup className="text-[10px] font-bold">n</sup>
            Add footnote
          </Button>
        )}
      </div>

      {footnotes.length > 0 && (
        <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Footnotes</p>
          {footnotes.map((fn, index) => (
            <div key={fn.id} className="flex items-start gap-2">
              <span className="text-xs font-semibold text-muted-foreground mt-2 w-5 shrink-0 text-right">
                [{index + 1}]
              </span>
              {disabled ? (
                <p className="text-sm text-foreground flex-1">{fn.text || <span className="text-muted-foreground italic">Empty footnote</span>}</p>
              ) : (
                <>
                  <Input
                    value={fn.text}
                    onChange={(e) => updateFootnoteText(index, e.target.value)}
                    placeholder={`Footnote ${index + 1} text...`}
                    className="h-8 text-xs flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeFootnote(index)}
                    title="Remove footnote"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Read-only view: renders text with superscript footnote markers and footnote list */
export function FootnoteReadonlyView({
  text,
  footnotes,
  emptyMessage = "No content available",
  maxHeight = "max-h-96",
}: {
  text?: string;
  footnotes?: Footnote[];
  emptyMessage?: string;
  maxHeight?: string;
}) {
  if (!text) {
    return <span className="text-muted-foreground italic">{emptyMessage}</span>;
  }

  // Render text with superscript markers
  const parts = text.split(/(\[\d+\])/g);
  const renderedText = parts.map((part, i) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (match) {
      return (
        <sup key={i} className="text-primary font-semibold text-[10px] cursor-default" title={footnotes?.[parseInt(match[1]) - 1]?.text || ""}>
          {match[1]}
        </sup>
      );
    }
    return part;
  });

  return (
    <div>
      <div className={`prose prose-sm max-w-none dark:prose-invert text-sm leading-relaxed whitespace-pre-wrap bg-muted/30 rounded-lg p-4 ${maxHeight} overflow-y-auto`}>
        {renderedText}
      </div>
      {footnotes && footnotes.length > 0 && (
        <div className="border-t mt-3 pt-2 space-y-1">
          {footnotes.map((fn, index) => (
            <p key={fn.id} className="text-xs text-muted-foreground">
              <sup className="font-semibold">{index + 1}</sup> {fn.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
