'use client';

import { useState } from 'react';
import { X, Search, Loader2, FileText } from 'lucide-react';
import type { ForumAttachedRecord } from '@/lib/types';

interface SearchResult {
  id: string;
  slug?: string;
  title: string;
  collectionSlug: string;
  collectionName: string;
}

interface Props {
  onPick: (record: ForumAttachedRecord) => void;
  onClose: () => void;
}

export function RecordPicker({ onPick, onClose }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
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
      setResults(Array.isArray(data.records) ? data.records.slice(0, 20) : []);
    } catch {
      setResults([]);
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
              {searched ? 'No records found.' : 'Search the archive to attach a record to your post.'}
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
