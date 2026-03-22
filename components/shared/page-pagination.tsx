import Link from 'next/link';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PagePaginationProps {
  currentPage: number;
  totalPages: number;
  buildHref: (page: number) => string;
}

function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | '...')[] = [1];

  if (current > 3) pages.push('...');

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) pages.push('...');

  pages.push(total);

  return pages;
}

export function PagePagination({ currentPage, totalPages, buildHref }: PagePaginationProps) {
  if (totalPages <= 1) return null;

  const pages = getPageNumbers(currentPage, totalPages);

  return (
    <div className="flex items-center justify-center gap-1.5 mt-8">
      {/* First page */}
      {currentPage > 2 && (
        <Link
          href={buildHref(1)}
          className="p-2 rounded-lg text-brand-muted hover:text-brand-cream hover:bg-brand-card transition-colors"
          title="First page"
        >
          <ChevronsLeft className="w-4 h-4" />
        </Link>
      )}

      {/* Previous */}
      {currentPage > 1 ? (
        <Link
          href={buildHref(currentPage - 1)}
          className="p-2 rounded-lg text-brand-muted hover:text-brand-cream hover:bg-brand-card transition-colors"
          title="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </Link>
      ) : (
        <span className="p-2 rounded-lg text-brand-muted/30">
          <ChevronLeft className="w-4 h-4" />
        </span>
      )}

      {/* Page numbers */}
      {pages.map((p, idx) =>
        p === '...' ? (
          <span key={`ellipsis-${idx}`} className="px-1 text-brand-muted/50 text-sm">
            ...
          </span>
        ) : (
          <Link
            key={p}
            href={buildHref(p)}
            className={`min-w-[36px] h-9 flex items-center justify-center rounded-lg text-sm font-medium transition-colors ${
              p === currentPage
                ? 'bg-brand-gold/15 text-brand-gold border border-brand-gold/25'
                : 'text-brand-muted hover:text-brand-cream hover:bg-brand-card'
            }`}
          >
            {p}
          </Link>
        )
      )}

      {/* Next */}
      {currentPage < totalPages ? (
        <Link
          href={buildHref(currentPage + 1)}
          className="p-2 rounded-lg text-brand-muted hover:text-brand-cream hover:bg-brand-card transition-colors"
          title="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </Link>
      ) : (
        <span className="p-2 rounded-lg text-brand-muted/30">
          <ChevronRight className="w-4 h-4" />
        </span>
      )}

      {/* Last page */}
      {currentPage < totalPages - 1 && (
        <Link
          href={buildHref(totalPages)}
          className="p-2 rounded-lg text-brand-muted hover:text-brand-cream hover:bg-brand-card transition-colors"
          title="Last page"
        >
          <ChevronsRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}
