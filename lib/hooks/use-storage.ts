'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { storageApi } from '@/lib/storage/client';
import { isSafeStoragePath } from '@/lib/storage/names';
import type { StorageBucket, StorageFile, StorageFolder } from '@/lib/storage/types';

export interface StorageLocation {
  /** '' = the list of buckets. */
  bucket: string;
  /** Path inside the bucket; '' = its root. */
  folder: string;
}

/**
 * The media manager's open folder, kept in the URL (?bucket=…&folder=…) so a
 * refresh, a shared link or the browser's Back button all land where you were.
 * pushState is synced with useSearchParams by the Next.js router, with no
 * server round trip.
 */
export function useStorageLocation() {
  const params = useSearchParams();
  const bucket = params.get('bucket') ?? '';
  const rawFolder = bucket ? (params.get('folder') ?? '') : '';
  const folder = isSafeStoragePath(rawFolder) ? rawFolder : '';

  const location = useMemo<StorageLocation>(() => ({ bucket, folder }), [bucket, folder]);

  const navigate = useCallback((next: StorageLocation) => {
    const search = new URLSearchParams(window.location.search);
    if (next.bucket) search.set('bucket', next.bucket);
    else search.delete('bucket');
    if (next.bucket && next.folder) search.set('folder', next.folder);
    else search.delete('folder');
    const query = search.toString();
    window.history.pushState(null, '', query ? `?${query}` : window.location.pathname);
  }, []);

  return { location, navigate };
}

/** Every storage bucket. Keeps the last list on screen while reloading. */
export function useStorageBuckets() {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{ version: number; buckets: StorageBucket[] | null; error: string | null } | null>(null);

  useEffect(() => {
    let active = true;
    storageApi
      .buckets()
      .then((buckets) => active && setState({ version, buckets, error: null }))
      .catch((err: unknown) =>
        active &&
        setState((prev) => ({
          version,
          buckets: prev?.buckets ?? null,
          error: err instanceof Error ? err.message : 'Could not load buckets',
        })),
      );
    return () => {
      active = false;
    };
  }, [version]);

  return {
    buckets: state?.buckets ?? null,
    loading: state?.version !== version,
    error: state?.version === version ? state.error : null,
    reload: useCallback(() => setVersion((v) => v + 1), []),
  };
}

interface ListingState {
  /** Which folder this is (bucket/folder) and which load of it (`version`). */
  place: string;
  version: string;
  folders: StorageFolder[];
  files: StorageFile[];
  nextCursor: string | null;
  error: string | null;
}

/**
 * One folder's contents, a page at a time. Changing `refreshKey` reloads the
 * folder in the background, keeping its current contents on screen.
 */
export function useStorageListing(location: StorageLocation, refreshKey: number) {
  const { bucket, folder } = location;
  const place = bucket ? `${bucket}/${folder}` : '';
  const [localVersion, setLocalVersion] = useState(0);
  const version = `${refreshKey}:${localVersion}`;
  const [state, setState] = useState<ListingState | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!place) return;
    let active = true;
    storageApi
      .list(bucket, folder)
      .then((listing) => active && setState({ place, version, ...listing, error: null }))
      .catch((err: unknown) =>
        active &&
        setState({
          place,
          version,
          folders: [],
          files: [],
          nextCursor: null,
          error: err instanceof Error ? err.message : 'Could not open this folder',
        }),
      );
    return () => {
      active = false;
    };
  }, [place, version, bucket, folder]);

  const current = state && state.place === place ? state : null;

  const loadMore = async () => {
    if (!current?.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await storageApi.list(bucket, folder, current.nextCursor);
      setState((prev) =>
        prev && prev.place === place
          ? { ...prev, folders: [...prev.folders, ...next.folders], files: [...prev.files, ...next.files], nextCursor: next.nextCursor }
          : prev,
      );
    } catch (err) {
      setState((prev) => (prev && prev.place === place ? { ...prev, error: err instanceof Error ? err.message : 'Could not load more' } : prev));
    } finally {
      setLoadingMore(false);
    }
  };

  return {
    folders: current?.folders ?? [],
    files: current?.files ?? [],
    hasMore: Boolean(current?.nextCursor),
    error: current?.error ?? null,
    /** Nothing to show yet for this folder. */
    loading: Boolean(place) && !current,
    /** Showing this folder's contents while a fresh copy loads. */
    refreshing: Boolean(current) && current!.version !== version,
    loadingMore,
    loadMore,
    reload: useCallback(() => setLocalVersion((v) => v + 1), []),
  };
}
