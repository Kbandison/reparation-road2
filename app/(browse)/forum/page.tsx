import Link from 'next/link';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { MessageSquare } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Community Forum',
};

function getIcon(iconName: string): LucideIcon {
  const icons = LucideIcons as unknown as Record<string, LucideIcon>;
  const key = iconName.charAt(0).toUpperCase() + iconName.slice(1);
  return icons[key] || MessageSquare;
}

export default async function ForumPage() {
  const supabase = await createClient();

  const { data: categories } = await supabase
    .from('forum_categories')
    .select('*, forum_threads(count)')
    .order('sort_order');

  if (!categories || categories.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Community" title="Forum" />
        <EmptyState
          icon={MessageSquare}
          title="Forum Coming Soon"
          description="The community forum is being set up. Check back soon!"
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Community"
        title="Forum"
        description="Connect with fellow researchers, share discoveries, and discuss history."
      />

      <div className="space-y-3">
        {categories.map((category) => {
          const Icon = getIcon(category.icon);
          const threadCount = category.forum_threads?.[0]?.count || 0;

          return (
            <Link
              key={category.id}
              href={`/forum/${category.slug}`}
              className="block bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6 hover:border-brand-gold/25 hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-brand-gold/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-brand-gold" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display text-lg font-semibold text-brand-cream mb-1">
                    {category.name}
                  </h3>
                  {category.description && (
                    <p className="text-sm text-brand-muted line-clamp-2">{category.description}</p>
                  )}
                </div>
                <span className="text-xs text-brand-muted bg-brand-card-hover px-2.5 py-1 rounded-full flex-shrink-0">
                  {threadCount} threads
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
