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
function extractStoragePath(value: string): string | null {
  if (!value.startsWith('http')) return value;
  const match = value.match(/\/proposal-files\/([^?]+)/);
  return match ? match[1] : null;
}

// Module-level cache to dedupe and reuse signed URLs across components/renders.
// Signed URLs are valid 1h; cache for 50 min to stay safely fresh.
const URL_TTL_MS = 50 * 60 * 1000;
const urlCache = new Map<string, { url: string; expiresAt: number }>();
const inflight = new Map<string, Promise<string | null>>();

function getCachedUrl(path: string): string | null {
  const hit = urlCache.get(path);
  if (hit && hit.expiresAt > Date.now()) return hit.url;
  if (hit) urlCache.delete(path);
  return null;
}

function fetchSignedUrl(path: string): Promise<string | null> {
  const existing = inflight.get(path);
  if (existing) return existing;
  const p = getProposalFileSignedUrl(path, 3600).then(({ url }) => {
    inflight.delete(path);
    if (url) urlCache.set(path, { url, expiresAt: Date.now() + URL_TTL_MS });
    return url || null;
  }).catch(() => {
    inflight.delete(path);
    return null;
  });
  inflight.set(path, p);
  return p;
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
  const cached = getCachedUrl(path);
  if (cached) return cached;
  const url = await fetchSignedUrl(path);
  return url || storedValue;
}

/**
 * Compute the initial/synchronous value for a stored path.
 * Returns the value directly for data URIs, blob URLs, regular http URLs,
 * and cached signed URLs that don't need fresh async resolution.
 */
function getInitialUrl(storedValue: string | null | undefined): string | null {
  if (!storedValue) return null;
  if (!isStoragePath(storedValue)) return storedValue;
  const path = extractStoragePath(storedValue);
  if (!path) return storedValue;
  return getCachedUrl(path); // null if not cached, triggers async fetch
}

/**
 * Hook that resolves a storage file path or expired signed URL to a fresh signed URL.
 * Uses a module-level cache so the same logo path resolves instantly across renders/components
 * once it has been fetched once (signed URLs cached for 50 min).
 */
export function useStorageUrl(storedValue: string | null | undefined): string | null {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(() => getInitialUrl(storedValue));

  useEffect(() => {
    if (!storedValue) {
      setResolvedUrl(null);
      return;
    }

    const initial = getInitialUrl(storedValue);
    if (initial !== null) {
      setResolvedUrl(initial);
      return;
    }

    const path = extractStoragePath(storedValue);
    if (!path) {
      setResolvedUrl(storedValue);
      return;
    }

    let cancelled = false;
    fetchSignedUrl(path).then((url) => {
      if (!cancelled) setResolvedUrl(url || storedValue);
    });

    return () => { cancelled = true; };
  }, [storedValue]);

  return resolvedUrl;
}
