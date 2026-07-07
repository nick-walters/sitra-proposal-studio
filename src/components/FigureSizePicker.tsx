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
}: FigureSizePickerProps) {
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
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value.presetId} onValueChange={handlePresetChange} disabled={disabled}>
        <SelectTrigger>
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
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-w`} className="text-xs">Width (cm)</Label>
            <Input
              id={`${idPrefix}-w`}
              type="number"
              min={FIGURE_CUSTOM_MIN_CM}
              max={FIGURE_CUSTOM_MAX_WIDTH_CM}
              step={0.1}
              disabled={disabled}
              value={value.widthCm}
              onChange={(e) => onChange({ ...value, presetId: 'custom', widthCm: Number(e.target.value) })}
              onBlur={(e) =>
                onChange({
                  ...value,
                  presetId: 'custom',
                  widthCm: clampFigureDim(Number(e.target.value), FIGURE_CUSTOM_MAX_WIDTH_CM),
                })
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-h`} className="text-xs">Height (cm)</Label>
            <Input
              id={`${idPrefix}-h`}
              type="number"
              min={FIGURE_CUSTOM_MIN_CM}
              max={FIGURE_CUSTOM_MAX_HEIGHT_CM}
              step={0.1}
              disabled={disabled}
              value={value.heightCm}
              onChange={(e) => onChange({ ...value, presetId: 'custom', heightCm: Number(e.target.value) })}
              onBlur={(e) =>
                onChange({
                  ...value,
                  presetId: 'custom',
                  heightCm: clampFigureDim(Number(e.target.value), FIGURE_CUSTOM_MAX_HEIGHT_CM),
                })
              }
            />
          </div>
        </div>
      )}
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
    </div>
  );
}
