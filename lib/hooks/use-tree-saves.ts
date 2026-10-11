'use client';

import { useCallback, useEffect, useState } from 'react';

export interface TreeSave {
  matchId: string;
  individualId: string;
  treeId: string;
  personName: string;
  treeName: string;
}

/**
 * Who in the viewer's family trees an archive record is saved to. Results are
 * kept with the record they belong to, so paging to the next record never
 * shows the previous one's saves while loading.
 */
export function useTreeSaves(collectionSlug: string, recordId: string, enabled: boolean) {
  const key = enabled && collectionSlug && recordId ? `${collectionSlug}:${recordId}` : null;
  const [state, setState] = useState<{ key: string; saves: TreeSave[] } | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!key) return;
    let active = true;
    const params = new URLSearchParams({ collection: collectionSlug, record: recordId });
    fetch(`/api/family-tree/saved-records?${params}`)
      .then((res) => (res.ok ? res.json() : { saved: [] }))
      .then((data) => active && setState({ key, saves: data.saved ?? [] }))
      .catch(() => {
        // No note is better than a broken one; the save button still works.
      });
    return () => {
      active = false;
    };
  }, [key, version, collectionSlug, recordId]);

  return {
    saves: state?.key === key ? state.saves : [],
    refresh: useCallback(() => setVersion((v) => v + 1), []),
  };
}
