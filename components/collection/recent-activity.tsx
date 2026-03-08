'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Clock,
  Library,
  FolderOpen,
  FileText,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useRecentActivity, type ActivityItem } from '@/lib/hooks/use-activity';

function getIcon(type: ActivityItem['type']) {
  switch (type) {
    case 'collection':
      return Library;
    case 'subcollection':
      return FolderOpen;
    case 'record':
      return FileText;
  }
}

function getHref(item: ActivityItem) {
  switch (item.type) {
    case 'collection':
    case 'subcollection':
      return `/collection/${item.slug}`;
    case 'record':
      return `/collection/${item.collectionSlug}/${item.slug}`;
  }
}

function getLabel(type: ActivityItem['type']) {
  switch (type) {
    case 'collection':
      return 'Collection';
    case 'subcollection':
      return 'Subcollection';
    case 'record':
      return 'Record';
  }
}

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function RecentActivity() {
  const { items, clearActivity } = useRecentActivity();
  const [showAll, setShowAll] = useState(false);

  if (items.length === 0) return null;

  const displayItems = showAll ? items.slice(0, 20) : items.slice(0, 8);

  return (
    <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl overflow-hidden sticky top-20">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-brand-gold/[0.06]">
        <Clock className="w-4 h-4 text-brand-gold" />
        <h3 className="font-display text-sm font-semibold text-brand-cream">
          Recent Activity
        </h3>
      </div>

      {/* Items */}
      <div className="divide-y divide-brand-gold/[0.04] max-h-[calc(100vh-14rem)] overflow-y-auto">
        {displayItems.map((item, idx) => {
          const Icon = getIcon(item.type);
          return (
            <Link
              key={`${item.type}-${item.slug}-${idx}`}
              href={getHref(item)}
              className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-brand-card-hover/50 transition-colors group"
            >
              <Icon className="w-3.5 h-3.5 text-brand-muted mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-brand-cream leading-tight truncate group-hover:text-brand-gold transition-colors">
                  {item.name}
                </p>
                <p className="text-[11px] text-brand-muted leading-tight mt-0.5">
                  {getLabel(item.type)}
                  {item.type === 'record' && item.collectionName && (
                    <> in {item.collectionName}</>
                  )}
                  {item.type === 'subcollection' && item.parentName && (
                    <> in {item.parentName}</>
                  )}
                  <span className="ml-1 opacity-60">{timeAgo(item.timestamp)}</span>
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-brand-gold/[0.06]">
        {items.length > 8 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="flex items-center gap-1 text-[11px] text-brand-gold hover:text-brand-gold-light transition-colors"
          >
            {showAll ? (
              <>
                Show less <ChevronUp className="w-3 h-3" />
              </>
            ) : (
              <>
                Show more <ChevronDown className="w-3 h-3" />
              </>
            )}
          </button>
        )}
        <button
          onClick={clearActivity}
          className="flex items-center gap-1 text-[11px] text-brand-muted hover:text-brand-burgundy-light transition-colors ml-auto"
        >
          <Trash2 className="w-3 h-3" />
          Clear
        </button>
      </div>
    </div>
  );
}
