'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import slugify from 'slugify';

interface Category {
  id: string;
  name: string;
  slug: string;
}

export default function NewThreadPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedCategory = searchParams.get('category');

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('forum_categories')
      .select('id, name, slug')
      .order('sort_order')
      .then(({ data }) => {
        if (data) {
          setCategories(data);
          if (preselectedCategory) {
            const match = data.find((c) => c.slug === preselectedCategory);
            if (match) setCategoryId(match.id);
          }
        }
      });
  }, [preselectedCategory]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!categoryId || !title.trim() || !content.trim()) return;

    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      toast.error('You must be logged in');
      setLoading(false);
      return;
    }

    const slug = slugify(title, { lower: true, strict: true });

    const { data: thread, error } = await supabase
      .from('forum_threads')
      .insert({
        category_id: categoryId,
        user_id: user.id,
        title: title.trim(),
        slug,
        content: content.trim(),
      })
      .select('slug')
      .single();

    if (error) {
      toast.error('Failed to create thread');
      setLoading(false);
      return;
    }

    toast.success('Thread created');
    router.push(`/forum/thread/${thread.slug}`);
  }

  return (
    <>
      <div className="mb-2">
        <Link href="/forum" className="text-sm text-brand-muted hover:text-brand-gold transition-colors">
          &larr; Back to Forum
        </Link>
      </div>

      <PageHeader title="New Thread" />

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        <div className="space-y-2">
          <Label>Category</Label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            required
            className="w-full bg-brand-card border border-brand-gold/[0.15] rounded-xl px-3 py-2 text-sm text-brand-cream focus:border-brand-gold focus:outline-none"
          >
            <option value="">Select a category</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label>Title</Label>
          <Input
            placeholder="Thread title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
          />
        </div>

        <div className="space-y-2">
          <Label>Content</Label>
          <Textarea
            placeholder="Write your post..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            rows={8}
            className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold resize-none"
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Thread'}
        </Button>
      </form>
    </>
  );
}
