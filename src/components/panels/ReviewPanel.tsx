import { GitCompare } from 'lucide-react';
import type { TrackChange } from '@/extensions/TrackChanges';
import { formatDateTime } from '@/lib/formatDate';

/**
 * THE REVIEW PANEL — SHELL ONLY
 *
 * Scope is deliberately narrow and different from the comments panel: this
 * panel shows the tracked changes of the ONE field the caret is in, never the
 * page. With no field active it stays open and says so.
 *
 * Accepting and rejecting is the next piece of work; the list below is
 * read-only.
 */
export function ReviewPanelBody({
  hasActiveField,
  changes,
}: {
  hasActiveField: boolean;
  changes: TrackChange[];
}) {
  if (!hasActiveField) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <GitCompare className="h-5 w-5 text-muted-foreground" />
        <p className="text-[12px] text-muted-foreground">
          Click in a field to review its tracked changes.
        </p>
      </div>
    );
  }

  if (changes.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-[12px] text-muted-foreground">
          This field has no tracked changes.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      <ul className="space-y-1.5">
        {changes.map((c) => (
          <li
            key={`${c.id}-${c.from}`}
            className="rounded-md border border-border bg-card p-2 text-[12px] shadow-sm"
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span
                className={
                  c.type === 'insertion'
                    ? 'text-[11px] font-semibold text-emerald-600'
                    : 'text-[11px] font-semibold text-destructive'
                }
              >
                {c.type === 'insertion' ? 'Inserted' : 'Deleted'}
              </span>
              <span className="truncate text-[10px] text-muted-foreground">
                {c.authorName} · {formatDateTime(c.timestamp)}
              </span>
            </div>
            <p
              className={
                c.type === 'deletion'
                  ? 'line-clamp-4 whitespace-pre-wrap text-muted-foreground line-through'
                  : 'line-clamp-4 whitespace-pre-wrap underline decoration-emerald-500'
              }
            >
              {c.content?.trim() || '—'}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
