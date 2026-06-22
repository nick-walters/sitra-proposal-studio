import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getProposalFileSignedUrl } from '@/lib/proposalStorage';

type StorageBucket = 'proposal-files' | 'participant-logos';

interface ResolvedPath {
  bucket: StorageBucket;
  path: string;
}

/**
 * Determines if a stored URL/path needs a fresh signed URL.
 * File paths (no protocol) and any URL pointing at a private bucket need refreshing.
 */
export function isStoragePath(value: string): boolean {
  if (value.startsWith('data:') || value.startsWith('blob:')) return false;
  if (!value.startsWith('http')) return true;
  // Any URL referencing a private bucket (or one we now treat as private) needs resolution.
  if (value.includes('/proposal-files/')) return true;
  if (value.includes('/participant-logos/')) return true;
  return false;
}

/**
 * Resolves a stored value (raw path or full URL) to a {bucket, path} pair.
 * Raw paths default to 'proposal-files' unless they start with a known
 * participant-logos prefix ('logos/' or 'registry/').
 */
function resolveStoragePath(value: string): ResolvedPath | null {
  if (!value.startsWith('http')) {
    if (value.startsWith('logos/') || value.startsWith('registry/')) {
      return { bucket: 'participant-logos', path: value };
    }
    return { bucket: 'proposal-files', path: value };
  }
  const noQuery = value.split('?')[0];
  const partMatch = noQuery.match(/\/participant-logos\/(.+)$/);
  if (partMatch) return { bucket: 'participant-logos', path: partMatch[1] };
  const propMatch = noQuery.match(/\/proposal-files\/(.+)$/);
  if (propMatch) return { bucket: 'proposal-files', path: propMatch[1] };
  return null;
}

// Module-level cache to dedupe and reuse signed URLs across components/renders.
// Signed URLs are valid 1h; cache for 50 min to stay safely fresh.
const URL_TTL_MS = 50 * 60 * 1000;
const urlCache = new Map<string, { url: string; expiresAt: number }>();
const inflight = new Map<string, Promise<string | null>>();

function cacheKey(bucket: StorageBucket, path: string): string {
  return `${bucket}:${path}`;
}

function getCachedUrl(bucket: StorageBucket, path: string): string | null {
  const key = cacheKey(bucket, path);
  const hit = urlCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.url;
  if (hit) urlCache.delete(key);
  return null;
}

async function createSignedUrl(bucket: StorageBucket, path: string): Promise<string | null> {
  if (bucket === 'proposal-files') {
    const { url } = await getProposalFileSignedUrl(path, 3600);
    return url || null;
  }
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

function fetchSignedUrl(bucket: StorageBucket, path: string): Promise<string | null> {
  const key = cacheKey(bucket, path);
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = createSignedUrl(bucket, path)
    .then((url) => {
      inflight.delete(key);
      if (url) urlCache.set(key, { url, expiresAt: Date.now() + URL_TTL_MS });
      return url;
    })
    .catch(() => {
      inflight.delete(key);
      return null;
    });
  inflight.set(key, p);
  return p;
}

/**
 * Non-hook async function to resolve a stored path/URL to a fresh signed URL.
 */
export async function resolveStorageUrl(storedValue: string | null | undefined): Promise<string | null> {
  if (!storedValue) return null;
  if (!isStoragePath(storedValue)) return storedValue;
  const resolved = resolveStoragePath(storedValue);
  if (!resolved) return storedValue;
  const cached = getCachedUrl(resolved.bucket, resolved.path);
  if (cached) return cached;
  const url = await fetchSignedUrl(resolved.bucket, resolved.path);
  return url || storedValue;
}

function getInitialUrl(storedValue: string | null | undefined): string | null {
  if (!storedValue) return null;
  if (!isStoragePath(storedValue)) return storedValue;
  const resolved = resolveStoragePath(storedValue);
  if (!resolved) return storedValue;
  return getCachedUrl(resolved.bucket, resolved.path);
}

/**
 * Hook that resolves a storage file path or expired signed URL to a fresh signed URL.
 * Supports both 'proposal-files' and 'participant-logos' buckets.
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

    const resolved = resolveStoragePath(storedValue);
    if (!resolved) {
      setResolvedUrl(storedValue);
      return;
    }

    let cancelled = false;
    fetchSignedUrl(resolved.bucket, resolved.path).then((url) => {
      if (!cancelled) setResolvedUrl(url || storedValue);
    });

    return () => { cancelled = true; };
  }, [storedValue]);

  return resolvedUrl;
}
