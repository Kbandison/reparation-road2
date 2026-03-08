'use client';

import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

export function DeleteBookmarkButton({ bookmarkId }: { bookmarkId: string }) {
  const router = useRouter();

  async function handleDelete() {
    const supabase = createClient();
    const { error } = await supabase
      .from('bookmarks_unified')
      .delete()
      .eq('id', bookmarkId);

    if (error) {
      toast.error('Failed to remove bookmark');
      return;
    }

    toast.success('Bookmark removed');
    window.dispatchEvent(new CustomEvent('bookmarks-changed'));
    router.refresh();
  }

  return (
    <button
      onClick={handleDelete}
      className="p-1.5 rounded-lg text-brand-muted hover:text-brand-burgundy-light hover:bg-brand-burgundy/10 transition-colors"
      aria-label="Remove bookmark"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  );
}
