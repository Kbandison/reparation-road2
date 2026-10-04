'use client';

import { useEffect, useState } from 'react';
import { storageApi } from '@/lib/storage/client';
import type { StorageReferenceSummary, StorageTargetKind } from '@/lib/storage/types';

interface Result {
  key: string;
  summary: StorageReferenceSummary | null;
  error: string | null;
}

/**
 * Which collection records link to a file, folder or bucket. Results are kept
 * with the target they belong to, so switching targets never shows the
 * previous one's counts while the new ones load.
 */
export function useStorageReferences(
  target: { bucket: string; path: string; kind: StorageTargetKind } | null,
) {
  const bucket = target?.bucket ?? '';
  const path = target?.path ?? '';
  const kind = target?.kind ?? null;
  const key = kind ? `${kind}:${bucket}/${path}` : null;

  const [result, setResult] = useState<Result | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!key || !kind) return;
    let active = true;
    storageApi
      .references(bucket, path, kind)
      .then((summary) => active && setResult({ key, summary, error: null }))
      .catch((err: unknown) =>
        active && setResult({ key, summary: null, error: err instanceof Error ? err.message : 'Could not check links' }),
      );
    return () => {
      active = false;
    };
  }, [key, kind, bucket, path, attempt]);

  const current = result && result.key === key ? result : null;
  return {
    loading: Boolean(key) && !current,
    summary: current?.summary ?? null,
    error: current?.error ?? null,
    retry: () => {
      setResult(null);
      setAttempt((n) => n + 1);
    },
  };
}
