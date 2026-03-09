import { useState, useEffect } from 'react';
import { getProposalFileSignedUrl } from '@/lib/proposalStorage';

/**
 * Determines if a stored URL/path needs a fresh signed URL.
 * File paths (no protocol) and expired signed URLs need refreshing.
 */
function isStoragePath(value: string): boolean {
  // If it starts with http but contains /proposal-files/ with a token, it's an old signed URL
  // If it doesn't start with http, it's a raw file path
  if (!value.startsWith('http')) return true;
  // Check if it's a storage signed URL (contains /proposal-files/ and token param)
  if (value.includes('/proposal-files/') && value.includes('token=')) return true;
  return false;
}

/**
 * Extracts the file path from a stored value (could be a path or a full URL).
 */
function extractPath(value: string): string | null {
  if (!value.startsWith('http')) return value;
  // Extract path from URL, stripping query params
  const match = value.match(/\/proposal-files\/([^?]+)/);
  return match ? match[1] : null;
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

    // If it's an external URL (not from our storage), use directly
    if (!isStoragePath(storedValue)) {
      setResolvedUrl(storedValue);
      return;
    }

    const path = extractPath(storedValue);
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
