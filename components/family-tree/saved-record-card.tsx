'use client';

import { useState } from 'react';
import { ExternalLink, FileText, Loader2, X } from 'lucide-react';
import { buildImageUrl, isPdfPath } from '@/lib/collections/helpers';
import type { SavedRecordPreview } from '@/lib/family-tree/saved-records';

interface SavedRecordCardProps {
  record: SavedRecordPreview;
  onRemove: () => void;
  removing: boolean;
}

/** One archive record saved to a person: scan thumbnail, key details, open, remove. */
export function SavedRecordCard({ record, onRemove, removing }: SavedRecordCardProps) {
  const [brokenImage, setBrokenImage] = useState(false);
  const thumbnail =
    record.imagePath && !isPdfPath(record.imagePath) && !brokenImage
      ? buildImageUrl(record.imagePath, { width: 240, quality: 60 })
      : null;

  return (
    <div className="flex gap-3 rounded-xl border border-brand-sage/30 bg-brand-sage/[0.05] p-3">
      <a
        href={record.detailUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-24 w-[4.5rem] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-brand-gold/[0.12] bg-brand-bg"
        aria-label={`Open ${record.title}`}
      >
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element -- already a sized Supabase render
          <img src={thumbnail} alt="" loading="lazy" onError={() => setBrokenImage(true)} className="h-full w-full object-cover" />
        ) : (
          <FileText className="h-6 w-6 text-brand-muted" aria-hidden="true" />
        )}
      </a>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] uppercase tracking-wide text-brand-muted">{record.collectionName}</p>
        <p className="truncate text-sm font-medium text-brand-cream">{record.title}</p>
        {record.missing ? (
          <p className="mt-1 text-xs text-brand-burgundy-light">This record is no longer in the archive.</p>
        ) : (
          record.details.length > 0 && (
            <dl className="mt-1 space-y-0.5 text-xs">
              {record.details.map((d) => (
                <div key={d.label} className="flex gap-1.5">
                  <dt className="shrink-0 text-brand-muted">{d.label}:</dt>
                  <dd className="min-w-0 truncate text-brand-cream-muted">{d.value}</dd>
                </div>
              ))}
            </dl>
          )
        )}
        <div className="mt-2 flex items-center gap-3">
          {!record.missing && (
            <a
              href={record.detailUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-brand-gold hover:text-brand-gold-light"
            >
              <ExternalLink className="h-3 w-3" aria-hidden="true" /> Open record
            </a>
          )}
          <button
            type="button"
            onClick={onRemove}
            disabled={removing}
            className="ml-auto inline-flex items-center gap-1 text-xs text-brand-muted hover:text-brand-burgundy-light"
          >
            {removing ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <X className="h-3 w-3" aria-hidden="true" />}
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
