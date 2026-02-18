import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface AcronymSegment {
  text: string;
  color: string;
}

const COLOR_PALETTE = [
  '#22c55e', '#14b8a6', '#2563eb', '#8b5cf6', '#ef4444', '#f59e0b',
  '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#84cc16', '#0ea5e9',
  '#000000', '#64748b',
];

interface AcronymColorEditorProps {
  acronym: string;
  segments: AcronymSegment[];
  onChange: (segments: AcronymSegment[]) => void;
  onAcronymChange?: (acronym: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

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

function expandToChars(segments: AcronymSegment[]): { char: string; color: string }[] {
  const chars: { char: string; color: string }[] = [];
  for (const seg of segments) {
    for (const ch of seg.text) {
      chars.push({ char: ch, color: seg.color });
    }
  }
  return chars;
}

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

function CustomColorPalette({ onApply, onInteractionStart, onInteractionEnd }: { onApply: (color: string) => void; onInteractionStart?: () => void; onInteractionEnd?: () => void }) {
  const [customOpen, setCustomOpen] = useState(false);
  const [hexInput, setHexInput] = useState('#');
  const [nativeColor, setNativeColor] = useState('#000000');

  const applyCustom = () => {
    const hex = hexInput.startsWith('#') ? hexInput : `#${hexInput}`;
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      onApply(hex);
      setCustomOpen(false);
    }
  };

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="text-[10px] text-muted-foreground mr-1">Apply color:</span>
      <Popover open={customOpen} onOpenChange={setCustomOpen}>
        <PopoverTrigger asChild>
          <button
            className="w-5 h-5 rounded-full border border-border hover:scale-125 transition-transform flex items-center justify-center"
            style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}
            onMouseDown={(e) => e.preventDefault()}
            title="Custom color"
          />
        </PopoverTrigger>
        <PopoverContent className="w-52 p-3 space-y-2" align="start" onOpenAutoFocus={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={nativeColor}
              onFocus={() => onInteractionStart?.()}
              onBlur={() => onInteractionEnd?.()}
              onChange={(e) => {
                setNativeColor(e.target.value);
                setHexInput(e.target.value);
                onApply(e.target.value);
              }}
              className="w-8 h-8 rounded cursor-pointer border-0 p-0"
            />
            <Input
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value)}
              placeholder="#000000"
              className="h-7 text-xs font-mono"
              maxLength={7}
              onKeyDown={(e) => e.key === 'Enter' && applyCustom()}
            />
          </div>
          <Button size="sm" className="w-full h-7 text-xs" tabIndex={0} onMouseDown={(e) => e.preventDefault()} onClick={applyCustom}>
            Apply
          </Button>
        </PopoverContent>
      </Popover>
      {COLOR_PALETTE.map((color) => (
        <button
          key={color}
          className="w-5 h-5 rounded-full border border-border hover:scale-125 transition-transform"
          style={{ backgroundColor: color }}
          tabIndex={0}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onApply(color)}
          title={color}
        />
      ))}
    </div>
  );
}

export function AcronymColorEditor({ acronym, segments, onChange, onAcronymChange, disabled, placeholder = 'Type acronym…' }: AcronymColorEditorProps) {
  // Use fully internal char state to avoid re-render lag from parent
  const [internalChars, setInternalChars] = useState<{ char: string; color: string }[]>(() => {
    const currentText = segments.map(s => s.text).join('');
    if (currentText === acronym && segments.length > 0) return expandToChars(segments);
    return acronym ? [{ char: acronym[0], color: '#000000' }, ...acronym.slice(1).split('').map(c => ({ char: c, color: '#000000' }))] : [];
  });
  const [selStart, setSelStart] = useState<number | null>(null);
  const [selEnd, setSelEnd] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [cursorPos, setCursorPos] = useState<number>(internalChars.length);
  const [isFocused, setIsFocused] = useState(false);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  const onAcronymChangeRef = useRef(onAcronymChange);
  const skipSyncUntilRef = useRef(0);
  const colorPickerActiveRef = useRef(false);
  onChangeRef.current = onChange;
  onAcronymChangeRef.current = onAcronymChange;

  // Sync from props only when NOT focused (external update)
  useEffect(() => {
    if (isFocused) return;
    if (Date.now() < skipSyncUntilRef.current) return;
    const currentText = segments.map(s => s.text).join('');
    if (currentText === acronym && segments.length > 0) {
      setInternalChars(expandToChars(segments));
    } else if (acronym) {
      setInternalChars(acronym.split('').map(c => ({ char: c, color: '#000000' })));
    } else {
      setInternalChars([]);
    }
  }, [acronym, segments, isFocused]);

  // Debounced flush to parent
  const flushToParent = useCallback((chars: { char: string; color: string }[]) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const newSegs = mergeSegments(charsToSegments(chars));
      const newAcronym = chars.map(c => c.char).join('');
      onAcronymChangeRef.current?.(newAcronym);
      onChangeRef.current(newSegs);
    }, 300);
  }, []);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const chars = internalChars;

  useEffect(() => {
    setSelStart(null);
    setSelEnd(null);
  }, [acronym]);

  useEffect(() => {
    if (cursorPos > chars.length) setCursorPos(chars.length);
  }, [chars.length, cursorPos]);

  const handleMouseDown = useCallback((index: number, e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    setSelStart(index);
    setSelEnd(index);
    setIsDragging(true);
    setCursorPos(index + 1);
    hiddenInputRef.current?.focus();
  }, [disabled]);

  const handleMouseEnter = useCallback((index: number) => {
    if (isDragging) setSelEnd(index);
  }, [isDragging]);

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  useEffect(() => {
    const handler = () => setIsDragging(false);
    window.addEventListener('mouseup', handler);
    return () => window.removeEventListener('mouseup', handler);
  }, []);

  const handleContainerClick = useCallback(() => {
    if (disabled) return;
    hiddenInputRef.current?.focus();
    if (selStart === null) setCursorPos(chars.length);
  }, [disabled, chars.length, selStart]);

  const getSelectionRange = (): [number, number] | null => {
    if (selStart === null || selEnd === null) return null;
    return [Math.min(selStart, selEnd), Math.max(selStart, selEnd)];
  };

  const applyColor = useCallback((color: string) => {
    const range = getSelectionRange();
    if (!range) return;
    const [start, end] = range;
    const newChars = [...internalChars];
    for (let i = start; i <= end; i++) {
      newChars[i] = { ...newChars[i], color };
    }
    setInternalChars(newChars);
    skipSyncUntilRef.current = Date.now() + 500;
    const newSegs = mergeSegments(charsToSegments(newChars));
    onChangeRef.current(newSegs);
    // Don't clear selection — user may want to pick another color
  }, [internalChars, selStart, selEnd]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) return;

    const range = getSelectionRange();

    if (e.key === 'Backspace') {
      e.preventDefault();
      if (range) {
        const [start, end] = range;
        const newChars = [...chars];
        newChars.splice(start, end - start + 1);
        setInternalChars(newChars);
        setCursorPos(start);
        setSelStart(null);
        setSelEnd(null);
        flushToParent(newChars);
      } else if (cursorPos > 0) {
        const newChars = [...chars];
        newChars.splice(cursorPos - 1, 1);
        setInternalChars(newChars);
        setCursorPos(cursorPos - 1);
        flushToParent(newChars);
      }
    } else if (e.key === 'Delete') {
      e.preventDefault();
      if (range) {
        const [start, end] = range;
        const newChars = [...chars];
        newChars.splice(start, end - start + 1);
        setInternalChars(newChars);
        setCursorPos(start);
        setSelStart(null);
        setSelEnd(null);
        flushToParent(newChars);
      } else if (cursorPos < chars.length) {
        const newChars = [...chars];
        newChars.splice(cursorPos, 1);
        setInternalChars(newChars);
        flushToParent(newChars);
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (cursorPos > 0) setCursorPos(cursorPos - 1);
      setSelStart(null);
      setSelEnd(null);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (cursorPos < chars.length) setCursorPos(cursorPos + 1);
      setSelStart(null);
      setSelEnd(null);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setCursorPos(0);
      setSelStart(null);
      setSelEnd(null);
    } else if (e.key === 'End') {
      e.preventDefault();
      setCursorPos(chars.length);
      setSelStart(null);
      setSelEnd(null);
    } else if (e.key === 'a' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (chars.length > 0) {
        setSelStart(0);
        setSelEnd(chars.length - 1);
      }
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      // Inherit color from character at cursor position (before cursor), or after cursor, or default black
      const colorAtCursor = cursorPos > 0 ? chars[cursorPos - 1].color : (chars.length > 0 ? chars[0].color : '#000000');

      if (range) {
        const [start, end] = range;
        const newChars = [...chars];
        newChars.splice(start, end - start + 1, { char: e.key, color: colorAtCursor });
        setInternalChars(newChars);
        setCursorPos(start + 1);
        setSelStart(null);
        setSelEnd(null);
        flushToParent(newChars);
      } else {
        const newChars = [...chars];
        newChars.splice(cursorPos, 0, { char: e.key, color: colorAtCursor });
        setInternalChars(newChars);
        setCursorPos(cursorPos + 1);
        flushToParent(newChars);
      }
    }
  }, [disabled, chars, cursorPos, selStart, selEnd, flushToParent]);

  const handleBlur = useCallback((e: React.FocusEvent) => {
    // Don't clear selection if the native color picker is active
    if (colorPickerActiveRef.current) return;
    // Don't clear selection if focus moves to the color palette area
    const container = containerRef.current?.parentElement;
    if (container && e.relatedTarget && container.contains(e.relatedTarget as Node)) {
      return;
    }
    setIsFocused(false);
    setSelStart(null);
    setSelEnd(null);
    // Flush immediately on blur
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const newSegs = mergeSegments(charsToSegments(internalChars));
    const newAcronym = internalChars.map(c => c.char).join('');
    onAcronymChangeRef.current?.(newAcronym);
    onChangeRef.current(newSegs);
  }, [internalChars]);

  const range = getSelectionRange();

  return (
    <div className="space-y-1.5">
      <div
        ref={containerRef}
        className={`flex items-center border rounded-md px-2 py-1.5 bg-background min-h-[32px] cursor-text ${isFocused ? 'ring-2 ring-ring ring-offset-1' : ''}`}
        style={{ fontFamily: '"Arial Black", Arial, sans-serif' }}
        onClick={handleContainerClick}
      >
        {chars.map((ch, i) => {
          const isSelected = range && i >= range[0] && i <= range[1];
          const showCursor = isFocused && !range && cursorPos === i;
          return (
            <span key={i} className="relative">
              {showCursor && (
                <span className="absolute left-0 top-0 bottom-0 w-[1.5px] bg-foreground animate-pulse" style={{ marginTop: 1, marginBottom: 1 }} />
              )}
              <span
                className="cursor-text transition-all text-sm font-black leading-none select-none"
                style={{
                  color: ch.color,
                  backgroundColor: isSelected ? 'hsl(var(--primary) / 0.15)' : undefined,
                  borderBottom: isSelected ? '2px solid hsl(var(--primary))' : '2px solid transparent',
                  padding: '2px 0',
                }}
                onMouseDown={(e) => handleMouseDown(i, e)}
                onMouseEnter={() => handleMouseEnter(i)}
                onMouseUp={handleMouseUp}
              >
                {ch.char}
              </span>
            </span>
          );
        })}
        {isFocused && !range && cursorPos === chars.length && (
          <span className="relative w-0">
            <span className="absolute left-0 top-0 bottom-0 w-[1.5px] bg-foreground animate-pulse" style={{ height: 16 }} />
          </span>
        )}
        {chars.length === 0 && !isFocused && (
          <span className="text-muted-foreground text-xs italic">{placeholder}</span>
        )}
        <input
          ref={hiddenInputRef}
          className="absolute opacity-0 w-0 h-0 pointer-events-none"
          onFocus={() => setIsFocused(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          aria-label="Acronym input"
          disabled={disabled}
        />
      </div>

      {range && !disabled && (
        <CustomColorPalette
          onApply={applyColor}
          onInteractionStart={() => { colorPickerActiveRef.current = true; }}
          onInteractionEnd={() => { colorPickerActiveRef.current = false; }}
        />
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
