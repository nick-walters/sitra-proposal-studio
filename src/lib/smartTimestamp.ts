import { formatDistanceToNow, format } from 'date-fns';

/**
 * Returns a human-friendly timestamp:
 * - Under 1 minute: "just now"
 * - Under 24 hours: "X mins ago", "X hours ago" (via date-fns)
 * - Older: "20th February 2026 at 14:30"
 */
export function smartTimestamp(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffMs < 60_000) return 'just now';

  if (diffHours < 24) {
    return formatDistanceToNow(date, { addSuffix: true });
  }

  const day = date.getDate();
  const suffix =
    day >= 11 && day <= 13
      ? 'th'
      : ([, 'st', 'nd', 'rd'][day % 10] || 'th');
  return `${day}${suffix} ${format(date, 'MMMM yyyy')} at ${format(date, 'HH:mm')}`;
}
