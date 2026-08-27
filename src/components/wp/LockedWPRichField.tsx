import { useCallback, useRef } from 'react';
import type { Extensions } from '@tiptap/core';
import { LazyRichField } from '@/components/participant/LazyRichField';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import { useLockedBox, lostTextPayload } from '@/hooks/useLockedBox';
import { LockHolderBadge } from '@/components/cards/LockHolderBadge';
import { reportLostTextPayload } from '@/lib/lostTextBus';

/**
 * A WP draft narrative field with the full cards-board collaboration
 * behaviour: lock on first keystroke, worker heartbeat, release on blur /
 * pagehide / idle timeout, red border and holder avatar for non-holders, and
 * live streaming of the holder's text at the shared 400 ms throttle.
 *
 * Nothing here is card-specific — the only difference from the board is the
 * target id, which the caller supplies.
 */
export function LockedWPRichField({
  targetId,
  value,
  onChange,
  disabled = false,
  proposalId,
  staticExtensions,
  minHeight,
  documentSurface = false,
  shouldStayMounted,
}: {
  targetId: string;
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  proposalId: string;
  staticExtensions?: Extensions;
  minHeight?: string;
  documentSurface?: boolean;
  shouldStayMounted?: () => boolean;
}) {
  // Latest text this client typed, kept out of React state so the lock
  // machinery can read it synchronously (race loss, idle save, snapshots).
  const typedRef = useRef(value);
  typedRef.current = value;
  const { push, flush } = useDebouncedSave<string>(onChange, 800);

  const lock = useLockedBox(targetId, {
    getTyped: () => typedRef.current,
    onLoseRace: (typed, holderName) => reportLostTextPayload(lostTextPayload(typed, holderName)),
    save: async () => flush(),
    snapshot: () => typedRef.current,
  });

  const handleChange = useCallback(
    (html: string) => {
      // A viewer's editor is read-only; any normalisation it emits while it
      // shows someone else's streamed text must never be written.
      if (lock.lockedByOther) return;
      typedRef.current = html;
      lock.push(html);
      push(html);
    },
    [lock, push],
  );

  const viewHtml = lock.lockedByOther && lock.streamed != null ? lock.streamed : value;

  return (
    <div className="flex items-start gap-2">
      <div
        className={`min-w-0 flex-1 rounded-md ${
          lock.lockedByOther
            ? 'border border-destructive ring-1 ring-destructive/40'
            : lock.isMine
              ? 'ring-1 ring-emerald-600/60'
              : ''
        }`}
        onKeyDownCapture={() => {
          if (lock.lockedByOther) return;
          lock.onType();
        }}
        onBlurCapture={(e) => {
          const next = e.relatedTarget as Node | null;
          if (next && e.currentTarget.contains(next)) return;
          flush();
          lock.onBlur();
        }}
      >
        <LazyRichField
          value={viewHtml}
          onChange={handleChange}
          disabled={disabled || lock.lockedByOther}
          proposalId={proposalId}
          staticExtensions={staticExtensions}
          minHeight={minHeight}
          documentSurface={documentSurface}
          shouldStayMounted={shouldStayMounted}
        />
      </div>
      {lock.lockedByOther && lock.holder && <LockHolderBadge holder={lock.holder} />}
    </div>
  );
}

export default LockedWPRichField;
