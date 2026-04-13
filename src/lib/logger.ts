/**
 * Central logging utility — logs to console only in development.
 * Use toast.error() separately for user-facing messages.
 */

const isDev = import.meta.env.DEV;

export function logError(context: string, error: unknown): void {
  if (isDev) {
    console.error(`[${context}]`, error);
  }
}

export function logWarn(context: string, message: string, data?: unknown): void {
  if (isDev) {
    console.warn(`[${context}]`, message, data ?? '');
  }
}
