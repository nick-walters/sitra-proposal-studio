import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  const [pxWLocal, setPxWLocal] = useState('');
  const [pxHLocal, setPxHLocal] = useState('');
  const [percentLocal, setPercentLocal] = useState('');
  const [cmFocused, setCmFocused] = useState<'w' | 'h' | null>(null);
  const [pxFocused, setPxFocused] = useState<'w' | 'h' | null>(null);
  const [percentFocused, setPercentFocused] = useState(false);

  // Sync from props only when not focused
  useEffect(() => {
    if (!cmFocused) {
      setCmWidth(pxW > 0 ? (pxW / PX_PER_CM).toFixed(1) : '');
      setCmHeight(pxH > 0 ? (pxH / PX_PER_CM).toFixed(1) : '');
    }
    if (!pxFocused) {
      setPxWLocal(pxW > 0 ? pxW.toString() : '');
      setPxHLocal(pxH > 0 ? pxH.toString() : '');
    }
    if (!percentFocused) {
      setPercentLocal(widthPercent > 0 ? widthPercent.toString() : '100');
    }
    setLocalAspectLocked(aspectRatioLocked);
    if (pxW > 0 && pxH > 0) {
      setCmAspectRatio(pxW / pxH);
    }
  }, [pxW, pxH, aspectRatioLocked, widthPercent]);

  const commitCmWidth = useCallback(() => {
    setCmFocused(null);
    const num = parseFloat(cmWidth);
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
  }, [cmWidth, localAspectLocked, cmAspectRatio, onWidthChange, onHeightChange]);

  const commitCmHeight = useCallback(() => {
    setCmFocused(null);
    const num = parseFloat(cmHeight);
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
  }, [cmHeight, localAspectLocked, cmAspectRatio, onWidthChange, onHeightChange]);

  const commitPxW = useCallback(() => {
    setPxFocused(null);
    if (pxWLocal) onWidthChange(pxWLocal);
  }, [pxWLocal, onWidthChange]);

  const commitPxH = useCallback(() => {
    setPxFocused(null);
    if (pxHLocal) onHeightChange(pxHLocal);
  }, [pxHLocal, onHeightChange]);

  const commitPercent = useCallback(() => {
    setPercentFocused(false);
    if (percentLocal) onWidthPercentChange(percentLocal);
  }, [percentLocal, onWidthPercentChange]);

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
            onFocus={() => setCmFocused('w')}
            onChange={(e) => setCmWidth(e.target.value)}
            onBlur={commitCmWidth}
            className="w-[74px] h-7 text-xs"
            title="Width (cm)"
          />
          <span className="text-[10px] text-muted-foreground">×</span>
          <Input
            type="number"
            step="0.1"
            min="0.1"
            value={cmHeight}
            onFocus={() => setCmFocused('h')}
            onChange={(e) => setCmHeight(e.target.value)}
            onBlur={commitCmHeight}
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
            value={pxWLocal}
            onFocus={() => setPxFocused('w')}
            onChange={(e) => setPxWLocal(e.target.value)}
            onBlur={commitPxW}
            className="w-[74px] h-7 text-xs"
            title="Width (px)"
          />
          <span className="text-[10px] text-muted-foreground">×</span>
          <Input
            type="number"
            min="50"
            value={pxHLocal}
            onFocus={() => setPxFocused('h')}
            onChange={(e) => setPxHLocal(e.target.value)}
            onBlur={commitPxH}
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
            value={percentLocal}
            onFocus={() => setPercentFocused(true)}
            onChange={(e) => setPercentLocal(e.target.value)}
            onBlur={commitPercent}
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
