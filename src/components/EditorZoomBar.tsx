import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface EditorZoomBarProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
}

const ZOOM_STEPS = [50, 75, 100, 125, 150, 175, 200];

export function EditorZoomBar({ zoom, onZoomChange }: EditorZoomBarProps) {
  const decrease = () => {
    const idx = ZOOM_STEPS.findIndex((s) => s >= zoom);
    const prev = ZOOM_STEPS[Math.max(0, (idx > 0 ? idx : 1) - 1)];
    onZoomChange(prev);
  };

  const increase = () => {
    const idx = ZOOM_STEPS.findIndex((s) => s >= zoom);
    const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, idx + 1)];
    onZoomChange(next);
  };

  return (
    <div className="h-7 border-t border-border bg-card flex items-center justify-end px-3 gap-2 shrink-0">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            onClick={decrease}
            disabled={zoom <= ZOOM_STEPS[0]}
          >
            <Minus className="w-3 h-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Zoom out</TooltipContent>
      </Tooltip>

      <Slider
        value={[zoom]}
        min={50}
        max={200}
        step={25}
        onValueChange={([v]) => onZoomChange(v)}
        className="w-24"
      />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            onClick={increase}
            disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
          >
            <Plus className="w-3 h-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Zoom in</TooltipContent>
      </Tooltip>

      <button
        className="text-[10px] text-muted-foreground hover:text-foreground w-8 text-center tabular-nums cursor-pointer"
        onClick={() => onZoomChange(100)}
        title="Reset zoom"
      >
        {zoom}%
      </button>
    </div>
  );
}
