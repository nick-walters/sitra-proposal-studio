/**
 * THE REVIEW PANEL — TRACKED CHANGES FOR THE ACTIVE FIELD
 *
 * Scope is deliberately narrower than the comments panel: this panel shows the
 * tracked changes of the ONE field the caret is in, never the page. With no
 * field active it stays open and says so.
 *
 * Accepting and rejecting run through `trackChangeResolve`, exactly the path
 * the hover tooltip uses, so both routes behave identically and both land in
 * the field's versioned save.
 */
import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { TrackedChangesIcon } from '@/components/panels/TrackedChangesIcon';
import type { Editor } from '@tiptap/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { TrackChange } from '@/extensions/TrackChanges';
import { smartTimestamp } from '@/lib/smartTimestamp';
import { useAuth } from '@/hooks/useAuth';
import { useProposalRole } from '@/hooks/useProposalRole';
import {
  resolveAllChangesInEditor,
  resolveChangeInEditor,
  trackChangePermissions,
  type TrackAction,
} from '@/lib/trackChangeResolve';

function when(ts: Date | string | null | undefined): string {
  if (!ts) return '';
  try {
    return smartTimestamp(new Date(ts));
  } catch {
    return '';
  }
}

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
  const [busy, setBusy] = useState(false);

  // Anyone who may edit the proposal may resolve every change in the field,
  // whoever wrote it — accept-all and reject-all sweep the lot.
  const { canEdit } = trackChangePermissions({ roleTier, userId: user?.id });

  const one = (c: TrackChange, action: TrackAction) => {
    if (busy) return;
    setBusy(true);
    try {
      if (!resolveChangeInEditor(editor, c.id, action)) {
        toast.error('That change could not be resolved.');
      }
    } finally {
      setBusy(false);
    }
  };

  const all = (action: TrackAction) => {
    if (busy || !canEdit) return;
    setBusy(true);
    try {
      if (!resolveAllChangesInEditor(editor, action)) {
        toast.error('Those changes could not be resolved.');
      }
    } finally {
      setBusy(false);
    }
  };

  if (!hasActiveField) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <TrackedChangesIcon className="h-5 w-5" />
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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1.5">
        <span className="text-[11px] text-muted-foreground">
          {changes.length} {changes.length === 1 ? 'change' : 'changes'} in this field
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[11px]"
            disabled={busy || !canEdit}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => all('accept')}
          >
            Accept all
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[11px]"
            disabled={busy || !canEdit}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => all('reject')}
          >
            Reject all
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <ul className="space-y-1.5">
          {changes.map((c) => {
            const perms = trackChangePermissions({
              roleTier,
              userId: user?.id,
              authorId: c.authorId,
            });
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
                    {c.authorName} · {when(c.timestamp)}
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
                {(perms.canAccept || perms.canReject) && (
                  <div className="mt-1.5 flex items-center justify-end gap-1">
                    {perms.canAccept && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 gap-1 px-2 text-[11px]"
                        disabled={busy}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => one(c, 'accept')}
                      >
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        Accept
                      </Button>
                    )}
                    {perms.canReject && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 gap-1 px-2 text-[11px]"
                        disabled={busy}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => one(c, 'reject')}
                      >
                        <X className="h-3.5 w-3.5 text-destructive" />
                        Reject
                      </Button>
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
