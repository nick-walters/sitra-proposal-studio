import { useState, useEffect } from 'react';
import { getProposalFileSignedUrl } from '@/lib/proposalStorage';

/**
 * Determines if a stored URL/path needs a fresh signed URL.
 * File paths (no protocol) and expired signed URLs need refreshing.
 */
export function isStoragePath(value: string): boolean {
  if (!value.startsWith('http')) return true;
  if (value.includes('/proposal-files/') && value.includes('token=')) return true;
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
 * Hook that resolves a storage file path or expired signed URL to a fresh signed URL.
 * Pass a logoUrl/path value; returns a displayable URL.
 */
export function useStorageUrl(storedValue: string | null | undefined): string | null {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!storedValue) {
      setResolvedUrl(null);
      return;
    }

    if (!isStoragePath(storedValue)) {
      setResolvedUrl(storedValue);
      return;
    }

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
