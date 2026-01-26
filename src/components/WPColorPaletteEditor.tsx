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
import { Label } from '@/components/ui/label';
import { Palette, RotateCcw } from 'lucide-react';
import { DEFAULT_WP_COLORS, getContrastingTextColor } from '@/lib/wpColors';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface WPColorPaletteEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  colors: string[];
  onSave: (colors: string[]) => Promise<boolean>;
}

export function WPColorPaletteEditor({
  open,
  onOpenChange,
  colors,
  onSave,
}: WPColorPaletteEditorProps) {
  const [editedColors, setEditedColors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Initialize with current colors when dialog opens
  useEffect(() => {
    if (open) {
      // Ensure we always have 12 colors
      const palette = [...colors];
      while (palette.length < 12) {
        palette.push(DEFAULT_WP_COLORS[palette.length % DEFAULT_WP_COLORS.length]);
      }
      setEditedColors(palette.slice(0, 12));
    }
  }, [open, colors]);

  const handleColorChange = (index: number, value: string) => {
    const newColors = [...editedColors];
    newColors[index] = value;
    setEditedColors(newColors);
  };

  const handleReset = () => {
    setEditedColors([...DEFAULT_WP_COLORS]);
  };

  const handleSave = async () => {
    // Validate all colors are valid hex
    const isValid = editedColors.every((c) => /^#[0-9A-Fa-f]{6}$/.test(c));
    if (!isValid) {
      toast.error('All colors must be valid hex codes (e.g., #2563EB)');
      return;
    }

    setSaving(true);
    const success = await onSave(editedColors);
    setSaving(false);

    if (success) {
      toast.success('Color palette updated');
      onOpenChange(false);
    }
  };

  const colorNames = [
    'WP1 Color',
    'WP2 Color',
    'WP3 Color',
    'WP4 Color',
    'WP5 Color',
    'WP6 Color',
    'WP7 Color',
    'WP8 Color',
    'WP9 Color',
    'WP10 Color',
    'WP11 Color',
    'WP12 Color',
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5" />
            Edit WP Color Palette
          </DialogTitle>
          <DialogDescription>
            Customize the colors used for work packages. Changes apply to all WPs in this proposal.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-4">
          {editedColors.map((color, index) => (
            <div key={index} className="flex items-center gap-2">
              <div
                className={cn(
                  "w-8 h-8 rounded-md border flex items-center justify-center text-xs font-bold flex-shrink-0"
                )}
                style={{
                  backgroundColor: color,
                  color: getContrastingTextColor(color),
                }}
              >
                {index + 1}
              </div>
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">
                  {colorNames[index]}
                </Label>
                <Input
                  value={color}
                  onChange={(e) => handleColorChange(index, e.target.value)}
                  placeholder="#000000"
                  className="h-8 font-mono text-sm"
                />
              </div>
              <input
                type="color"
                value={color}
                onChange={(e) => handleColorChange(index, e.target.value)}
                className="w-8 h-8 rounded border cursor-pointer"
                style={{ padding: 0 }}
              />
            </div>
          ))}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={handleReset}>
            <RotateCcw className="w-4 h-4 mr-1" />
            Reset to Default
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Palette'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
