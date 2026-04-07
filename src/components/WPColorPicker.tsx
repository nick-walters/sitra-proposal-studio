import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Lock, LockOpen } from 'lucide-react';
import { DEFAULT_WP_COLORS, getContrastingTextColor } from '@/lib/wpColors';
import { cn } from '@/lib/utils';

interface WPColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  disabled?: boolean;
  palette?: string[];
  wpNumber?: number;
  colorLocked?: boolean;
  isCoordinator?: boolean;
  onToggleColorLock?: (locked: boolean) => void;
}

export function WPColorPicker({
  color,
  onChange,
  disabled = false,
  palette = DEFAULT_WP_COLORS,
  wpNumber,
  colorLocked = true,
  isCoordinator = false,
  onToggleColorLock,
}: WPColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [customColor, setCustomColor] = useState(color);
  const [unlocked, setUnlocked] = useState(false);

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setUnlocked(false); // Reset unlock state when closing
    }
  };

  const canChangeColor = !colorLocked || unlocked;

  const handleSelectColor = (newColor: string) => {
    if (!canChangeColor) return;
    onChange(newColor);
    setCustomColor(newColor);
    setUnlocked(false);
    setOpen(false);
  };

  const handleCustomColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value;
    setCustomColor(newColor);
  };

  const handleCustomColorBlur = () => {
    if (!canChangeColor) return;
    if (/^#[0-9A-Fa-f]{6}$/.test(customColor)) {
      onChange(customColor);
      setUnlocked(false);
    } else {
      setCustomColor(color);
    }
  };

  const handleUnlock = () => {
    if (isCoordinator) {
      setUnlocked(true);
      onToggleColorLock?.(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        {wpNumber !== undefined ? (
          <button
            className={cn(
              "inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold transition-all text-white",
              "hover:ring-2 hover:ring-primary/30 hover:scale-105",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            style={{ backgroundColor: color }}
            disabled={disabled}
          >
            WP{wpNumber}
          </button>
        ) : (
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 p-0"
            disabled={disabled}
          >
            <div
              className="h-5 w-5 rounded-sm border"
              style={{ backgroundColor: color }}
            />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-3" align="end">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Select colour</div>
            {/* Lock indicator */}
            {colorLocked && !unlocked ? (
              <button
                onClick={handleUnlock}
                className={cn(
                  "p-1 rounded transition-colors",
                  isCoordinator 
                    ? "hover:bg-muted cursor-pointer text-destructive" 
                    : "cursor-not-allowed text-destructive opacity-60"
                )}
                title={isCoordinator ? "Click to unlock colour editing" : "Only coordinators can unlock colour editing"}
              >
                <Lock className="w-4 h-4" />
              </button>
            ) : (
              <span className="p-1 text-green-500" title="Colour unlocked">
                <LockOpen className="w-4 h-4" />
              </span>
            )}
          </div>
          
          {/* Palette grid */}
          <div className={cn("grid grid-cols-6 gap-1.5", !canChangeColor && "opacity-50 pointer-events-none")}>
            {palette.map((paletteColor, index) => (
              <button
                key={index}
                className={cn(
                  "h-7 w-7 rounded-md border-2 transition-all hover:scale-110",
                  color === paletteColor ? "border-primary ring-2 ring-primary/20" : "border-transparent"
                )}
                style={{ backgroundColor: paletteColor }}
                onClick={() => handleSelectColor(paletteColor)}
                disabled={!canChangeColor}
              />
            ))}
          </div>

          {/* Custom color input */}
          <div className={cn("flex items-center gap-2", !canChangeColor && "opacity-50 pointer-events-none")}>
            <div
              className="h-8 w-8 rounded-md border flex-shrink-0"
              style={{ backgroundColor: customColor }}
            />
            <Input
              value={customColor}
              onChange={handleCustomColorChange}
              onBlur={handleCustomColorBlur}
              placeholder="#000000"
              className="h-8 font-mono text-sm"
              disabled={!canChangeColor}
            />
          </div>

          {colorLocked && !unlocked && (
            <p className="text-xs text-muted-foreground">
              {isCoordinator ? "Click the lock to edit this colour." : "This colour is locked by a coordinator."}
            </p>
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
      className={cn("rounded-sm border", sizeClasses[size], className)}
      style={{ backgroundColor: color }}
    />
  );
}
