/**
 * Safely open a URL in a new tab. Only http(s) URLs are allowed to prevent
 * javascript:, data:, vbscript: and other dangerous schemes from being executed
 * via window.open().
 */
export function isSafeHttpUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function safeOpenUrl(url: string | null | undefined): void {
  if (!url) return;
  if (!isSafeHttpUrl(url)) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}
