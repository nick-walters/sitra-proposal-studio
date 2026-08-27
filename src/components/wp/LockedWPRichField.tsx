import { useCallback, useRef } from 'react';
import type { Extensions } from '@tiptap/core';
import { LazyRichField } from '@/components/participant/LazyRichField';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import { useLockedBox, lostTextPayload } from '@/hooks/useLockedBox';
import { LockBoundary, lockStateOf } from '@/components/cards/LockBoundary';
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

  // Entering the field is enough to take the lock. Waiting for the first
  // keystroke left a field that looked occupied but held no lock row, so no
  // other user saw a red border or an avatar, nothing was streamed, and the
  // idle countdown (which only runs while a lock is held) never started.
  const claimNow = useCallback(() => {
    if (disabled || lock.lockedByOther) return;
    lock.onType();
  }, [disabled, lock]);

  return (
    <LockBoundary
      state={lockStateOf(lock)}
      holder={lock.holder}
      onKeyDownCapture={claimNow}
      onPasteCapture={claimNow}
      onBeforeInputCapture={claimNow}
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
        onFocus={claimNow}
      />
    </LockBoundary>
  );


}

export default LockedWPRichField;
