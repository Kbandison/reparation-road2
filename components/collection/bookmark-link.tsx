'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { RecordModal } from '@/components/collection/record-modal';
import { trackActivity } from '@/lib/hooks/use-activity';
import { getRecordTitle } from '@/lib/collections/helpers';
import type { Collection, CollectionRecord } from '@/lib/types';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface Props {
  collectionSlug: string;
  recordId: string;
  children: React.ReactNode;
  className?: string;
}

export function BookmarkLink({ collectionSlug, recordId, children, className }: Props) {
  const router = useRouter();
  const [record, setRecord] = useState<CollectionRecord | null>(null);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(
        `/api/collection-search/record?collection=${encodeURIComponent(collectionSlug)}&id=${encodeURIComponent(recordId)}`
      );
      if (res.status === 403) {
        // A bookmark from a members-only collection, saved while a member.
        toast.error('That record is in a members-only collection.', {
          action: { label: 'Membership', onClick: () => router.push('/membership') },
        });
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (data.collection && data.record) {
        setCollection(data.collection);
        setRecord(data.record);
        trackActivity({
          type: 'record',
          slug: data.record.slug || recordId,
          name: getRecordTitle(data.record, data.collection.display_columns),
          collectionSlug: data.collection.slug,
          collectionName: data.collection.name,
        });
      }
    } catch {
      // silently fail
    }
    setLoading(false);
  }

  return (
    <>
      <button onClick={handleClick} className={className} disabled={loading}>
        {loading ? (
          <div className="flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-gold" />
            <span className="text-sm text-brand-muted">Loading...</span>
          </div>
        ) : (
          children
        )}
      </button>

      {record && collection && (
        <RecordModal
          collection={collection}
          record={record}
          onClose={() => {
            setRecord(null);
            setCollection(null);
          }}
        />
      )}
    </>
  );
}
