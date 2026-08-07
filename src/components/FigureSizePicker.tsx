import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  FIGURE_SIZE_PRESETS,
  FIGURE_CUSTOM_MAX_WIDTH_CM,
  FIGURE_CUSTOM_MAX_HEIGHT_CM,
  FIGURE_CUSTOM_MIN_CM,
  clampFigureDim,
  type FigureSizePresetId,
} from '@/lib/figureSizePresets';

/**
 * Selected size — either one of the six presets (id + resolved cm) or a
 * user-supplied custom width/height in cm. The parent stores whatever is
 * returned onto the figure's `content` so downstream rendering
 * (preview / inline Part B / PDF / Word) can honour it.
 */
export interface FigureSizeValue {
  presetId: FigureSizePresetId | 'custom';
  widthCm: number;
  heightCm: number;
}

interface FigureSizePickerProps {
  value: FigureSizeValue;
  onChange: (v: FigureSizeValue) => void;
  disabled?: boolean;
  label?: string;
  helpText?: string;
  idPrefix?: string;
  /** Hide the "Size" label (compact inline usage where a heading already exists). */
  hideLabel?: boolean;
  /** Render the custom width/height inputs on one compact row. */
  inlineCustom?: boolean;
}

/** Shared UI for picking one of the six FIGURE_SIZE_PRESETS or a
 * Custom width × height (cm). Used by canvas creation and by uploaded /
 * AI image figures (post-creation size control). */
export function FigureSizePicker({
  value,
  onChange,
  disabled,
  label = 'Size',
  helpText,
  idPrefix = 'figure-size',
  hideLabel,
  inlineCustom,
}: FigureSizePickerProps) {
  // Free-text buffers so partial input ("18.", "", "0.") is typeable —
  // a directly-controlled numeric value would rewrite the field mid-keystroke.
  const [wText, setWText] = useState(String(value.widthCm));
  const [hText, setHText] = useState(String(value.heightCm));
  useEffect(() => {
    if (Number(wText) !== value.widthCm) setWText(String(value.widthCm));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.widthCm]);
  useEffect(() => {
    if (Number(hText) !== value.heightCm) setHText(String(value.heightCm));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.heightCm]);

  const handlePresetChange = (v: string) => {
    if (v === 'custom') {
      onChange({ presetId: 'custom', widthCm: value.widthCm, heightCm: value.heightCm });
      return;
    }
    const preset = FIGURE_SIZE_PRESETS.find((p) => p.id === v);
    if (!preset) return;
    onChange({ presetId: preset.id, widthCm: preset.widthCm, heightCm: preset.heightCm });
  };

  return (
    <div className={inlineCustom ? 'space-y-1.5' : 'space-y-2'}>
      {!hideLabel && <Label>{label}</Label>}
      <Select value={value.presetId} onValueChange={handlePresetChange} disabled={disabled}>
        <SelectTrigger className={inlineCustom ? 'h-8 text-xs' : undefined}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FIGURE_SIZE_PRESETS.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.label} — {p.widthCm} × {p.heightCm} cm
            </SelectItem>
          ))}
          <SelectItem value="custom">Custom…</SelectItem>
        </SelectContent>
      </Select>
      {value.presetId === 'custom' && (
        <div className={inlineCustom ? 'flex items-center gap-2' : 'grid grid-cols-2 gap-2 pt-1'}>
          <div className={inlineCustom ? 'flex items-center gap-1' : 'space-y-1'}>
            <Label htmlFor={`${idPrefix}-w`} className="text-xs">Width (cm)</Label>
            <Input
              id={`${idPrefix}-w`}
              type="number"
              min={FIGURE_CUSTOM_MIN_CM}
              max={FIGURE_CUSTOM_MAX_WIDTH_CM}
              step={0.1}
              disabled={disabled}
              className={inlineCustom ? 'h-8 w-20 text-xs' : undefined}
              value={wText}
              onChange={(e) => {
                setWText(e.target.value);
                const n = Number(e.target.value);
                if (e.target.value.trim() !== '' && Number.isFinite(n) && n > 0) {
                  onChange({ ...value, presetId: 'custom', widthCm: n });
                }
              }}
              onBlur={() => {
                const n = clampFigureDim(Number(wText), FIGURE_CUSTOM_MAX_WIDTH_CM);
                setWText(String(n));
                onChange({ ...value, presetId: 'custom', widthCm: n });
              }}
            />
          </div>
          <div className={inlineCustom ? 'flex items-center gap-1' : 'space-y-1'}>
            <Label htmlFor={`${idPrefix}-h`} className="text-xs">Height (cm)</Label>
            <Input
              id={`${idPrefix}-h`}
              type="number"
              min={FIGURE_CUSTOM_MIN_CM}
              max={FIGURE_CUSTOM_MAX_HEIGHT_CM}
              step={0.1}
              disabled={disabled}
              className={inlineCustom ? 'h-8 w-20 text-xs' : undefined}
              value={hText}
              onChange={(e) => {
                setHText(e.target.value);
                const n = Number(e.target.value);
                if (e.target.value.trim() !== '' && Number.isFinite(n) && n > 0) {
                  onChange({ ...value, presetId: 'custom', heightCm: n });
                }
              }}
              onBlur={() => {
                const n = clampFigureDim(Number(hText), FIGURE_CUSTOM_MAX_HEIGHT_CM);
                setHText(String(n));
                onChange({ ...value, presetId: 'custom', heightCm: n });
              }}
            />
          </div>
        </div>
      )}
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
    </div>
  );
}
