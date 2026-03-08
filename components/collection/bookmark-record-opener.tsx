'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { RecordModal } from '@/components/collection/record-modal';
import type { Collection, CollectionRecord } from '@/lib/types';

interface Props {
  collectionSlug: string;
}

export function BookmarkRecordOpener({ collectionSlug }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const recordId = searchParams.get('record');

  const [record, setRecord] = useState<CollectionRecord | null>(null);
  const [collection, setCollection] = useState<Collection | null>(null);

  useEffect(() => {
    if (!recordId) return;

    async function fetchRecord() {
      try {
        const res = await fetch(
          `/api/collection-search/record?collection=${encodeURIComponent(collectionSlug)}&id=${encodeURIComponent(recordId!)}`
        );
        const data = await res.json();
        if (data.collection && data.record) {
          setCollection(data.collection);
          setRecord(data.record);
        }
      } catch {
        // Record not found, silently ignore
      }
    }

    fetchRecord();
  }, [collectionSlug, recordId]);

  function handleClose() {
    setRecord(null);
    setCollection(null);
    // Remove the record param from the URL without a full navigation
    const params = new URLSearchParams(searchParams.toString());
    params.delete('record');
    const qs = params.toString();
    router.replace(`/collection/${collectionSlug}${qs ? `?${qs}` : ''}`, { scroll: false });
  }

  if (!record || !collection) return null;

  return (
    <RecordModal
      collection={collection}
      record={record}
      onClose={handleClose}
    />
  );
}
