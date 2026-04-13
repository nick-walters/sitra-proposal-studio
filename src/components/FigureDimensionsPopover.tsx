import { useState, useEffect, useCallback, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Lock, Unlock } from 'lucide-react';

// 1 cm = 37.7953 px at 96 DPI
const PX_PER_CM = 37.7953;

interface FigureDimensionsPanelProps {
  width: number | string;
  height: number | string;
  widthPercent: number;
  aspectRatioLocked: boolean;
  onWidthChange: (value: string) => void;
  onHeightChange: (value: string) => void;
  onWidthPercentChange: (value: string) => void;
  onAspectRatioToggle: () => void;
}

export function FigureDimensionsPanel({
  width,
  height,
  widthPercent,
  aspectRatioLocked,
  onWidthChange,
  onHeightChange,
  onWidthPercentChange,
  onAspectRatioToggle,
}: FigureDimensionsPanelProps) {
  const [tab, setTab] = useState<'cm' | 'px' | 'percent'>('cm');

  const pxW = typeof width === 'string' ? parseInt(width, 10) : (width || 0);
  const pxH = typeof height === 'string' ? parseInt(height, 10) : (height || 0);

  const [cmWidth, setCmWidth] = useState('');
  const [cmHeight, setCmHeight] = useState('');
  const [localAspectLocked, setLocalAspectLocked] = useState(aspectRatioLocked);
  const [cmAspectRatio, setCmAspectRatio] = useState(1);

  // Sync from props
  useEffect(() => {
    const w = pxW > 0 ? (pxW / PX_PER_CM).toFixed(1) : '';
    const h = pxH > 0 ? (pxH / PX_PER_CM).toFixed(1) : '';
    setCmWidth(w);
    setCmHeight(h);
    setLocalAspectLocked(aspectRatioLocked);
    if (pxW > 0 && pxH > 0) {
      setCmAspectRatio(pxW / pxH);
    }
  }, [pxW, pxH, aspectRatioLocked]);

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
    <div className="flex items-center gap-1.5">
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex items-center gap-1">
        <TabsList className="h-7 p-0.5 gap-0">
          <TabsTrigger value="cm" className="text-[10px] h-6 px-1.5">cm</TabsTrigger>
          <TabsTrigger value="px" className="text-[10px] h-6 px-1.5">px</TabsTrigger>
          <TabsTrigger value="percent" className="text-[10px] h-6 px-1.5">%</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'cm' && (
        <div className="flex items-center gap-1">
          <Input
            type="number"
            step="0.1"
            min="0.1"
            value={cmWidth}
            onChange={(e) => handleCmWidthChange(e.target.value)}
            className="w-[74px] h-7 text-xs"
            title="Width (cm)"
          />
          <span className="text-[10px] text-muted-foreground">×</span>
          <Input
            type="number"
            step="0.1"
            min="0.1"
            value={cmHeight}
            onChange={(e) => handleCmHeightChange(e.target.value)}
            className="w-[74px] h-7 text-xs"
            title="Height (cm)"
          />
          <span className="text-[10px] text-muted-foreground">cm</span>
        </div>
      )}

      {tab === 'px' && (
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min="50"
            value={pxW > 0 ? pxW.toString() : ''}
            onChange={(e) => onWidthChange(e.target.value)}
            className="w-[74px] h-7 text-xs"
            title="Width (px)"
          />
          <span className="text-[10px] text-muted-foreground">×</span>
          <Input
            type="number"
            min="50"
            value={pxH > 0 ? pxH.toString() : ''}
            onChange={(e) => onHeightChange(e.target.value)}
            className="w-[74px] h-7 text-xs"
            title="Height (px)"
          />
          <span className="text-[10px] text-muted-foreground">px</span>
        </div>
      )}

      {tab === 'percent' && (
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min="1"
            max="100"
            value={widthPercent > 0 ? widthPercent.toString() : '100'}
            onChange={(e) => onWidthPercentChange(e.target.value)}
            className="w-[74px] h-7 text-xs"
            title="Width (%)"
          />
          <span className="text-[10px] text-muted-foreground">%</span>
        </div>
      )}

      <button
        type="button"
        className="p-1 rounded hover:bg-muted"
        onClick={handleAspectToggle}
        title={localAspectLocked ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
      >
        {localAspectLocked ? (
          <Lock className="w-3.5 h-3.5 text-primary" />
        ) : (
          <Unlock className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}

// Keep backward-compatible export name
export const FigureDimensionsPopover = FigureDimensionsPanel;
