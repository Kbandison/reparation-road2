'use client';

import { useState, useEffect } from 'react';
import { Bookmark } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/contexts/user-context';
import { toast } from 'sonner';

interface BookmarkButtonProps {
  collectionSlug: string;
  recordId: string;
  recordTitle: string;
}

export function BookmarkButton({ collectionSlug, recordId, recordTitle }: BookmarkButtonProps) {
  const { profile } = useUser();
  const [bookmarked, setBookmarked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    const supabase = createClient();
    supabase
      .from('bookmarks_unified')
      .select('id')
      .eq('user_id', profile.id)
      .eq('collection_slug', collectionSlug)
      .eq('record_id', recordId)
      .maybeSingle()
      .then(({ data }) => {
        setBookmarked(!!data);
        setLoading(false);
      });
  }, [profile, collectionSlug, recordId]);

  async function toggleBookmark() {
    if (!profile) return;
    const supabase = createClient();

    setBookmarked(!bookmarked);

    if (bookmarked) {
      const { error } = await supabase
        .from('bookmarks_unified')
        .delete()
        .eq('user_id', profile.id)
        .eq('collection_slug', collectionSlug)
        .eq('record_id', recordId);

      if (error) {
        setBookmarked(true);
        toast.error('Failed to remove bookmark');
      } else {
        toast.success('Bookmark removed');
        window.dispatchEvent(new CustomEvent('bookmarks-changed'));
      }
    } else {
      const { error } = await supabase
        .from('bookmarks_unified')
        .insert({
          user_id: profile.id,
          collection_slug: collectionSlug,
          record_id: recordId,
          record_title: recordTitle,
        });

      if (error) {
        setBookmarked(false);
        toast.error('Failed to add bookmark');
      } else {
        toast.success('Bookmarked!');
        window.dispatchEvent(new CustomEvent('bookmarks-changed'));
      }
    }
  }

  if (loading) return null;

  return (
    <button
      onClick={toggleBookmark}
      className={`p-2 rounded-xl border transition-colors ${
        bookmarked
          ? 'bg-brand-gold/10 border-brand-gold/30 text-brand-gold'
          : 'border-brand-gold/[0.08] text-brand-muted hover:text-brand-gold hover:border-brand-gold/20'
      }`}
      aria-label={bookmarked ? 'Remove bookmark' : 'Add bookmark'}
    >
      <Bookmark className={`w-5 h-5 ${bookmarked ? 'fill-brand-gold' : ''}`} />
    </button>
  );
}
