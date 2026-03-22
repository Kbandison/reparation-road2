'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Star, Sparkles } from 'lucide-react';
import type { RelatedRecordsResponse, RelatedRecord } from '@/lib/types';

interface ModalRelatedRecordsProps {
  recordId: string;
  tableName: string;
  collectionSlug: string;
  onNavigate: (collectionSlug: string, recordId: string) => void;
}

export function ModalRelatedRecords({
  recordId,
  tableName,
  collectionSlug,
  onNavigate,
}: ModalRelatedRecordsProps) {
  const [data, setData] = useState<RelatedRecordsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);

    fetch(
      `/api/related-records?recordId=${encodeURIComponent(recordId)}&tableName=${encodeURIComponent(tableName)}&collectionSlug=${encodeURIComponent(collectionSlug)}`
    )
      .then((r) => r.json())
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setData({ curated: [], algorithmic: [] });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [recordId, tableName, collectionSlug]);

  // No results state
  if (!loading && data && data.curated.length === 0 && data.algorithmic.length === 0) {
    return null;
  }

  const totalCount = (data?.curated.length || 0) + (data?.algorithmic.length || 0);

  return (
    <div className="border-t border-brand-gold/[0.08]">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-brand-card/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {collapsed ? (
            <ChevronRight className="w-4 h-4 text-brand-muted" />
          ) : (
            <ChevronDown className="w-4 h-4 text-brand-muted" />
          )}
          <p className="text-[11px] text-brand-muted font-medium uppercase tracking-wide">
            Related Records
            {!loading && totalCount > 0 && (
              <span className="ml-1.5 text-brand-gold">({totalCount})</span>
            )}
          </p>
        </div>
      </button>

      {!collapsed && (
        <div className="px-5 pb-4">
          {loading ? (
            <div className="space-y-2.5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 rounded-xl bg-brand-card animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              {/* Curated records first */}
              {data?.curated.map((rel) => (
                <CuratedItem
                  key={rel.id}
                  rel={rel}
                  currentRecordId={recordId}
                  onNavigate={onNavigate}
                />
              ))}

              {/* Algorithmic matches */}
              {data?.algorithmic.map((match) => (
                <button
                  key={`${match.collectionSlug}-${match.id}`}
                  onClick={() => onNavigate(match.collectionSlug, match.slug)}
                  className="w-full flex items-start gap-3 py-2.5 px-3 rounded-xl hover:bg-brand-card transition-colors text-left group"
                >
                  <Sparkles className="w-3.5 h-3.5 text-brand-muted mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-brand-cream group-hover:text-brand-gold transition-colors truncate">
                      {match.name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-xs text-brand-muted">{match.collectionName}</span>
                      {match.matchReasons.map((reason) => (
                        <span
                          key={reason}
                          className="text-[10px] px-1.5 py-0.5 rounded-md bg-brand-sage/10 text-brand-sage"
                        >
                          {reason}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CuratedItem({
  rel,
  currentRecordId,
  onNavigate,
}: {
  rel: RelatedRecord;
  currentRecordId: string;
  onNavigate: (collectionSlug: string, recordId: string) => void;
}) {
  const isSource = rel.source_record_id === currentRecordId;
  const targetSlug = isSource ? rel.target_collection_slug : rel.source_collection_slug;
  const targetId = isSource ? rel.target_record_id : rel.source_record_id;
  const targetName = isSource ? rel.target_name : rel.source_name;
  const targetCollection = isSource ? rel.target_collection : rel.source_collection;

  return (
    <button
      onClick={() => onNavigate(targetSlug, targetId)}
      className="w-full flex items-start gap-3 py-2.5 px-3 rounded-xl border-l-2 border-brand-gold/30 hover:bg-brand-card transition-colors text-left group"
    >
      <Star className="w-3.5 h-3.5 text-brand-gold mt-0.5 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm text-brand-cream group-hover:text-brand-gold transition-colors truncate">
            {targetName || 'Related Record'}
          </p>
          {rel.is_featured && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-brand-gold/10 text-brand-gold font-medium">
              Featured
            </span>
          )}
        </div>
        <p className="text-xs text-brand-muted mt-0.5">
          {targetCollection}
          {rel.relationship_type && ` · ${rel.relationship_type}`}
        </p>
        {rel.relationship_note && (
          <p className="text-xs text-brand-muted/70 mt-0.5">{rel.relationship_note}</p>
        )}
      </div>
    </button>
  );
}
