import { useCallback, useEffect, useRef } from 'react';
import { useCardLocks, useTargetLock } from '@/hooks/useCardLocks';
import { isHtmlBlank } from '@/lib/htmlBlank';
import type { LostTextPayload } from '@/components/cards/LostTextDialog';

/* ------------------------------------------------------------------ */
/* Per-text-box lock wiring                                            */
/*                                                                     */
/* Target-agnostic: nothing here knows about cards. Any surface that    */
/* sits inside a CardLockProvider (the methodology board, WP drafts)    */
/* addresses its text boxes with its own target ids.                    */
/* ------------------------------------------------------------------ */

export interface LockedBoxOptions {
  /** Current locally typed value, used if the lock race is lost. */
  getTyped: () => string;
  /** Called when another user won the race: revert to authoritative text. */
  onLoseRace: (typed: string, holderName: string | null) => void;
  /** Flushes this text box to the database (used before a timeout release). */
  save?: () => Promise<void>;
  /** Current value, answered to viewers that join mid-edit. */
  snapshot?: () => string;
}

/**
 * Locking for one addressable text box. The lock is taken on the first
 * keystroke, refreshed on every later one, and released on blur.
 */
export function useLockedBox(targetId: string, opts: LockedBoxOptions) {
  const { claim, noteKeystroke, release, holdsTarget, registerSaver, registerSnapshotSource, stream, useStreamedValue } =
    useCardLocks();
  const { holder, isMine, lockedByOther } = useTargetLock(targetId);
  const streamed = useStreamedValue(targetId, lockedByOther);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const holderRef = useRef(holder);
  holderRef.current = holder;

  useEffect(() => {
    if (!optsRef.current.save) return;
    return registerSaver(targetId, () => optsRef.current.save!());
  }, [registerSaver, targetId]);

  useEffect(() => {
    if (!optsRef.current.snapshot) return;
    return registerSnapshotSource(targetId, () => optsRef.current.snapshot!());
  }, [registerSnapshotSource, targetId]);

  // A field can disappear while it still holds the lock: a collapsed module, a
  // list re-render, a route change, a block swapped out. Without this the row
  // survived — renewed by the heartbeat — and everyone else saw "another user
  // is editing" a box nobody was in. Saving here first, then releasing without
  // the registered saver, keeps this independent of effect-cleanup ordering.
  useEffect(() => {
    return () => {
      if (!holdsTarget(targetId)) return;
      void (async () => {
        try {
          await optsRef.current.save?.();
        } catch {
          /* the saver surfaces its own error */
        }
        await release(targetId, { save: false });
      })();
    };
  }, [holdsTarget, release, targetId]);

  const onType = useCallback(() => {
    noteKeystroke(targetId);
    void claim(targetId).then((ok) => {
      if (!ok) optsRef.current.onLoseRace(optsRef.current.getTyped(), holderRef.current?.userName ?? null);
    });
  }, [claim, noteKeystroke, targetId]);

  // A browser fires editor blur when the WINDOW loses focus (alt-tab, desktop
  // switch, clicking another browser). That must never surrender the lock —
  // only a genuine in-app focus move away from this box does. The deferred
  // `document.hasFocus()` check distinguishes the two.
  //
  // The guard is `holdsTarget`, not the polled `isMine`: blurring within a
  // second of claiming left `isMine` still false, the release was skipped and
  // the row was stranded.
  const onBlur = useCallback(() => {
    if (!holdsTarget(targetId)) return;
    window.setTimeout(() => {
      if (!document.hasFocus()) return; // window/app blur — keep the lock
      void release(targetId, { save: true });
    }, 0);
  }, [holdsTarget, release, targetId]);

  const push = useCallback((html: string) => stream(targetId, html), [stream, targetId]);

  return { holder, isMine, lockedByOther, streamed, onType, onBlur, push };
}


/**
 * Chooses the right dialog for a lost race: the copy-to-backup dialog only
 * when the user genuinely typed something, otherwise a plain "locked" notice.
 */
export function lostTextPayload(typed: string, holderName: string | null): LostTextPayload {
  if (isHtmlBlank(typed)) return { text: '', reason: 'blocked', holderName };
  return { text: typed, reason: 'race', holderName };
}

/**
 * Green when held by me, red when held by someone else.
 * The `focus-visible:` overrides matter: shadcn inputs paint the ordinary blue
 * focus ring on focus, which would otherwise win over the green lock border
 * exactly when the holder is typing.
 */
export function lockBorderClass(isMine: boolean, lockedByOther: boolean) {
  // Single shared treatment — see LockBoundary. Identical 2px boundary in both
  // states; the focus-visible overrides stop shadcn's blue ring winning while
  // the holder types.
  if (lockedByOther) return 'border-2 border-destructive';
  if (isMine)
    return 'border-2 border-emerald-600 focus-visible:border-emerald-600 focus-visible:ring-0 focus-visible:ring-offset-0';
  return '';
}

