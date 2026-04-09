import { useState, useEffect } from 'react';
import { getProposalFileSignedUrl } from '@/lib/proposalStorage';

/**
 * Determines if a stored URL/path needs a fresh signed URL.
 * File paths (no protocol) and expired signed URLs need refreshing.
 */
export function isStoragePath(value: string): boolean {
  // Data URIs and blob URLs are already displayable, not storage paths
  if (value.startsWith('data:') || value.startsWith('blob:')) return false;
  if (!value.startsWith('http')) return true;
  // Any URL referencing proposal-files bucket needs resolution (signed URLs expire, public URLs don't work on private buckets)
  if (value.includes('/proposal-files/')) return true;
  return false;
}

/**
 * Extracts the file path from a stored value (could be a path or a full URL).
 */
export function extractStoragePath(value: string): string | null {
  if (!value.startsWith('http')) return value;
  const match = value.match(/\/proposal-files\/([^?]+)/);
  return match ? match[1] : null;
}

/**
 * Non-hook async function to resolve a stored path/URL to a fresh signed URL.
 * Use in non-component contexts (e.g., export functions).
 */
export async function resolveStorageUrl(storedValue: string | null | undefined): Promise<string | null> {
  if (!storedValue) return null;
  if (!isStoragePath(storedValue)) return storedValue;
  const path = extractStoragePath(storedValue);
  if (!path) return storedValue;
  const { url } = await getProposalFileSignedUrl(path, 3600);
  return url || storedValue;
}

/**
 * Compute the initial/synchronous value for a stored path.
 * Returns the value directly for data URIs, blob URLs, and regular http URLs
 * that don't need signed-URL resolution. Returns null only when async resolution is needed.
 */
function getInitialUrl(storedValue: string | null | undefined): string | null {
  if (!storedValue) return null;
  if (!isStoragePath(storedValue)) return storedValue;
  return null; // needs async resolution
}

/**
 * Hook that resolves a storage file path or expired signed URL to a fresh signed URL.
 * Pass a logoUrl/path value; returns a displayable URL.
 * For data URIs, blob URLs, and regular http URLs the value is returned synchronously
 * on the very first render (no flash of null).
 */
export function useStorageUrl(storedValue: string | null | undefined): string | null {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(() => getInitialUrl(storedValue));

  useEffect(() => {
    // Re-sync for value changes that can be resolved synchronously
    const syncValue = getInitialUrl(storedValue);
    if (syncValue !== null || !storedValue) {
      setResolvedUrl(syncValue);
      return;
    }

    // Async path: need a signed URL
    const path = extractStoragePath(storedValue);
    if (!path) {
      setResolvedUrl(storedValue);
      return;
    }

    let cancelled = false;

    getProposalFileSignedUrl(path, 3600).then(({ url }) => {
      if (!cancelled) {
        setResolvedUrl(url || storedValue);
      }
    });

    return () => { cancelled = true; };
  }, [storedValue]);

  return resolvedUrl;
}
