import { useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { DEFAULT_WP_COLORS, GREYSCALE_COLORS, getContrastingTextColor } from '@/lib/wpColors';
import { useProposalCustomColors } from '@/hooks/useProposalCustomColors';
import { OUTLINE_WIDTH_PRESETS } from '@/lib/impactCanvasBoundStyle';

interface Props {
  color: string;                // current outline colour (hex or 'none')
  width: number;                // current outline width in pt
  onColorChange: (hex: string) => void; // hex or 'none'
  onWidthChange: (pt: number) => void;
  proposalId?: string | null;
  disabled?: boolean;
}

/**
 * MS-Office-style outline picker: single button opens a dropdown containing
 * the shared Sitra palette + "In this proposal" custom colours + "No outline"
 * FIRST, and predefined line-weight PRESETS BELOW.
 *
 * Reuses proposals.custom_colors via useProposalCustomColors so custom hexes
 * picked here appear across the platform's shared palette pickers.
 */
export function ImpactCanvasOutlinePicker({
  color,
  width,
  onColorChange,
  onWidthChange,
  proposalId,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const { customColors, addCustomColor } = useProposalCustomColors(proposalId ?? null);

  const isNone = color === 'none' || width === 0;
  const indicatorColor = isNone ? 'transparent' : color;

  const paletteSet = useMemo(
    () =>
      new Set([
        ...DEFAULT_WP_COLORS.map((c) => c.toUpperCase()),
        ...GREYSCALE_COLORS.map((c) => c.toUpperCase()),
      ]),
    [],
  );

  const extras = useMemo(
    () =>
      Array.from(
        new Set(
          customColors
            .map((c) => c.toUpperCase())
            .filter((c) => /^#[0-9A-F]{6}$/.test(c) && !paletteSet.has(c)),
        ),
      ),
    [customColors, paletteSet],
  );

  const commitColor = (hex: string) => {
    onColorChange(hex);
    if (proposalId && hex !== 'none' && !paletteSet.has(hex.toUpperCase())) {
      void addCustomColor(hex);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'inline-flex flex-col items-center justify-center h-7 w-8 rounded-md bg-transparent hover:bg-accent transition-colors',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
          title="Outline"
          aria-label="Outline colour and width"
          data-impact-canvas-toolbar
        >
          {/* icon: three horizontal lines of ascending thickness */}
          <div className="flex flex-col gap-[2px] items-center leading-none">
            <div style={{ height: 1, width: 14, background: '#333' }} />
            <div style={{ height: 2, width: 14, background: '#333' }} />
            <div style={{ height: 3, width: 14, background: '#333' }} />
          </div>
          <div
            className="mt-[2px] rounded-sm"
            style={{
              height: 3,
              width: 16,
              background: indicatorColor,
              boxShadow: isNone ? 'inset 0 0 0 1px rgba(0,0,0,0.4)' : undefined,
              backgroundImage: isNone
                ? 'linear-gradient(to top right, transparent 45%, #E11D48 45%, #E11D48 55%, transparent 55%)'
                : undefined,
            }}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-3" align="end">
        <div className="space-y-3">
          {/* Palette first */}
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
              Sitra&apos;s colour palette
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {DEFAULT_WP_COLORS.map((c) => {
                const norm = c.toUpperCase();
                const isSelected = !isNone && color.toUpperCase() === norm;
                return (
                  <button
                    key={c}
                    className={cn(
                      'h-7 w-7 rounded-md border-2 transition-all hover:scale-110',
                      isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-transparent',
                    )}
                    style={{
                      backgroundColor: c,
                      boxShadow:
                        !isSelected
                          ? 'inset 0 0 0 1px rgba(0,0,0,0.2)'
                          : undefined,
                    }}
                    onClick={() => {
                      commitColor(c);
                    }}
                    aria-label={`Select ${c}`}
                  />
                );
              })}
            </div>
          </div>

          {/* Greyscale section (canvas picker) */}
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
              Greyscale
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {GREYSCALE_COLORS.map((g) => {
                const norm = g.toUpperCase();
                const isSelected = !isNone && color.toUpperCase() === norm;
                return (
                  <button
                    key={g}
                    className={cn(
                      'h-7 w-7 rounded-md border-2 transition-all hover:scale-110',
                      isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-transparent',
                    )}
                    style={{
                      backgroundColor: g,
                      boxShadow:
                        !isSelected
                          ? 'inset 0 0 0 1px rgba(0,0,0,0.2)'
                          : undefined,
                    }}
                    onClick={() => commitColor(g)}
                    aria-label={`Select ${g}`}
                  />
                );
              })}
            </div>
          </div>



          {extras.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
                In this proposal
              </div>
              <div className="grid grid-cols-6 gap-1.5">
                {extras.map((c) => {
                  const isSelected = !isNone && color.toUpperCase() === c;
                  return (
                    <button
                      key={c}
                      className={cn(
                        'h-7 w-7 rounded-md border-2 transition-all hover:scale-110',
                        isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-transparent',
                      )}
                      style={{
                        backgroundColor: c,
                        boxShadow:
                          !isSelected
                            ? 'inset 0 0 0 1px rgba(0,0,0,0.2)'
                            : undefined,
                      }}
                      onClick={() => commitColor(c)}
                      aria-label={`Select ${c}`}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* No outline */}
          <button
            type="button"
            className={cn(
              'w-full flex items-center gap-2 px-2 py-1.5 rounded-md border text-xs hover:bg-accent',
              isNone && 'border-primary bg-accent',
            )}
            onClick={() => {
              onColorChange('none');
            }}
          >
            <div
              className="h-4 w-6 rounded-sm bg-white"
              style={{
                boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.3)',
                backgroundImage:
                  'linear-gradient(to top right, transparent 45%, #E11D48 45%, #E11D48 55%, transparent 55%)',
              }}
            />
            No outline
          </button>

          {/* Widths below */}
          <div className="pt-2 border-t">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
              Weight
            </div>
            <div className="flex flex-col">
              {OUTLINE_WIDTH_PRESETS.map((p) => {
                const active = !isNone && Math.abs(width - p.value) < 0.001;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => {
                      onWidthChange(p.value);
                      // Restoring a real weight also clears "no outline"
                      if (color === 'none') onColorChange('#000000');
                    }}
                    className={cn(
                      'flex items-center gap-3 px-2 py-1 rounded-sm text-xs text-left hover:bg-accent',
                      active && 'bg-accent',
                    )}
                  >
                    <div
                      style={{
                        width: 60,
                        height: Math.max(1, p.value * (4 / 3)), // pt→px preview
                        background: '#111',
                      }}
                    />
                    <span className="text-muted-foreground">{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
