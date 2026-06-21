'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Star, Sparkles } from 'lucide-react';
import type { RelatedRecordsResponse, RelatedRecord, AlgorithmicMatch } from '@/lib/types';

// The endpoint also reports which matcher produced the algorithmic list.
type RelatedResponse = RelatedRecordsResponse & {
  mode?: 'ai' | 'algorithmic';
  source?: 'ai' | 'pending' | 'algorithmic';
};

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
  const [data, setData] = useState<RelatedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refining, setRefining] = useState(false);
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async (attempt: number) => {
      if (attempt === 0) {
        setLoading(true);
        setRefining(false);
        setData(null);
      }
      try {
        const res = await fetch(
          `/api/related-records?recordId=${encodeURIComponent(recordId)}&tableName=${encodeURIComponent(tableName)}&collectionSlug=${encodeURIComponent(collectionSlug)}`,
        );
        const json = await res.json();
        if (cancelled) return;
        setData(json);
        // 'pending' means AI is computing in the background; poll a few times so
        // the matches appear without the user reopening the record.
        if (json.source === 'pending' && attempt < 3) {
          setRefining(true);
          timer = setTimeout(() => load(attempt + 1), 9000);
        } else {
          setRefining(false);
        }
      } catch {
        if (!cancelled) {
          setData({ curated: [], algorithmic: [] });
          setRefining(false);
        }
      } finally {
        if (!cancelled && attempt === 0) setLoading(false);
      }
    };

    load(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [recordId, tableName, collectionSlug]);

  // No results state — but keep the section while AI is still computing.
  if (!loading && !refining && data && data.curated.length === 0 && data.algorithmic.length === 0) {
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
          {refining && (
            <span className="flex items-center gap-1 text-[10px] text-brand-gold/80">
              <Sparkles className="w-3 h-3 animate-pulse" />
              Finding more with AI…
            </span>
          )}
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

              {/* Algorithmic / AI matches */}
              {data?.algorithmic.map((match) => (
                <AlgorithmicItem
                  key={`${match.collectionSlug}-${match.id}`}
                  match={match}
                  isAi={data?.mode === 'ai'}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AlgorithmicItem({
  match,
  isAi,
  onNavigate,
}: {
  match: AlgorithmicMatch;
  isAi: boolean;
  onNavigate: (collectionSlug: string, recordId: string) => void;
}) {
  // In AI mode, score is a 0–100 confidence and matchReasons = [type, reason].
  const [typeLabel, ...rest] = match.matchReasons;
  const reasoning = rest.join(' ');
  const confidence = Math.max(0, Math.min(100, Math.round(match.score)));
  const confidenceClass =
    confidence >= 80
      ? 'bg-brand-sage/15 text-brand-sage'
      : confidence >= 60
        ? 'bg-brand-gold/15 text-brand-gold'
        : 'bg-brand-muted/15 text-brand-muted';

  return (
    <button
      onClick={() => onNavigate(match.collectionSlug, match.slug)}
      className="w-full flex items-start gap-3 py-2.5 px-3 rounded-xl hover:bg-brand-card transition-colors text-left group"
    >
      <Sparkles
        className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${isAi ? 'text-brand-gold' : 'text-brand-muted'}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm text-brand-cream group-hover:text-brand-gold transition-colors truncate">
            {match.name}
          </p>
          {isAi && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-brand-gold/15 text-brand-gold font-semibold uppercase tracking-wide flex-shrink-0">
              AI
            </span>
          )}
        </div>

        {isAi ? (
          <>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-xs text-brand-muted">{match.collectionName}</span>
              {typeLabel && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-brand-sage/10 text-brand-sage">
                  {typeLabel}
                </span>
              )}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${confidenceClass}`}>
                {confidence}% match
              </span>
            </div>
            {reasoning && (
              <p className="text-[11px] text-brand-muted/70 mt-0.5 line-clamp-2">{reasoning}</p>
            )}
          </>
        ) : (
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
        )}
      </div>
    </button>
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
