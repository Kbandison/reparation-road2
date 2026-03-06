import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { Collection } from '@/lib/types';
import { formatNumber } from '@/lib/utils/format';

interface SubcollectionGridProps {
  children: Collection[];
}

export function SubcollectionGrid({ children }: SubcollectionGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {children.map((child) => (
        <Link
          key={child.id}
          href={`/collection/${child.slug}`}
          className="group bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-5 hover:border-brand-gold/25 hover:-translate-y-1 transition-all duration-200 flex items-center justify-between"
        >
          <div className="min-w-0">
            <p className="font-display text-sm font-semibold text-brand-cream group-hover:text-brand-gold transition-colors truncate">
              {child.name}
            </p>
            {child.record_count > 0 && (
              <p className="text-xs text-brand-muted mt-1">
                {formatNumber(child.record_count)} records
              </p>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-brand-muted group-hover:text-brand-gold flex-shrink-0 ml-3 transition-colors" />
        </Link>
      ))}
    </div>
  );
}
