import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-brand-muted mb-4 flex-wrap">
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;

        return (
          <span key={idx} className="flex items-center gap-1.5">
            {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-brand-muted/50 flex-shrink-0" />}
            {isLast || !item.href ? (
              <span className={isLast ? 'text-brand-cream font-medium' : ''}>
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="hover:text-brand-gold transition-colors"
              >
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
