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
import { Palette, RotateCcw } from 'lucide-react';
import { DEFAULT_WP_COLORS } from '@/lib/wpColors';
import { toast } from 'sonner';

interface WPColorPaletteEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  colors: string[];
  wpCount: number;
  onSave: (colors: string[]) => Promise<boolean>;
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

  // Initialize with current colors when dialog opens
  useEffect(() => {
    if (open) {
      const palette = [...colors];
      while (palette.length < count) {
        palette.push(DEFAULT_WP_COLORS[palette.length % DEFAULT_WP_COLORS.length]);
      }
      setEditedColors(palette.slice(0, count));
    }
  }, [open, colors, count]);

  const handleColorChange = (index: number, value: string) => {
    const newColors = [...editedColors];
    newColors[index] = value;
    setEditedColors(newColors);
  };

  const handleReset = () => {
    const defaults = [...DEFAULT_WP_COLORS];
    while (defaults.length < count) {
      defaults.push(DEFAULT_WP_COLORS[defaults.length % DEFAULT_WP_COLORS.length]);
    }
    setEditedColors(defaults.slice(0, count));
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


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5" />
            Edit WP colour palette
          </DialogTitle>
          <DialogDescription>
            Customize the colors used for work packages. Changes apply to all WPs in this proposal.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 py-4">
          {editedColors.map((color, index) => (
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
              />
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
