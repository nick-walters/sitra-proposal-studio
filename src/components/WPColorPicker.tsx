import { useState, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';
import { DEFAULT_WP_COLORS, getContrastingTextColor } from '@/lib/wpColors';
import { useProposalCustomColors } from '@/hooks/useProposalCustomColors';
import { cn } from '@/lib/utils';

// ---------- Format helpers (canonical storage is always hex) ----------

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

function normaliseHex(v: string): string | null {
  const m = v.trim().match(HEX_RE);
  return m ? `#${m[1].toUpperCase()}` : null;
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
  /**
   * Proposal id. When set, the picker auto-persists any custom (non-palette)
   * hex the user picks into proposals.custom_colors, and merges them into the
   * "in this proposal" section. Delete affordance also becomes available.
   */
  proposalId?: string | null;
  /**
   * Whether the user is allowed to delete custom colours. Coordinator+ only.
   * Defaults to !disabled.
   */
  canManageCustom?: boolean;
  /** If set, renders a filled WP-number pill trigger; otherwise a bordered swatch button. */
  wpNumber?: number;
  /** Optional label shown above the palette. */
  label?: string;
  /** Custom trigger element (e.g. toolbar icon button). Replaces the default swatch/pill trigger. */
  trigger?: React.ReactNode;
  /** Optional "remove colour" action rendered in the popover footer. */
  onRemove?: () => void;
  /** Label for the remove-colour button. */
  removeLabel?: string;
  /**
   * Palette colours to hide from the displayed swatches (display-only exclusion).
   * The colour is still valid if entered as hex or present as an in-proposal
   * colour. Used e.g. to hide black from WP/theme pickers.
   */
  excludePaletteColors?: string[];
  /** Notified when the popover opens/closes (for parent focus retention). */
  onOpenChange?: (open: boolean) => void;
}

export function WPColorPicker({
  color,
  onChange,
  disabled = false,
  palette = DEFAULT_WP_COLORS,
  extraColors = [],
  proposalId = null,
  canManageCustom,
  wpNumber,
  label,
  trigger,
  onRemove,
  removeLabel = 'Remove colour',
  excludePaletteColors,
  onOpenChange,
}: WPColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(() => normaliseHex(color) ?? color.toUpperCase());

  const {
    customColors,
    addCustomColor,
    removeCustomColor,
    isColorInUse,
  } = useProposalCustomColors(proposalId);

  const allowDelete = (canManageCustom ?? !disabled) && !!proposalId;

  useEffect(() => {
    setInputValue(normaliseHex(color) ?? color.toUpperCase());
  }, [color]);

  const excludeSet = new Set((excludePaletteColors ?? []).map((c) => c.toUpperCase()));
  const displayedPalette = palette.filter((c) => !excludeSet.has((normaliseHex(c) ?? c).toUpperCase()));

  // Union of caller-supplied extras + persisted custom colours, deduped and
  // excluded from the default palette.
  const paletteSet = new Set(palette.map((c) => c.toUpperCase()));
  const dedupedExtras = Array.from(
    new Set(
      [...extraColors, ...customColors]
        .map((c) => normaliseHex(c) ?? c.toUpperCase())
        .filter((c) => HEX_RE.test(c) && !paletteSet.has(c))
    )
  );

  const commitColor = (newHex: string) => {
    onChange(newHex);
    setInputValue(newHex.toUpperCase());
    // Auto-add non-palette picks to proposals.custom_colors.
    if (proposalId && !paletteSet.has(newHex.toUpperCase())) {
      void addCustomColor(newHex);
    }
  };

  const handleSelectSwatch = (paletteColor: string) => {
    const hex = normaliseHex(paletteColor) ?? paletteColor;
    commitColor(hex);
    handleOpenChange(false);
  };

  const handleInputBlur = () => {
    const parsed = normaliseHex(inputValue);
    if (parsed) {
      commitColor(parsed);
    } else {
      setInputValue(normaliseHex(color) ?? color.toUpperCase());
    }
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };


  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ? (
          trigger
        ) : wpNumber !== undefined ? (
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

          {/* Sitra's colour palette (fixed order, no delete) */}
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
              Sitra&apos;s colour palette
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

          {/* In-proposal colours (union of extras + saved custom) */}
          {dedupedExtras.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
                In this proposal
              </div>
              <div className="grid grid-cols-6 gap-1.5">
                {dedupedExtras.map((c, index) => {
                  const isSelected = (normaliseHex(color) ?? color.toUpperCase()) === c;
                  const inUse = isColorInUse(c);
                  const showDelete = allowDelete && !inUse;
                  const iconColor = getContrastingTextColor(c);
                  return (
                    <div key={`${c}-${index}`} className="relative">
                      <button
                        className={cn(
                          'h-7 w-7 rounded-md border-2 transition-all hover:scale-110',
                          isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-transparent'
                        )}
                        style={{ backgroundColor: c }}
                        onClick={() => handleSelectSwatch(c)}
                        aria-label={`Select ${c}`}
                      />
                      {showDelete && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void removeCustomColor(c);
                          }}
                          className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
                          style={{ backgroundColor: c }}
                          title={`Remove ${c}`}
                          aria-label={`Remove ${c}`}
                        >
                          <X className="h-2.5 w-2.5" style={{ color: iconColor }} strokeWidth={3} />
                        </button>
                      )}
                    </div>
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

          {onRemove && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs"
              onClick={() => {
                onRemove();
                setOpen(false);
              }}
            >
              {removeLabel}
            </Button>
          )}
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
