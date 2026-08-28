import { useCallback, useState } from 'react';
import { Check, GitCompare, X } from 'lucide-react';
import type { Editor } from '@tiptap/core';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { TrackChange } from '@/extensions/TrackChanges';
import { smartTimestamp } from '@/lib/smartTimestamp';
import { useAuth } from '@/hooks/useAuth';
import { useProposalRole } from '@/hooks/useProposalRole';
import {
  resolveAllChangesOnEditor,
  resolveChangeOnEditor,
  type ResolveAction,
} from '@/lib/resolveTrackChange';

/**
 * THE TRACKED CHANGES TAB
 *
 * Scope is deliberately narrow and different from the comments tab: this tab
 * shows the tracked changes of the ONE field the caret is in, never the page.
 * With no field active it stays open and says so.
 *
 * Accepting and rejecting run through `resolveTrackChange`, the same path the
 * hover tooltip uses, so both routes behave identically and both write through
 * the field's versioned save.
 *
 * Permissions: coordinator and above may resolve anything; an author may
 * reject — that is, withdraw — their own change, but not accept it.
 */
export function ReviewPanelBody({
  hasActiveField,
  changes,
  editor,
  proposalId,
}: {
  hasActiveField: boolean;
  changes: TrackChange[];
  editor: Editor | null;
  proposalId?: string;
}) {
  const { user } = useAuth();
  const { roleTier } = useProposalRole(proposalId);
  const isCoordinator = roleTier === 'coordinator';
  const [busy, setBusy] = useState(false);

  const resolveOne = useCallback(
    (change: TrackChange, action: ResolveAction) => {
      if (busy) return;
      setBusy(true);
      try {
        if (!resolveChangeOnEditor(editor, change.id, action)) {
          toast.error('That change could not be resolved.');
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, editor],
  );

  const resolveAll = useCallback(
    (action: ResolveAction) => {
      if (busy) return;
      setBusy(true);
      try {
        if (!resolveAllChangesOnEditor(editor, action)) {
          toast.error('Those changes could not be resolved.');
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, editor],
  );

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

  const allMine =
    !!user?.id && changes.every((c) => c.authorId === user.id);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Accept all and reject all act on THIS FIELD only — they are the
          editor's own commands, and the editor is the field. */}
      {(isCoordinator || allMine) && (
        <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
          {isCoordinator && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 flex-1 text-[11px]"
              disabled={busy}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => resolveAll('accept')}
            >
              <Check className="mr-1 h-3 w-3 text-emerald-600" />
              Accept all
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-6 flex-1 text-[11px]"
            disabled={busy}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => resolveAll('reject')}
          >
            <X className="mr-1 h-3 w-3 text-destructive" />
            Reject all
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <ul className="space-y-1.5">
          {changes.map((c) => {
            const isOwn = !!user?.id && c.authorId === user.id;
            const canAccept = isCoordinator;
            const canReject = isCoordinator || isOwn;
            let when = '';
            try {
              when = smartTimestamp(new Date(c.timestamp));
            } catch {
              when = '';
            }
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
                    {c.authorName} · {when}
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
                        onClick={() => resolveOne(c, 'accept')}
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
                        onClick={() => resolveOne(c, 'reject')}
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
