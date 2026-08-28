import { useMemo, useState } from 'react';
import { Check, GitCompare, X } from 'lucide-react';
import type { Editor } from '@tiptap/core';
import { Button } from '@/components/ui/button';
import type { TrackChange } from '@/extensions/TrackChanges';
import { formatDateTime } from '@/lib/formatDate';
import { useAuth } from '@/hooks/useAuth';
import { useProposalRole } from '@/hooks/useProposalRole';
import {
  resolveChangeInEditor,
  resolveChangesInEditor,
  type ResolveAction,
} from '@/lib/trackChangeResolution';

/**
 * THE TRACKED CHANGES TAB
 *
 * Scope is deliberately narrow and different from the comments tab: this tab
 * shows the tracked changes of the ONE field the caret is in, never the page.
 * With no field active it stays open and says so.
 *
 * Accept and reject go through `trackChangeResolution`, the same path the
 * hover tooltip uses, so both routes behave identically and both write through
 * the field's versioned save.
 *
 * Permissions: coordinator and above may accept or reject anything; an author
 * may reject their own change (withdrawing an edit is not a review action).
 */
export function ReviewPanelBody({
  proposalId,
  hasActiveField,
  changes,
  editor,
}: {
  proposalId?: string;
  hasActiveField: boolean;
  changes: TrackChange[];
  editor: Editor | null;
}) {
  const { user } = useAuth();
  const { roleTier } = useProposalRole(proposalId);
  const [busy, setBusy] = useState(false);

  const isCoordinator = roleTier === 'coordinator';
  const ownIds = useMemo(
    () => changes.filter((c) => !!user?.id && c.authorId === user.id).map((c) => c.id),
    [changes, user?.id],
  );

  const run = (fn: () => void) => {
    if (busy) return;
    setBusy(true);
    try {
      fn();
    } finally {
      setBusy(false);
    }
  };

  const resolveOne = (changeId: string, action: ResolveAction) =>
    run(() => resolveChangeInEditor(editor, changeId, action));

  const resolveAll = (action: ResolveAction) =>
    run(() => {
      // Accept-all and reject-all apply to the ACTIVE FIELD only: the ids come
      // from this field's change list, never from the page.
      const ids = isCoordinator ? changes.map((c) => c.id) : ownIds;
      resolveChangesInEditor(editor, ids, action);
    });

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

  const canAcceptAll = isCoordinator;
  const canRejectAll = isCoordinator || ownIds.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="text-[11px] text-muted-foreground">
          {changes.length} change{changes.length === 1 ? '' : 's'} in this field
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[11px] text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400"
            disabled={!canAcceptAll || busy}
            onClick={() => resolveAll('accept')}
          >
            Accept all
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[11px] text-destructive hover:bg-destructive/10"
            disabled={!canRejectAll || busy}
            onClick={() => resolveAll('reject')}
          >
            Reject all
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <ul className="space-y-1.5">
          {changes.map((c) => {
            const isOwn = !!user?.id && c.authorId === user.id;
            const canAccept = isCoordinator;
            const canReject = isCoordinator || isOwn;
            return (
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
                {(canAccept || canReject) && (
                  <div className="mt-1.5 flex items-center justify-end gap-1">
                    {canAccept && (
                      <button
                        type="button"
                        disabled={busy}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => resolveOne(c.id, 'accept')}
                        className="rounded p-0.5 text-green-600 hover:bg-green-100 disabled:opacity-50 dark:text-green-400 dark:hover:bg-green-900/30"
                        title="Accept change"
                        aria-label="Accept change"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {canReject && (
                      <button
                        type="button"
                        disabled={busy}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => resolveOne(c.id, 'reject')}
                        className="rounded p-0.5 text-red-600 hover:bg-red-100 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/30"
                        title="Reject change"
                        aria-label="Reject change"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
