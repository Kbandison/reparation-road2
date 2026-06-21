import Link from 'next/link';
import { FileText } from 'lucide-react';
import type { ForumAttachedRecord } from '@/lib/types';

interface Props {
  attachedRecord?: ForumAttachedRecord | null;
  images?: string[] | null;
  // 'thumb' for the compact feed card, 'full' for the thread view.
  size?: 'thumb' | 'full';
}

export function PostAttachments({ attachedRecord, images, size = 'full' }: Props) {
  const imgs = images ?? [];
  if (!attachedRecord && imgs.length === 0) return null;

  return (
    <div className="space-y-3">
      {attachedRecord && (
        <Link
          href={`/collection/${attachedRecord.collection_slug}?record=${encodeURIComponent(attachedRecord.record_id)}`}
          className="flex items-center gap-3 rounded-xl border border-brand-gold/20 bg-brand-bg/50 px-3 py-2.5 hover:border-brand-gold/40 transition-colors"
        >
          <div className="w-9 h-9 rounded-lg bg-brand-gold/10 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4 text-brand-gold" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-brand-muted">Archive record</p>
            <p className="text-sm text-brand-cream truncate">{attachedRecord.title}</p>
          </div>
        </Link>
      )}

      {imgs.length > 0 && (
        <div
          className={
            size === 'thumb'
              ? 'flex gap-2'
              : 'grid grid-cols-2 sm:grid-cols-3 gap-2'
          }
        >
          {(size === 'thumb' ? imgs.slice(0, 4) : imgs).map((url, i) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={size === 'thumb' ? 'block' : 'block aspect-square'}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                className={
                  size === 'thumb'
                    ? 'w-16 h-16 rounded-lg object-cover border border-brand-gold/10'
                    : 'w-full h-full rounded-xl object-cover border border-brand-gold/10'
                }
              />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
