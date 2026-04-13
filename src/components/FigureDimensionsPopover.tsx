import { useState, useEffect, useCallback } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Ruler, Lock, Unlock, Percent } from 'lucide-react';

// 1 cm = 37.7953 px at 96 DPI
const PX_PER_CM = 37.7953;

interface FigureDimensionsPopoverProps {
  width: number | string;
  height: number | string;
  widthPercent: number;
  aspectRatioLocked: boolean;
  onWidthChange: (value: string) => void;
  onHeightChange: (value: string) => void;
  onWidthPercentChange: (value: string) => void;
  onAspectRatioToggle: () => void;
}

export function FigureDimensionsPopover({
  width,
  height,
  widthPercent,
  aspectRatioLocked,
  onWidthChange,
  onHeightChange,
  onWidthPercentChange,
  onAspectRatioToggle,
}: FigureDimensionsPopoverProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'cm' | 'px' | 'percent'>('cm');

  const pxW = typeof width === 'string' ? parseInt(width, 10) : (width || 0);
  const pxH = typeof height === 'string' ? parseInt(height, 10) : (height || 0);

  const [cmWidth, setCmWidth] = useState('');
  const [cmHeight, setCmHeight] = useState('');
  const [localAspectLocked, setLocalAspectLocked] = useState(aspectRatioLocked);
  const [cmAspectRatio, setCmAspectRatio] = useState(1);

  // Sync from props when popover opens
  useEffect(() => {
    if (open) {
      const w = pxW > 0 ? (pxW / PX_PER_CM).toFixed(1) : '';
      const h = pxH > 0 ? (pxH / PX_PER_CM).toFixed(1) : '';
      setCmWidth(w);
      setCmHeight(h);
      setLocalAspectLocked(aspectRatioLocked);
      if (pxW > 0 && pxH > 0) {
        setCmAspectRatio(pxW / pxH);
      }
      // Determine initial tab
      if (widthPercent > 0) {
        setTab('percent');
      } else if (pxW > 0) {
        setTab('cm');
      } else {
        setTab('cm');
      }
    }
  }, [open, pxW, pxH, widthPercent, aspectRatioLocked]);

  const handleCmWidthChange = useCallback((value: string) => {
    setCmWidth(value);
    const num = parseFloat(value);
    if (!isNaN(num) && num > 0) {
      const newPxW = Math.round(num * PX_PER_CM);
      if (localAspectLocked && cmAspectRatio > 0) {
        const newPxH = Math.round(newPxW / cmAspectRatio);
        setCmHeight((newPxH / PX_PER_CM).toFixed(1));
        onWidthChange(newPxW.toString());
        onHeightChange(newPxH.toString());
      } else {
        onWidthChange(newPxW.toString());
      }
    }
  }, [localAspectLocked, cmAspectRatio, onWidthChange, onHeightChange]);

  const handleCmHeightChange = useCallback((value: string) => {
    setCmHeight(value);
    const num = parseFloat(value);
    if (!isNaN(num) && num > 0) {
      const newPxH = Math.round(num * PX_PER_CM);
      if (localAspectLocked && cmAspectRatio > 0) {
        const newPxW = Math.round(newPxH * cmAspectRatio);
        setCmWidth((newPxW / PX_PER_CM).toFixed(1));
        onWidthChange(newPxW.toString());
        onHeightChange(newPxH.toString());
      } else {
        onHeightChange(newPxH.toString());
      }
    }
  }, [localAspectLocked, cmAspectRatio, onWidthChange, onHeightChange]);

  const handleAspectToggle = useCallback(() => {
    setLocalAspectLocked(!localAspectLocked);
    onAspectRatioToggle();
  }, [localAspectLocked, onAspectRatioToggle]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 gap-1" title="Figure dimensions">
          <Ruler className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Figure Dimensions</h4>

          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="grid w-full grid-cols-3 h-8">
              <TabsTrigger value="cm" className="text-xs h-7">cm</TabsTrigger>
              <TabsTrigger value="px" className="text-xs h-7">px</TabsTrigger>
              <TabsTrigger value="percent" className="text-xs h-7">%</TabsTrigger>
            </TabsList>

            <TabsContent value="cm" className="mt-3 space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Width (cm)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={cmWidth}
                    onChange={(e) => handleCmWidthChange(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <button
                  type="button"
                  className="mt-5 p-1 rounded hover:bg-muted"
                  onClick={handleAspectToggle}
                  title={localAspectLocked ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
                >
                  {localAspectLocked ? (
                    <Lock className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <Unlock className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </button>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Height (cm)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={cmHeight}
                    onChange={(e) => handleCmHeightChange(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="aspect-cm"
                  checked={localAspectLocked}
                  onCheckedChange={handleAspectToggle}
                />
                <Label htmlFor="aspect-cm" className="text-xs text-muted-foreground cursor-pointer">
                  Lock aspect ratio
                </Label>
              </div>
            </TabsContent>

            <TabsContent value="px" className="mt-3 space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Width (px)</Label>
                  <Input
                    type="number"
                    min="50"
                    value={pxW > 0 ? pxW.toString() : ''}
                    onChange={(e) => onWidthChange(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <button
                  type="button"
                  className="mt-5 p-1 rounded hover:bg-muted"
                  onClick={handleAspectToggle}
                  title={localAspectLocked ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
                >
                  {localAspectLocked ? (
                    <Lock className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <Unlock className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </button>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Height (px)</Label>
                  <Input
                    type="number"
                    min="50"
                    value={pxH > 0 ? pxH.toString() : ''}
                    onChange={(e) => onHeightChange(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="aspect-px"
                  checked={localAspectLocked}
                  onCheckedChange={handleAspectToggle}
                />
                <Label htmlFor="aspect-px" className="text-xs text-muted-foreground cursor-pointer">
                  Lock aspect ratio
                </Label>
              </div>
            </TabsContent>

            <TabsContent value="percent" className="mt-3 space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Width (%)</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={widthPercent > 0 ? widthPercent.toString() : '100'}
                  onChange={(e) => onWidthPercentChange(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Height adjusts automatically to maintain aspect ratio.
              </p>
            </TabsContent>
          </Tabs>

          <p className="text-[10px] text-muted-foreground">
            Page width ≈ 17.0 cm ({Math.round(17.0 * PX_PER_CM)} px)
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
