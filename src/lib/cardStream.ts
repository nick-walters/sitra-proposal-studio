/**
 * Live content streaming for locked card targets.
 *
 * The lock holder broadcasts the FULL current HTML of the target it holds on a
 * throttle (see STREAM_THROTTLE_MS). Viewers render that read-only; they never
 * write it to the database.
 *
 * Mid-edit joiners: because every broadcast carries the full value rather than
 * a delta, a joiner is correct as soon as the holder's next throttle tick
 * fires. To avoid waiting for the holder to type again, a joiner also emits a
 * `snapshot-request` for the target and the holder answers immediately with
 * its current value.
 *
 * Streaming is entirely optional — locks and the red border work with this
 * module disabled or failing.
 */
import { supabase } from '@/integrations/supabase/client';

/**
 * 400ms: comfortably inside Realtime's default broadcast budget even with
 * several targets in flight, while still reading as "live" to a viewer.
 */
export const STREAM_THROTTLE_MS = 400;

type ContentListener = (targetId: string, html: string) => void;
type SnapshotRequestListener = (targetId: string) => void;

interface StreamEntry {
  channel: ReturnType<typeof supabase.channel>;
  refCount: number;
  contentListeners: Set<ContentListener>;
  requestListeners: Set<SnapshotRequestListener>;
  /** Last value broadcast per target, plus the pending throttle state. */
  pending: Map<string, { html: string; timer: ReturnType<typeof setTimeout> | null; lastAt: number }>;
}

const streams = new Map<string, StreamEntry>();

/**
 * Listener sets live OUTSIDE the channel entry and outlive it.
 *
 * React runs child effects before parent effects, so a field subscribes to a
 * key before the provider above it has acquired the channel. When the sets
 * lived on the entry, those early subscriptions were silently dropped and the
 * viewer never received a single frame.
 */
interface ListenerSets {
  contentListeners: Set<ContentListener>;
  requestListeners: Set<SnapshotRequestListener>;
}

const listenerSets = new Map<string, ListenerSets>();

function setsFor(key: string): ListenerSets {
  const existing = listenerSets.get(key);
  if (existing) return existing;
  const created: ListenerSets = { contentListeners: new Set(), requestListeners: new Set() };
  listenerSets.set(key, created);
  return created;
}

function channelName(sectionId: string) {
  return `card-stream:${sectionId}`;
}

export function acquireStream(sectionId: string): StreamEntry {
  const existing = streams.get(sectionId);
  if (existing) {
    existing.refCount += 1;
    return existing;
  }

  const channel = supabase.channel(channelName(sectionId), {
    config: { broadcast: { self: false } },
  });

  const sets = setsFor(sectionId);
  const entry: StreamEntry = {
    channel,
    refCount: 1,
    contentListeners: sets.contentListeners,
    requestListeners: sets.requestListeners,
    pending: new Map(),
  };
  streams.set(sectionId, entry);


  channel
    .on('broadcast', { event: 'content' }, ({ payload }) => {
      const { targetId, html } = (payload ?? {}) as { targetId?: string; html?: string };
      if (!targetId) return;
      for (const l of entry.contentListeners) l(targetId, html ?? '');
    })
    .on('broadcast', { event: 'snapshot-request' }, ({ payload }) => {
      const { targetId } = (payload ?? {}) as { targetId?: string };
      if (!targetId) return;
      for (const l of entry.requestListeners) l(targetId);
    })
    .subscribe();

  return entry;
}

export function releaseStream(sectionId: string) {
  const entry = streams.get(sectionId);
  if (!entry) return;
  entry.refCount -= 1;
  if (entry.refCount > 0) return;
  streams.delete(sectionId);
  for (const p of entry.pending.values()) if (p.timer) clearTimeout(p.timer);
  supabase.removeChannel(entry.channel);
}

/** Throttled full-value broadcast from the lock holder. */
export function broadcastContent(sectionId: string, targetId: string, html: string) {
  const entry = streams.get(sectionId);
  if (!entry) return;

  const send = (value: string) => {
    void entry.channel.send({
      type: 'broadcast',
      event: 'content',
      payload: { targetId, html: value },
    });
  };

  const now = Date.now();
  const state = entry.pending.get(targetId) ?? { html, timer: null, lastAt: 0 };
  state.html = html;

  if (now - state.lastAt >= STREAM_THROTTLE_MS && !state.timer) {
    state.lastAt = now;
    entry.pending.set(targetId, state);
    send(html);
    return;
  }

  if (!state.timer) {
    state.timer = setTimeout(() => {
      const s = entry.pending.get(targetId);
      if (!s) return;
      s.timer = null;
      s.lastAt = Date.now();
      send(s.html);
    }, STREAM_THROTTLE_MS - (now - state.lastAt));
  }
  entry.pending.set(targetId, state);
}

/** Immediate, unthrottled send — used to answer a snapshot request. */
export function sendSnapshot(sectionId: string, targetId: string, html: string) {
  const entry = streams.get(sectionId);
  if (!entry) return;
  void entry.channel.send({ type: 'broadcast', event: 'content', payload: { targetId, html } });
}

export function requestSnapshot(sectionId: string, targetId: string) {
  const entry = streams.get(sectionId);
  if (!entry) return;
  void entry.channel.send({ type: 'broadcast', event: 'snapshot-request', payload: { targetId } });
}

export function onStreamContent(sectionId: string, listener: ContentListener) {
  const entry = streams.get(sectionId);
  if (!entry) return () => undefined;
  entry.contentListeners.add(listener);
  return () => entry.contentListeners.delete(listener);
}

export function onSnapshotRequest(sectionId: string, listener: SnapshotRequestListener) {
  const entry = streams.get(sectionId);
  if (!entry) return () => undefined;
  entry.requestListeners.add(listener);
  return () => entry.requestListeners.delete(listener);
}
