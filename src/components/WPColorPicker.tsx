import { useState, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DEFAULT_WP_COLORS } from '@/lib/wpColors';
import { cn } from '@/lib/utils';

// ---------- Format helpers (canonical storage is always hex) ----------

type ColorFormat = 'hex' | 'rgb';

const HEX_RE = /^#([0-9a-fA-F]{6})$/;
const RGB_RE = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/;

function normaliseHex(v: string): string | null {
  const m = v.trim().match(HEX_RE);
  return m ? `#${m[1].toUpperCase()}` : null;
}

function hexToRgbString(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

function rgbStringToHex(v: string): string | null {
  const m = v.trim().match(RGB_RE);
  if (!m) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map((n) => parseInt(n, 10));
  if ([r, g, b].some((n) => n < 0 || n > 255)) return null;
  const toHex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function formatValue(hex: string, format: ColorFormat): string {
  if (format === 'rgb') return hexToRgbString(hex);
  return hex.toUpperCase();
}

function parseValue(input: string, format: ColorFormat): string | null {
  return format === 'rgb' ? rgbStringToHex(input) : normaliseHex(input);
}

// ---------- Picker ----------

interface WPColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  disabled?: boolean;
  /** The fixed default palette (defaults to DEFAULT_WP_COLORS in canonical order). */
  palette?: string[];
  /** Extra "in-proposal" colours to render as a second section (deduped against palette). */
  extraColors?: string[];
  /** If set, renders a filled WP-number pill trigger; otherwise a bordered swatch button. */
  wpNumber?: number;
  /** Optional label shown above the palette. */
  label?: string;
}

export function WPColorPicker({
  color,
  onChange,
  disabled = false,
  palette = DEFAULT_WP_COLORS,
  extraColors = [],
  wpNumber,
  label,
}: WPColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ColorFormat>('hex');
  const [inputValue, setInputValue] = useState(() => formatValue(color, 'hex'));

  useEffect(() => {
    setInputValue(formatValue(color, format));
  }, [color, format]);

  // Dedupe extras against the default palette (case-insensitive hex compare)
  const paletteSet = new Set(palette.map((c) => c.toUpperCase()));
  const dedupedExtras = Array.from(
    new Set(
      extraColors
        .map((c) => normaliseHex(c) ?? c.toUpperCase())
        .filter((c) => HEX_RE.test(c) && !paletteSet.has(c))
    )
  );

  const commitColor = (newHex: string) => {
    onChange(newHex);
    setInputValue(formatValue(newHex, format));
  };

  const handleSelectSwatch = (paletteColor: string) => {
    const hex = normaliseHex(paletteColor) ?? paletteColor;
    commitColor(hex);
    setOpen(false);
  };

  const handleInputBlur = () => {
    const parsed = parseValue(inputValue, format);
    if (parsed) {
      commitColor(parsed);
    } else {
      setInputValue(formatValue(color, format));
    }
  };

  const cycleFormat = () => {
    setFormat((f) => (f === 'hex' ? 'rgb' : 'hex'));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {wpNumber !== undefined ? (
          <button
            className={cn(
              'inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold transition-all text-white',
              'hover:ring-2 hover:ring-primary/30 hover:scale-105',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
            style={{ backgroundColor: color }}
            disabled={disabled}
          >
            WP{wpNumber}
          </button>
        ) : (
          <Button variant="outline" size="icon" className="h-8 w-8 p-0" disabled={disabled}>
            <div className="h-5 w-5 rounded-sm border" style={{ backgroundColor: color }} />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-3" align="end">
        <div className="space-y-3">
          <div className="text-sm font-medium">{label ?? 'Select colour'}</div>

          {/* Default palette (fixed order) */}
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
              Default palette
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {palette.map((paletteColor, index) => {
                const norm = normaliseHex(paletteColor) ?? paletteColor.toUpperCase();
                const isSelected = (normaliseHex(color) ?? color.toUpperCase()) === norm;
                return (
                  <button
                    key={`${paletteColor}-${index}`}
                    className={cn(
                      'h-7 w-7 rounded-md border-2 transition-all hover:scale-110',
                      isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-transparent'
                    )}
                    style={{ backgroundColor: paletteColor }}
                    onClick={() => handleSelectSwatch(paletteColor)}
                    aria-label={`Select ${paletteColor}`}
                  />
                );
              })}
            </div>
          </div>

          {/* In-proposal colours */}
          {dedupedExtras.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
                In this proposal
              </div>
              <div className="grid grid-cols-6 gap-1.5">
                {dedupedExtras.map((c, index) => {
                  const isSelected = (normaliseHex(color) ?? color.toUpperCase()) === c;
                  return (
                    <button
                      key={`${c}-${index}`}
                      className={cn(
                        'h-7 w-7 rounded-md border-2 transition-all hover:scale-110',
                        isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-transparent'
                      )}
                      style={{ backgroundColor: c }}
                      onClick={() => handleSelectSwatch(c)}
                      aria-label={`Select ${c}`}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Free colour value input with HEX/RGB cycle */}
          <div className="flex items-center gap-2">
            <div
              className="h-8 w-8 rounded-md border flex-shrink-0"
              style={{ backgroundColor: color }}
            />
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onBlur={handleInputBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleInputBlur();
                }
              }}
              placeholder={format === 'hex' ? '#000000' : 'rgb(0, 0, 0)'}
              className="h-8 font-mono text-xs"
            />
            <button
              type="button"
              onClick={cycleFormat}
              className="h-8 px-2 rounded-md border text-[11px] font-mono uppercase text-muted-foreground hover:bg-muted transition-colors"
              title="Cycle colour format"
            >
              {format}
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Inline color swatch for display
interface WPColorSwatchProps {
  color: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function WPColorSwatch({ color, size = 'md', className }: WPColorSwatchProps) {
  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  return (
    <div
      className={cn('rounded-sm border', sizeClasses[size], className)}
      style={{ backgroundColor: color }}
    />
  );
}
