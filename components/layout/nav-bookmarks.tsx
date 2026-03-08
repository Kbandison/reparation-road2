'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Bookmark, ArrowRight, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { RecordModal } from '@/components/collection/record-modal';
import { trackActivity } from '@/lib/hooks/use-activity';
import { getRecordTitle } from '@/lib/collections/helpers';
import type { Profile, Collection, CollectionRecord } from '@/lib/types';

interface NavBookmarksProps {
  profile: Profile | null;
}

interface BookmarkItem {
  id: string;
  collection_slug: string;
  record_id: string;
  record_title: string | null;
  created_at: string;
}

export function NavBookmarks({ profile }: NavBookmarksProps) {
  const [open, setOpen] = useState(false);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Modal state
  const [modalRecord, setModalRecord] = useState<CollectionRecord | null>(null);
  const [modalCollection, setModalCollection] = useState<Collection | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [open]);

  useEffect(() => {
    if (!profile) return;
    fetchCount();
  }, [profile]);

  // Re-fetch when bookmarks change anywhere in the app
  useEffect(() => {
    function handleChange() {
      setFetched(false);
      fetchCount();
    }
    window.addEventListener('bookmarks-changed', handleChange);
    return () => window.removeEventListener('bookmarks-changed', handleChange);
  }, [profile]);

  async function fetchCount() {
    if (!profile) return;
    const supabase = createClient();
    const { count: c } = await supabase
      .from('bookmarks_unified')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profile.id);
    setCount(c || 0);
  }

  async function fetchRecent() {
    if (!profile || fetched) return;
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('bookmarks_unified')
      .select('id, collection_slug, record_id, record_title, created_at')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(5);
    setBookmarks(data || []);
    setFetched(true);
    setLoading(false);
  }

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && !fetched) {
      fetchRecent();
    }
  }

  async function openBookmarkModal(bm: BookmarkItem) {
    setOpen(false);
    setModalLoading(true);
    try {
      const res = await fetch(
        `/api/collection-search/record?collection=${encodeURIComponent(bm.collection_slug)}&id=${encodeURIComponent(bm.record_id)}`
      );
      const data = await res.json();
      if (data.collection && data.record) {
        setModalCollection(data.collection);
        setModalRecord(data.record);
        trackActivity({
          type: 'record',
          slug: data.record.slug || bm.record_id,
          name: getRecordTitle(data.record, data.collection.display_columns),
          collectionSlug: data.collection.slug,
          collectionName: data.collection.name,
        });
      }
    } catch {
      // silently fail
    }
    setModalLoading(false);
  }

  if (!profile) return null;

  return (
    <>
      <div ref={ref} className="relative">
        <button
          onClick={handleToggle}
          className="relative p-2 rounded-xl text-brand-muted hover:text-brand-gold hover:bg-brand-card-hover transition-colors"
          aria-label="Bookmarks"
        >
          <Bookmark className="w-5 h-5" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-brand-gold text-brand-bg text-[10px] font-bold px-1">
              {count > 99 ? '99+' : count}
            </span>
          )}
          {modalLoading && (
            <span className="absolute -bottom-0.5 -right-0.5">
              <Loader2 className="w-3 h-3 animate-spin text-brand-gold" />
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 w-80 bg-brand-card border border-brand-gold/[0.12] rounded-xl shadow-2xl overflow-hidden z-50">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-brand-gold/[0.08]">
              <h3 className="font-display text-sm font-semibold text-brand-cream">
                Bookmarks
              </h3>
              <span className="text-xs text-brand-muted">{count} saved</span>
            </div>

            {/* List */}
            <div className="max-h-72 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-4 h-4 animate-spin text-brand-gold" />
                </div>
              ) : bookmarks.length === 0 ? (
                <div className="py-8 text-center">
                  <Bookmark className="w-6 h-6 text-brand-muted mx-auto mb-2" />
                  <p className="text-sm text-brand-muted">No bookmarks yet</p>
                  <p className="text-xs text-brand-muted mt-1">
                    Bookmark records to save them here
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-brand-gold/[0.04]">
                  {bookmarks.map((bm) => (
                    <button
                      key={bm.id}
                      onClick={() => openBookmarkModal(bm)}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-brand-card-hover/50 transition-colors group w-full text-left"
                    >
                      <Bookmark className="w-3.5 h-3.5 text-brand-gold fill-brand-gold flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-brand-cream truncate group-hover:text-brand-gold transition-colors">
                          {bm.record_title || 'Untitled Record'}
                        </p>
                        <p className="text-[11px] text-brand-muted truncate">
                          {bm.collection_slug.split('/').pop()}
                        </p>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-brand-muted group-hover:text-brand-gold flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {bookmarks.length > 0 && (
              <Link
                href="/dashboard/bookmarks"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-2 px-4 py-3 border-t border-brand-gold/[0.08] text-xs font-medium text-brand-gold hover:bg-brand-card-hover/50 transition-colors"
              >
                View all bookmarks
                <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Loading overlay */}
      {modalLoading && (
        <div className="fixed inset-0 z-[99] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-brand-card border border-brand-gold/[0.12] rounded-xl px-6 py-4 flex items-center gap-3 shadow-xl">
            <Loader2 className="w-5 h-5 animate-spin text-brand-gold" />
            <span className="text-sm text-brand-cream">Loading record...</span>
          </div>
        </div>
      )}

      {/* Record modal */}
      {modalRecord && modalCollection && (
        <RecordModal
          collection={modalCollection}
          record={modalRecord}
          onClose={() => {
            setModalRecord(null);
            setModalCollection(null);
          }}
        />
      )}
    </>
  );
}
