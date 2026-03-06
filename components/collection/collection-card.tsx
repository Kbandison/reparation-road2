import Link from 'next/link';
import { Library, Lock, FolderOpen } from 'lucide-react';
import type { Collection } from '@/lib/types';
import { getCategoryColor } from '@/lib/collections/helpers';
import { formatNumber, snakeCaseToTitleCase } from '@/lib/utils/format';

export function CollectionCard({ collection }: { collection: Collection }) {
  const isParent = !collection.table_name;
  const isFree = collection.access_tier === 'free';

  return (
    <Link href={`/collection/${collection.slug}`}>
      <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6 hover:border-brand-gold/25 hover:-translate-y-1 transition-all duration-200 h-full flex flex-col">
        {/* Icon + Tier badge */}
        <div className="flex items-start justify-between mb-4">
          <div className="w-12 h-12 rounded-xl bg-brand-gold/10 flex items-center justify-center">
            {isParent ? (
              <FolderOpen className="w-6 h-6 text-brand-gold" />
            ) : (
              <Library className="w-6 h-6 text-brand-gold" />
            )}
          </div>
          {isFree ? (
            <span className="text-xs px-2.5 py-1 rounded-full bg-brand-sage/15 text-brand-sage font-semibold">
              FREE
            </span>
          ) : (
            <span className="text-xs px-2.5 py-1 rounded-full bg-brand-gold/10 text-brand-gold font-semibold flex items-center gap-1">
              <Lock className="w-3 h-3" />
              PREMIUM
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="font-display text-lg font-semibold text-brand-cream mb-2 line-clamp-2">
          {collection.name}
        </h3>

        {/* Description */}
        {collection.short_description && (
          <p className="font-body text-sm text-brand-muted leading-relaxed mb-4 line-clamp-2 flex-1">
            {collection.short_description}
          </p>
        )}

        {/* Badges */}
        <div className="flex flex-wrap gap-2 mt-auto">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${getCategoryColor(collection.category)}`}>
            {snakeCaseToTitleCase(collection.category)}
          </span>
          {collection.era && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-brand-muted/10 text-brand-muted font-medium">
              {snakeCaseToTitleCase(collection.era)}
            </span>
          )}
          {collection.record_count > 0 && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-brand-card-hover text-brand-cream-muted font-medium">
              {formatNumber(collection.record_count)} records
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
