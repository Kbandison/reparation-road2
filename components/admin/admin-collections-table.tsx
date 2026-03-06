'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  ChevronRight,
  ChevronDown,
  FolderOpen,
  FileText,
} from 'lucide-react';
import { snakeCaseToTitleCase, formatNumber } from '@/lib/utils/format';
import type { Collection } from '@/lib/types';

interface AdminCollectionsTableProps {
  collections: Collection[];
}

export function AdminCollectionsTable({ collections }: AdminCollectionsTableProps) {
  const router = useRouter();
  const supabase = createClient();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Separate parents and standalone from children
  const parents = collections.filter((c) => !c.table_name && !c.parent_slug);
  const standalone = collections.filter((c) => c.table_name && !c.parent_slug);
  const childrenMap = new Map<string, Collection[]>();
  collections.forEach((c) => {
    if (c.parent_slug) {
      const arr = childrenMap.get(c.parent_slug) || [];
      arr.push(c);
      childrenMap.set(c.parent_slug, arr);
    }
  });

  const toggleExpand = (slug: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const handleRowClick = (col: Collection) => {
    if (col.table_name) {
      router.push(`/admin/collections/${col.slug}`);
    } else {
      toggleExpand(col.slug);
    }
  };

  const togglePublished = async (col: Collection) => {
    await supabase
      .from('collections')
      .update({ is_published: !col.is_published })
      .eq('id', col.id);
    router.refresh();
  };

  const cycleAccessTier = async (col: Collection) => {
    const tiers: Array<'free' | 'explorer' | 'scholar'> = ['free', 'explorer', 'scholar'];
    const currentIdx = tiers.indexOf(col.access_tier);
    const nextTier = tiers[(currentIdx + 1) % tiers.length];
    await supabase
      .from('collections')
      .update({ access_tier: nextTier })
      .eq('id', col.id);
    router.refresh();
  };

  const renderRow = (col: Collection, indent: boolean = false) => {
    const children = childrenMap.get(col.slug);
    const isParent = !col.table_name;
    const isExpanded = expanded.has(col.slug);
    const hasChildren = children && children.length > 0;

    return (
      <tr
        key={col.id}
        onClick={() => handleRowClick(col)}
        className="border-b border-brand-gold/[0.04] hover:bg-brand-card-hover/50 transition-colors cursor-pointer"
      >
        {/* Name */}
        <td className="py-3 px-4 text-sm text-brand-cream font-medium">
          <div className={`flex items-center gap-2 ${indent ? 'pl-8' : ''}`}>
            {isParent && hasChildren ? (
              <span className="p-0.5">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-brand-muted" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-brand-muted" />
                )}
              </span>
            ) : (
              <span className="w-5" />
            )}
            {isParent ? (
              <FolderOpen className="w-4 h-4 text-brand-gold flex-shrink-0" />
            ) : (
              <FileText className="w-4 h-4 text-brand-muted flex-shrink-0" />
            )}
            <span className="truncate max-w-[300px]">{col.name}</span>
          </div>
        </td>

        {/* Category */}
        <td className="py-3 px-4 text-sm text-brand-muted">
          {snakeCaseToTitleCase(col.category)}
        </td>

        {/* Records */}
        <td className="py-3 px-4 text-sm text-brand-cream">
          {formatNumber(col.record_count)}
        </td>

        {/* Published */}
        <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => togglePublished(col)}>
            <span
              className={`text-xs px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                col.is_published
                  ? 'bg-brand-sage/10 text-brand-sage hover:bg-brand-sage/20'
                  : 'bg-brand-muted/10 text-brand-muted hover:bg-brand-muted/20'
              }`}
            >
              {col.is_published ? 'Published' : 'Draft'}
            </span>
          </button>
        </td>

        {/* Access */}
        <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => cycleAccessTier(col)}>
            <span
              className={`text-xs px-2 py-0.5 rounded-full cursor-pointer transition-colors capitalize ${
                col.access_tier === 'free'
                  ? 'bg-brand-sage/10 text-brand-sage hover:bg-brand-sage/20'
                  : 'bg-brand-gold/10 text-brand-gold hover:bg-brand-gold/20'
              }`}
            >
              {col.access_tier}
            </span>
          </button>
        </td>

        {/* Display Type */}
        <td className="py-3 px-4 text-xs text-brand-muted capitalize">
          {col.display_type}
        </td>
      </tr>
    );
  };

  return (
    <div className="overflow-x-auto bg-brand-card border border-brand-gold/[0.08] rounded-2xl">
      <table className="w-full">
        <thead>
          <tr className="border-b border-brand-gold/[0.08]">
            <th className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">
              Name
            </th>
            <th className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">
              Category
            </th>
            <th className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">
              Records
            </th>
            <th className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">
              Published
            </th>
            <th className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">
              Access
            </th>
            <th className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">
              Type
            </th>
          </tr>
        </thead>
        <tbody>
          {parents.map((parent) => {
            const children = childrenMap.get(parent.slug) || [];
            const isExpanded = expanded.has(parent.slug);
            return [
              renderRow(parent),
              ...(isExpanded
                ? children.map((child) => renderRow(child, true))
                : []),
            ];
          })}
          {standalone.map((col) => renderRow(col))}
        </tbody>
      </table>
    </div>
  );
}
