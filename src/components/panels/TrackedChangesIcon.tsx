/**
 * The tracked-changes glyph: two curved arrows passing one another.
 *
 * Inactive, the arrows carry their own meaning — the accepting arrow green,
 * the rejecting arrow red. Active (on a filled tab) both arrows follow
 * `currentColor`, so the icon reads white on the green fill.
 */
export function TrackedChangesIcon({
  className = 'h-4 w-4',
  mono = false,
}: {
  className?: string;
  mono?: boolean;
}) {
  const left = mono ? 'currentColor' : 'hsl(142 71% 35%)';
  const right = mono ? 'currentColor' : 'hsl(0 72% 51%)';
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g stroke={left}>
        <path d="M20 8h-9a4 4 0 0 0-4 4" />
        <path d="m10 5-3 3 3 3" />
      </g>
      <g stroke={right}>
        <path d="M4 16h9a4 4 0 0 0 4-4" />
        <path d="m14 19 3-3-3-3" />
      </g>
    </svg>
  );
}

export default TrackedChangesIcon;
