import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Paintbrush, RotateCcw } from 'lucide-react';

export interface AcronymSegment {
  text: string;
  color: string;
}

const COLOR_PALETTE = [
  '#22c55e', // leaf green
  '#14b8a6', // teal
  '#2563eb', // blue
  '#8b5cf6', // violet
  '#ef4444', // red
  '#f59e0b', // amber
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#6366f1', // indigo
  '#84cc16', // lime
  '#0ea5e9', // sky blue
  '#000000', // black
  '#64748b', // slate
];

interface AcronymColorEditorProps {
  acronym: string;
  segments: AcronymSegment[];
  onChange: (segments: AcronymSegment[]) => void;
  disabled?: boolean;
}

/** Merge adjacent segments with the same color */
function mergeSegments(segments: AcronymSegment[]): AcronymSegment[] {
  if (segments.length === 0) return [];
  const merged: AcronymSegment[] = [{ ...segments[0] }];
  for (let i = 1; i < segments.length; i++) {
    const last = merged[merged.length - 1];
    if (last.color === segments[i].color) {
      last.text += segments[i].text;
    } else {
      merged.push({ ...segments[i] });
    }
  }
  return merged;
}

/** Expand segments to per-character array */
function expandToChars(segments: AcronymSegment[]): { char: string; color: string }[] {
  const chars: { char: string; color: string }[] = [];
  for (const seg of segments) {
    for (const ch of seg.text) {
      chars.push({ char: ch, color: seg.color });
    }
  }
  return chars;
}

/** Build segments from per-character colors */
function charsToSegments(chars: { char: string; color: string }[]): AcronymSegment[] {
  if (chars.length === 0) return [];
  const segs: AcronymSegment[] = [{ text: chars[0].char, color: chars[0].color }];
  for (let i = 1; i < chars.length; i++) {
    const last = segs[segs.length - 1];
    if (last.color === chars[i].color) {
      last.text += chars[i].char;
    } else {
      segs.push({ text: chars[i].char, color: chars[i].color });
    }
  }
  return segs;
}

/** Default: all characters black */
function defaultSegments(acronym: string): AcronymSegment[] {
  return acronym ? [{ text: acronym, color: '#000000' }] : [];
}

export function AcronymColorEditor({ acronym, segments, onChange, disabled }: AcronymColorEditorProps) {
  // Ensure segments match current acronym text
  const currentText = segments.map(s => s.text).join('');
  const effectiveSegments = currentText === acronym ? segments : defaultSegments(acronym);
  
  const chars = expandToChars(effectiveSegments);
  const [selStart, setSelStart] = useState<number | null>(null);
  const [selEnd, setSelEnd] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset selection if acronym changes
  useEffect(() => {
    setSelStart(null);
    setSelEnd(null);
  }, [acronym]);

  const handleMouseDown = useCallback((index: number) => {
    if (disabled) return;
    setSelStart(index);
    setSelEnd(index);
    setIsDragging(true);
  }, [disabled]);

  const handleMouseEnter = useCallback((index: number) => {
    if (isDragging) {
      setSelEnd(index);
    }
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    const handler = () => setIsDragging(false);
    window.addEventListener('mouseup', handler);
    return () => window.removeEventListener('mouseup', handler);
  }, []);

  const getSelectionRange = (): [number, number] | null => {
    if (selStart === null || selEnd === null) return null;
    const start = Math.min(selStart, selEnd);
    const end = Math.max(selStart, selEnd);
    return [start, end];
  };

  const applyColor = (color: string) => {
    const range = getSelectionRange();
    if (!range) return;
    const [start, end] = range;
    const newChars = [...chars];
    for (let i = start; i <= end; i++) {
      newChars[i] = { ...newChars[i], color };
    }
    onChange(mergeSegments(charsToSegments(newChars)));
    setSelStart(null);
    setSelEnd(null);
  };

  const resetColors = () => {
    onChange(defaultSegments(acronym));
    setSelStart(null);
    setSelEnd(null);
  };

  const range = getSelectionRange();

  return (
    <div className="space-y-1.5">
      {/* Character display - select characters by clicking/dragging */}
      <div 
        ref={containerRef}
        className="flex items-center select-none border rounded-md px-2 py-1.5 bg-background min-h-[32px]"
        style={{ fontFamily: '"Arial Black", Arial, sans-serif' }}
      >
        {chars.map((ch, i) => {
          const isSelected = range && i >= range[0] && i <= range[1];
          return (
            <span
              key={i}
              className="cursor-pointer transition-all text-sm font-black leading-none"
              style={{
                color: ch.color,
                backgroundColor: isSelected ? 'hsl(var(--primary) / 0.15)' : undefined,
                borderBottom: isSelected ? '2px solid hsl(var(--primary))' : '2px solid transparent',
                padding: '2px 0',
              }}
              onMouseDown={(e) => { e.preventDefault(); handleMouseDown(i); }}
              onMouseEnter={() => handleMouseEnter(i)}
              onMouseUp={handleMouseUp}
            >
              {ch.char}
            </span>
          );
        })}
        {chars.length === 0 && (
          <span className="text-muted-foreground text-xs italic">No acronym set</span>
        )}
      </div>

      {/* Color palette - shown when selection exists */}
      {range && !disabled && (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] text-muted-foreground mr-1">Apply color:</span>
          {COLOR_PALETTE.map((color) => (
            <button
              key={color}
              className="w-5 h-5 rounded-full border border-border hover:scale-125 transition-transform"
              style={{ backgroundColor: color }}
              onClick={() => applyColor(color)}
              title={color}
            />
          ))}
          <Button variant="ghost" size="sm" className="h-5 px-1.5 ml-1" onClick={resetColors} title="Reset all colors">
            <RotateCcw className="w-3 h-3" />
          </Button>
        </div>
      )}

      {!range && chars.length > 0 && !disabled && (
        <p className="text-[10px] text-muted-foreground">Select characters above to apply colors</p>
      )}
    </div>
  );
}

/** Render a colored acronym inline (read-only display) */
export function ColoredAcronym({ segments, className }: { segments: AcronymSegment[]; className?: string }) {
  if (!segments || segments.length === 0) return null;
  return (
    <span className={className} style={{ fontFamily: '"Arial Black", Arial, sans-serif', fontWeight: 900 }}>
      {segments.map((seg, i) => (
        <span key={i} style={{ color: seg.color }}>{seg.text}</span>
      ))}
    </span>
  );
}
