import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Palette, RotateCcw, Lock } from 'lucide-react';
import { WP_CONTENT_COLORS, WP_EXPLOITATION_COLOR, WP_COORDINATION_COLOR } from '@/lib/wpColors';
import { toast } from 'sonner';

interface WPColorPaletteEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  colors: string[];
  wpCount: number;
  onSave: (colors: string[]) => Promise<boolean>;
}

/**
 * Build the correct color array for a given WP count:
 * - Last WP = Coordination color (fixed)
 * - Penultimate WP = Exploitation color (fixed)
 * - Others = content colors in order
 */
function buildPaletteForCount(count: number, contentColors?: string[]): string[] {
  const content = contentColors || [...WP_CONTENT_COLORS];
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    if (count >= 2 && i === count - 1) {
      result.push(WP_COORDINATION_COLOR);
    } else if (count >= 2 && i === count - 2) {
      result.push(WP_EXPLOITATION_COLOR);
    } else {
      result.push(content[i % WP_CONTENT_COLORS.length] || WP_CONTENT_COLORS[i % WP_CONTENT_COLORS.length]);
    }
  }
  return result;
}

export function WPColorPaletteEditor({
  open,
  onOpenChange,
  colors,
  wpCount,
  onSave,
}: WPColorPaletteEditorProps) {
  const [editedColors, setEditedColors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const count = Math.max(1, wpCount);

  // Initialize with current colors when dialog opens, enforcing fixed last-two colors
  useEffect(() => {
    if (open) {
      // Use existing colors as content base, but enforce last-two positions
      const contentFromExisting = [...colors];
      const palette = buildPaletteForCount(count, contentFromExisting);
      setEditedColors(palette);
    }
  }, [open, colors, count]);

  const isFixedColor = (index: number): boolean => {
    if (count < 2) return false;
    return index === count - 1 || index === count - 2;
  };

  const getFixedLabel = (index: number): string | null => {
    if (count >= 2 && index === count - 1) return 'Coordination';
    if (count >= 2 && index === count - 2) return 'Exploitation';
    return null;
  };

  const handleColorChange = (index: number, value: string) => {
    if (isFixedColor(index)) return;
    const newColors = [...editedColors];
    newColors[index] = value;
    setEditedColors(newColors);
  };

  const handleReset = () => {
    setEditedColors(buildPaletteForCount(count));
  };

  const handleSave = async () => {
    const isValid = editedColors.every((c) => /^#[0-9A-Fa-f]{6}$/.test(c));
    if (!isValid) {
      toast.error('All colours must be valid hex codes (e.g., #2563EB)');
      return;
    }

    setSaving(true);
    const success = await onSave(editedColors);
    setSaving(false);

    if (success) {
      toast.success('Colour palette updated');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5" />
            Edit WP colour palette
          </DialogTitle>
          <DialogDescription>
            Customise the colours used for work packages. The last two WPs (Exploitation & Coordination) have fixed colours.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 py-4">
          {editedColors.map((color, index) => {
            const fixed = isFixedColor(index);
            const fixedLabel = getFixedLabel(index);
            return (
              <div key={index} className="flex items-center gap-2">
                <span
                  className="inline-flex items-center justify-center rounded-full px-2 flex-shrink-0"
                  style={{
                    backgroundColor: color,
                    color: '#ffffff',
                    height: '22px',
                    fontSize: '11pt',
                    fontWeight: 700,
                    minWidth: '42px',
                  }}
                >
                  WP{index + 1}
                </span>
                <Input
                  value={color}
                  onChange={(e) => handleColorChange(index, e.target.value)}
                  placeholder="#000000"
                  className="h-8 font-mono text-sm flex-1"
                  disabled={fixed}
                />
                {fixed ? (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground w-8 justify-center">
                    <Lock className="w-3.5 h-3.5" />
                  </div>
                ) : (
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => handleColorChange(index, e.target.value)}
                    className="w-8 h-8 rounded border cursor-pointer"
                    style={{ padding: 0 }}
                  />
                )}
                {fixedLabel && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{fixedLabel}</span>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={handleReset}>
            <RotateCcw className="w-4 h-4 mr-1" />
            Reset to default
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save palette'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
