import { GitCompareArrows } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The tracked-changes glyph — the original compare-arrows icon.
 *
 * One icon, two colourways: green on the white ground of the inactive tab and
 * of the panel's empty state, white on the green fill of the active tab.
 */
export function TrackedChangesIcon({
  className = 'h-4 w-4',
  mono = false,
}: {
  className?: string;
  /** `true` on the active (green) tab, where the glyph reads white. */
  mono?: boolean;
}) {
  return (
    <GitCompareArrows
      className={cn(className, mono ? 'text-white' : 'text-emerald-600')}
      strokeWidth={2}
      aria-hidden="true"
    />
  );
}

export default TrackedChangesIcon;
