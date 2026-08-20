import type { LostTextPayload } from '@/components/cards/LostTextDialog';

/**
 * Application-level surface for rejected writes.
 *
 * A rejection used to be reported through component-local state, so a save
 * that was rejected AFTER its component unmounted (the classic case: text
 * flushed while navigating away from a work package) had nowhere to render
 * its dialog and the user's text was silently lost. The bus lives outside the
 * React tree, so the dialog is mounted once at the app root and survives any
 * navigation that triggered the save.
 */

type Listener = (payload: LostTextPayload) => void;

const listeners = new Set<Listener>();
let lastText = '';
let lastAt = 0;

/** True when the value carries no user text worth offering back for copying. */
function isBlank(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value !== 'string') return false;
  return value.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() === '';
}

export function subscribeLostText(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Surface text the user is about to lose. Identical text reported twice in
 * quick succession (a save wrapper and its caller both reporting the same
 * rejection) shows one dialog, not two.
 */
export function reportLostText(
  value: unknown,
  reason: LostTextPayload['reason'] = 'conflict',
  holderName?: string | null,
): void {
  if (reason !== 'blocked' && isBlank(value)) return;
  const text = reason === 'blocked' ? '' : String(value);
  const now = Date.now();
  if (reason !== 'blocked' && text === lastText && now - lastAt < 5000) return;
  lastText = text;
  lastAt = now;
  listeners.forEach((l) => l({ text, reason, holderName }));
}

/** Same surface, for callers that already hold a full payload. */
export function reportLostTextPayload(payload: LostTextPayload): void {
  reportLostText(payload.text, payload.reason, payload.holderName);
}


/** Pulls the first non-blank string out of a patch, for reporting. */
export function firstTextValue(patch: Record<string, any> | null | undefined): string | null {
  if (!patch) return null;
  for (const v of Object.values(patch)) {
    if (typeof v === 'string' && !isBlank(v)) return v;
  }
  return null;
}
