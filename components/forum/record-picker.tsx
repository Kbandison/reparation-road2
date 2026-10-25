'use client';

import { useState } from 'react';
import { X, Search, Loader2, FileText } from 'lucide-react';
import { getRecordTitle } from '@/lib/collections/helpers';
import type { ForumAttachedRecord } from '@/lib/types';

interface SearchResult {
  id: string;
  slug?: string;
  title: string;
  collectionSlug: string;
  collectionName: string;
}

/** One collection's matches, as /api/collection-search returns them. */
interface SearchGroup {
  collectionSlug: string;
  collectionName: string;
  /** Members-only for this viewer: a count, no records. */
  locked?: 'login' | 'subscribe';
  total: number;
  records: { id: string; slug?: string; matchValue: string; displayFields: Record<string, string> }[];
}

const MAX_RESULTS = 20;
/** So one large collection can't fill the whole list. */
const PER_COLLECTION = 5;

/** The search's collection groups as one list of records the user can open and attach. */
function toResults(groups: SearchGroup[]): SearchResult[] {
  return groups
    .filter((g) => !g.locked)
    .flatMap((g) =>
      g.records.slice(0, PER_COLLECTION).map((r) => ({
        id: r.id,
        slug: r.slug,
        // Display fields are the collection's display columns, in order.
        title: getRecordTitle(r.displayFields ?? {}, Object.keys(r.displayFields ?? {})) || r.matchValue,
        collectionSlug: g.collectionSlug,
        collectionName: g.collectionName,
      })),
    )
    .slice(0, MAX_RESULTS);
}

interface Props {
  onPick: (record: ForumAttachedRecord) => void;
  onClose: () => void;
}

export function RecordPicker({ onPick, onClose }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  // Matches in members-only collections this user can't open (and so can't attach).
  const [lockedMatches, setLockedMatches] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (query.length < 2) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/collection-search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      const groups: SearchGroup[] = Array.isArray(data.records) ? data.records : [];
      setResults(toResults(groups));
      setLockedMatches(groups.filter((g) => g.locked).reduce((n, g) => n + g.total, 0));
    } catch {
      setResults([]);
      setLockedMatches(0);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-brand-bg border border-brand-gold/[0.12] rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-brand-gold/[0.08]">
          <h2 className="font-display text-lg font-semibold text-brand-cream">Attach an archive record</h2>
          <button onClick={onClose} className="text-brand-muted hover:text-brand-cream" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={search} className="px-5 py-4 border-b border-brand-gold/[0.06]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search records by name…"
              className="w-full rounded-xl border border-brand-gold/[0.15] bg-brand-bg/60 pl-9 pr-3 py-2 text-sm text-brand-cream placeholder:text-brand-muted/60 focus:border-brand-gold/40 focus:outline-none"
            />
          </div>
        </form>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-brand-muted px-2 py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Searching…
            </div>
          ) : results.length === 0 ? (
            <p className="text-sm text-brand-muted text-center py-6">
              {!searched
                ? 'Search the archive to attach a record to your post.'
                : lockedMatches > 0
                  ? `No matches you can open. ${lockedMatches.toLocaleString()} are in members-only collections.`
                  : 'No records found.'}
            </p>
          ) : (
            <div className="space-y-1">
              {results.map((r) => (
                <button
                  key={`${r.collectionSlug}-${r.id}`}
                  onClick={() =>
                    onPick({
                      collection_slug: r.collectionSlug,
                      record_id: r.slug || r.id,
                      title: r.title,
                    })
                  }
                  className="flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-xl hover:bg-brand-card transition-colors"
                >
                  <FileText className="w-4 h-4 text-brand-gold shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-brand-cream truncate">{r.title}</p>
                    <p className="text-xs text-brand-muted truncate">{r.collectionName}</p>
                  </div>
                </button>
              ))}
              {lockedMatches > 0 && (
                <p className="px-3 pt-2 text-[11px] text-brand-muted">
                  {lockedMatches.toLocaleString()} more match{lockedMatches === 1 ? '' : 'es'} in members-only collections.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
