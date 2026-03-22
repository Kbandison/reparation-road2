import Link from 'next/link';
import { ChevronRight, Clock } from 'lucide-react';
import type { Collection } from '@/lib/types';
import { formatNumber, snakeCaseToTitleCase } from '@/lib/utils/format';
import { getCategoryColor } from '@/lib/collections/helpers';

interface SubcollectionGridProps {
  children: Collection[];
  parentSlugs?: Set<string>;
}

export function SubcollectionGrid({ children, parentSlugs }: SubcollectionGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {children.map((child) => {
        const hasData = !!child.table_name;
        const hasChildren = parentSlugs?.has(child.slug);
        const comingSoon = !hasData && !hasChildren && child.record_count === 0;

        return (
          <Link
            key={child.id}
            href={`/collection/${child.slug}`}
            className="group bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-5 hover:border-brand-gold/25 hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="font-display text-sm font-semibold text-brand-cream group-hover:text-brand-gold transition-colors">
                {child.name}
              </p>
              {child.short_description && (
                <p className="text-xs text-brand-muted mt-1.5 line-clamp-2 leading-relaxed">
                  {child.short_description}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {child.record_count > 0 && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-card-hover text-brand-cream-muted font-medium">
                    {formatNumber(child.record_count)} records
                  </span>
                )}
                {child.era && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-muted/10 text-brand-muted">
                    {snakeCaseToTitleCase(child.era)}
                  </span>
                )}
                {child.has_images && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-muted/10 text-brand-muted">
                    Images
                  </span>
                )}
                {comingSoon && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-gold/10 text-brand-gold flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Coming Soon
                  </span>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-brand-muted group-hover:text-brand-gold flex-shrink-0 transition-colors" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
