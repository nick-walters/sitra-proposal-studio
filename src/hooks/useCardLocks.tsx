/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { createWorkerInterval } from '@/lib/workerInterval';
import {
  acquireStream,
  broadcastContent,
  onSnapshotRequest,
  onStreamContent,
  releaseStream,
  requestSnapshot,
  sendSnapshot,
} from '@/lib/cardStream';

/* ------------------------------------------------------------------ */
/* Target addressing                                                   */
/* ------------------------------------------------------------------ */

/** Only 'text_box' is implemented; the other kinds exist so the model can
 *  carry table cells and figures later without a schema change. */
export type LockTargetType = 'text_box' | 'table_cell' | 'figure';

export const fieldTargetId = (fieldId: string, textBox: 'header' | 'content') =>
  `field:${fieldId}:${textBox}`;
export const cardTitleTargetId = (cardId: string) => `card:${cardId}:title`;

export interface LockHolder {
  targetId: string;
  userId: string;
  userName: string | null;
  avatarUrl: string | null;
  expiresAt: string;
}

/** Lock lifetime on the server is 300s — deliberately equal to the idle
 *  timeout below, so the idle timeout is the single authority on release and
 *  the server window can never expire under a live holder. The heartbeat runs
 *  on a Worker timer so minimised windows keep it alive. */
const HEARTBEAT_MS = 15_000;


/** How often a viewer re-reads the lock table from the server. Viewers must
 *  never decide on their own that a lock has gone: realtime events can be
 *  missed, so the displayed state is re-derived from server rows. */
const LOCK_POLL_MS = 8_000;

/** Tolerance for clock skew between this browser and the database when
 *  judging `expires_at`. Well under the 300s server window. */
const EXPIRY_SKEW_MS = 20_000;

/** Idle timeout measured from the last keystroke. */
const IDLE_TIMEOUT_MS = 5 * 60_000;
/** Warning appears this long before the timeout. */
const WARNING_LEAD_MS = 60_000;


interface CardLockContextValue {
  enabled: boolean;
  myUserId: string | null;
  locks: Record<string, LockHolder>;
  /** Acquire on first keystroke; resolves true when this client holds it. */
  claim: (targetId: string) => Promise<boolean>;
  /** Note a keystroke — resets the idle timer and refreshes the heartbeat. */
  noteKeystroke: (targetId: string) => void;
  /** Release, optionally saving first (always used by the idle timeout). */
  release: (targetId: string, opts?: { save?: boolean }) => Promise<void>;
  /** Registers the flush-to-database routine for a target. */
  registerSaver: (targetId: string, saver: () => Promise<void>) => () => void;
  /** Registers a getter for the target's current HTML (for stream snapshots). */
  registerSnapshotSource: (targetId: string, get: () => string) => () => void;
  /** Holder-side: push current content to viewers (throttled internally). */
  stream: (targetId: string, html: string) => void;
  /** Viewer-side: subscribe to the live value of a target. */
  useStreamedValue: (targetId: string, active: boolean) => string | null;
  warning: { targetId: string; secondsLeft: number } | null;
}

const CardLockContext = createContext<CardLockContextValue | null>(null);

export function CardLockProvider({
  proposalId,
  sectionId,
  enabled = true,
  children,
}: {
  proposalId: string;
  sectionId: string;
  enabled?: boolean;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const myUserId = user?.id ?? null;

  const [locks, setLocks] = useState<Record<string, LockHolder>>({});
  const [warning, setWarning] = useState<{ targetId: string; secondsLeft: number } | null>(null);

  const myTargetRef = useRef<string | null>(null);
  const lastKeystrokeRef = useRef<number>(0);
  const saversRef = useRef<Map<string, () => Promise<void>>>(new Map());
  const snapshotSourcesRef = useRef<Map<string, () => string>>(new Map());
  const claimingRef = useRef<Map<string, Promise<boolean>>>(new Map());

  /* ---------------- lock table: load + realtime ---------------- */

  const mapRow = (row: {
    target_id: string;
    user_id: string;
    user_name: string | null;
    avatar_url: string | null;
    expires_at: string;
  }): LockHolder => ({
    targetId: row.target_id,
    userId: row.user_id,
    userName: row.user_name,
    avatarUrl: row.avatar_url,
    expiresAt: row.expires_at,
  });

  const refreshLocks = useCallback(async () => {
    if (!proposalId) return;
    const { data, error } = await supabase
      .from('card_target_locks')
      .select('target_id, user_id, user_name, avatar_url, expires_at')
      .eq('proposal_id', proposalId);
    // A failed read must never be mistaken for "no locks" — keep what we have.
    if (error) return;
    const next: Record<string, LockHolder> = {};
    const cutoff = Date.now() - EXPIRY_SKEW_MS;
    for (const row of data ?? []) {
      if (new Date(row.expires_at).getTime() < cutoff) continue;
      next[row.target_id] = mapRow(row);
    }
    setLocks(next);
  }, [proposalId]);

  useEffect(() => {
    if (!enabled || !proposalId) return;
    void refreshLocks();
    const channel = supabase
      .channel(`card-locks:${proposalId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'card_target_locks',
          filter: `proposal_id=eq.${proposalId}`,
        },
        () => void refreshLocks(),
      )
      .subscribe();
    // Poll as the authority. Realtime events can be missed (dropped socket,
    // throttled tab), and a viewer must never expire a lock on its own clock:
    // the displayed state is always what the server last reported.
    const poll = window.setInterval(() => void refreshLocks(), LOCK_POLL_MS);
    const onWake = () => void refreshLocks();
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    return () => {
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
      supabase.removeChannel(channel);
    };
  }, [enabled, proposalId, refreshLocks]);


  /* ---------------- streaming channel ---------------- */

  useEffect(() => {
    if (!enabled || !sectionId) return;
    acquireStream(sectionId);
    const off = onSnapshotRequest(sectionId, (targetId) => {
      if (myTargetRef.current !== targetId) return;
      const get = snapshotSourcesRef.current.get(targetId);
      if (get) sendSnapshot(sectionId, targetId, get());
    });
    return () => {
      off();
      releaseStream(sectionId);
    };
  }, [enabled, sectionId]);

  /* ---------------- acquire / heartbeat / release ---------------- */

  const doRelease = useCallback(
    async (targetId: string, opts?: { save?: boolean }) => {
      if (myTargetRef.current !== targetId) return;
      if (opts?.save !== false) {
        // Never release before the holder's content is safely stored.
        const saver = saversRef.current.get(targetId);
        if (saver) {
          try {
            await saver();
          } catch {
            /* the saver surfaces its own error */
          }
        }
      }
      myTargetRef.current = null;
      setWarning(null);
      await supabase.rpc('release_card_lock', {
        p_target_type: 'text_box' as LockTargetType,
        p_target_id: targetId,
      });
      void refreshLocks();
    },
    [refreshLocks],
  );

  const claim = useCallback(
    async (targetId: string): Promise<boolean> => {
      if (!enabled || !myUserId) return true; // locking off ⇒ never block editing
      lastKeystrokeRef.current = Date.now();
      if (myTargetRef.current === targetId) return true;

      const inFlight = claimingRef.current.get(targetId);
      if (inFlight) return inFlight;

      const p = (async () => {
        // Editing a new target implicitly finishes the previous one.
        const previous = myTargetRef.current;
        if (previous && previous !== targetId) await doRelease(previous);

        const { data, error } = await supabase.rpc('acquire_card_lock', {
          p_proposal_id: proposalId,
          p_target_type: 'text_box' as LockTargetType,
          p_target_id: targetId,
          p_section_id: sectionId,
        });
        if (error) {
          // Locking unavailable — fail open rather than block the editor.
          return true;
        }
        const result = (data ?? {}) as {
          acquired?: boolean;
          user_id?: string;
          user_name?: string | null;
          avatar_url?: string | null;
          expires_at?: string;
        };
        if (result.acquired) {
          myTargetRef.current = targetId;
          lastKeystrokeRef.current = Date.now();
        }
        if (result.user_id && result.expires_at) {
          setLocks((prev) => ({
            ...prev,
            [targetId]: {
              targetId,
              userId: result.user_id!,
              userName: result.user_name ?? null,
              avatarUrl: result.avatar_url ?? null,
              expiresAt: result.expires_at!,
            },
          }));
        }
        return !!result.acquired;
      })().finally(() => claimingRef.current.delete(targetId));

      claimingRef.current.set(targetId, p);
      return p;
    },
    [enabled, myUserId, proposalId, sectionId, doRelease],
  );

  const noteKeystroke = useCallback(
    (targetId: string) => {
      lastKeystrokeRef.current = Date.now();
      if (warning) setWarning(null);
      if (myTargetRef.current !== targetId) void claim(targetId);
    },
    [claim, warning],
  );

  // Heartbeat: keeps the server-side expiry in the future while held. It runs
  // on a Worker timer because main-thread `setInterval` is clamped (and on
  // minimise sometimes suspended) by the browser; extra beats fire whenever
  // the tab or window returns.
  useEffect(() => {
    if (!enabled) return;
    let lastBeatAt = 0;
    const beat = () => {
      const target = myTargetRef.current;
      if (!target) return;
      if (import.meta.env.DEV) {
        const now = Date.now();
        // eslint-disable-next-line no-console
        console.debug(
          '[card-lock heartbeat]',
          new Date(now).toISOString(),
          'gap',
          lastBeatAt ? `${Math.round((now - lastBeatAt) / 1000)}s` : 'first',
          'hidden',
          document.hidden,
        );
        lastBeatAt = now;
      }
      void supabase.rpc('heartbeat_card_lock', {
        p_target_type: 'text_box' as LockTargetType,
        p_target_id: target,
      });
    };
    const stop = createWorkerInterval(HEARTBEAT_MS, beat);
    document.addEventListener('visibilitychange', beat);
    window.addEventListener('focus', beat);
    window.addEventListener('pageshow', beat);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', beat);
      window.removeEventListener('focus', beat);
      window.removeEventListener('pageshow', beat);
    };
  }, [enabled]);



  // Idle timer: warning at one minute remaining, save-then-release at zero.
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      const target = myTargetRef.current;
      if (!target) {
        setWarning((w) => (w ? null : w));
        return;
      }
      const idle = Date.now() - lastKeystrokeRef.current;
      if (idle >= IDLE_TIMEOUT_MS) {
        void doRelease(target, { save: true });
        return;
      }
      if (idle >= IDLE_TIMEOUT_MS - WARNING_LEAD_MS) {
        const secondsLeft = Math.max(0, Math.ceil((IDLE_TIMEOUT_MS - idle) / 1000));
        setWarning((w) =>
          w && w.targetId === target && w.secondsLeft === secondsLeft
            ? w
            : { targetId: target, secondsLeft },
        );
      } else {
        setWarning((w) => (w ? null : w));
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [enabled, doRelease]);

  // Tab / window close and in-app teardown.
  //
  // On unload the browser cancels ordinary fetches, so the supabase-js call
  // used here previously never reached the server and every clean close looked
  // like a crash (lock held until the 300s expiry). The unload paths now use a
  // `keepalive` request, which the network stack completes after the document
  // is gone. `visibilitychange` is deliberately NOT a release trigger: it
  // cannot be told apart from an ordinary minimise or app switch, which must
  // keep the lock.
  useEffect(() => {
    if (!enabled) return;
    const unloadRelease = () => {
      const target = myTargetRef.current;
      if (!target) return;
      myTargetRef.current = null;
      unloadRpc(
        'release_card_lock',
        { p_target_type: 'text_box', p_target_id: target },
        accessTokenRef.current,
      );
    };
    window.addEventListener('pagehide', unloadRelease);
    window.addEventListener('beforeunload', unloadRelease);
    return () => {
      window.removeEventListener('pagehide', unloadRelease);
      window.removeEventListener('beforeunload', unloadRelease);
      // In-app teardown (navigating away from the board): the page survives, so
      // the ordinary RPC can complete normally.
      const target = myTargetRef.current;
      if (target) {
        myTargetRef.current = null;
        void supabase.rpc('release_card_lock', {
          p_target_type: 'text_box' as LockTargetType,
          p_target_id: target,
        });
      }
    };
  }, [enabled]);


  const registerSaver = useCallback((targetId: string, saver: () => Promise<void>) => {
    saversRef.current.set(targetId, saver);
    return () => {
      if (saversRef.current.get(targetId) === saver) saversRef.current.delete(targetId);
    };
  }, []);

  const registerSnapshotSource = useCallback((targetId: string, get: () => string) => {
    snapshotSourcesRef.current.set(targetId, get);
    return () => {
      if (snapshotSourcesRef.current.get(targetId) === get) snapshotSourcesRef.current.delete(targetId);
    };
  }, []);

  const stream = useCallback(
    (targetId: string, html: string) => {
      if (!enabled || !sectionId) return;
      if (myTargetRef.current !== targetId) return;
      broadcastContent(sectionId, targetId, html);
    },
    [enabled, sectionId],
  );

  const useStreamedValue = (targetId: string, active: boolean) => {
    const [value, setValue] = useState<string | null>(null);
    useEffect(() => {
      if (!enabled || !active || !sectionId) {
        setValue(null);
        return;
      }
      const off = onStreamContent(sectionId, (id, html) => {
        if (id === targetId) setValue(html);
      });
      // A viewer joining mid-edit asks the holder for the full current value.
      requestSnapshot(sectionId, targetId);
      return () => {
        off();
      };
    }, [targetId, active]);
    return value;
  };

  const value = useMemo<CardLockContextValue>(
    () => ({
      enabled,
      myUserId,
      locks,
      claim,
      noteKeystroke,
      release: doRelease,
      registerSaver,
      registerSnapshotSource,
      stream,
      useStreamedValue,
      warning,
    }),
    // useStreamedValue is a stable closure over enabled/sectionId
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, myUserId, locks, claim, noteKeystroke, doRelease, registerSaver, registerSnapshotSource, stream, warning],
  );

  return <CardLockContext.Provider value={value}>{children}</CardLockContext.Provider>;
}

export function useCardLocks(): CardLockContextValue {
  const ctx = useContext(CardLockContext);
  if (!ctx) throw new Error('useCardLocks must be used inside a CardLockProvider');
  return ctx;
}

/** Per-target view of the lock state. */
export function useTargetLock(targetId: string) {
  const { locks, myUserId } = useCardLocks();
  const holder = locks[targetId] ?? null;
  const isMine = !!holder && holder.userId === myUserId;
  const lockedByOther = !!holder && !isMine;
  return { holder, isMine, lockedByOther };
}
