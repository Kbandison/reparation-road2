'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, MessageSquare, Search, HelpCircle, ImagePlus, FileText, X } from 'lucide-react';
import slugify from 'slugify';
import { RecordPicker } from '@/components/forum/record-picker';
import type { ForumAttachedRecord, ForumPostType } from '@/lib/types';

interface Category {
  id: string;
  name: string;
  slug: string;
}

const POST_TYPES: { key: ForumPostType; label: string; icon: typeof MessageSquare; hint: string }[] = [
  { key: 'discussion', label: 'Discussion', icon: MessageSquare, hint: 'Start a conversation' },
  { key: 'find', label: 'Share a Find', icon: Search, hint: 'Show a record you discovered' },
  { key: 'help', label: 'Research Help', icon: HelpCircle, hint: 'Ask the community for help' },
];

// The create-post form. Rendered both as a standalone page and inside the
// feed's composer modal. In modal mode it closes and refreshes the feed on
// success; standalone it navigates to the new thread.
export function PostComposer({ inModal = false }: { inModal?: boolean }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [postType, setPostType] = useState<ForumPostType>('discussion');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [attachedRecord, setAttachedRecord] = useState<ForumAttachedRecord | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
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

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 8)) {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/forum/upload', { method: 'POST', body: form });
        const data = await res.json();
        if (res.ok && data.url) setImages((prev) => [...prev, data.url].slice(0, 8));
        else toast.error(data.error || 'Upload failed');
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!categoryId || !title.trim() || !content.trim()) return;

    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error('You must be logged in');
      setLoading(false);
      return;
    }

    const slug = `${slugify(title, { lower: true, strict: true }).slice(0, 60)}-${Math.floor(Math.random() * 9000 + 1000)}`;

    const { data: thread, error } = await supabase
      .from('forum_threads')
      .insert({
        category_id: categoryId,
        user_id: user.id,
        title: title.trim(),
        slug,
        content: content.trim(),
        post_type: postType,
        image_urls: images,
        attached_record: attachedRecord,
      })
      .select('slug')
      .single();

    if (error) {
      toast.error('Failed to create post');
      setLoading(false);
      return;
    }

    toast.success('Posted');
    if (inModal) {
      // Close the composer modal and refresh the feed so the new post appears.
      router.replace('/forum');
      router.refresh();
    } else {
      router.push(`/forum/thread/${thread.slug}`);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Post type */}
        <div className="grid grid-cols-3 gap-2">
          {POST_TYPES.map(({ key, label, icon: Icon, hint }) => (
            <button
              key={key}
              type="button"
              onClick={() => setPostType(key)}
              className={`flex flex-col items-center gap-1 rounded-xl border px-3 py-3 text-center transition-colors ${
                postType === key
                  ? 'border-brand-gold/50 bg-brand-gold/[0.06]'
                  : 'border-brand-gold/[0.12] hover:border-brand-gold/30'
              }`}
            >
              <Icon className={`w-5 h-5 ${postType === key ? 'text-brand-gold' : 'text-brand-muted'}`} />
              <span className="text-sm font-medium text-brand-cream">{label}</span>
              <span className="text-[10px] text-brand-muted hidden sm:block">{hint}</span>
            </button>
          ))}
        </div>

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
            placeholder={postType === 'find' ? 'What did you find?' : postType === 'help' ? 'What do you need help with?' : 'Title'}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
          />
        </div>

        <div className="space-y-2">
          <Label>Content</Label>
          <Textarea
            placeholder="Write your post…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            rows={inModal ? 5 : 7}
            className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold resize-y"
          />
        </div>

        {/* Attached record */}
        <div className="space-y-2">
          <Label>Attach an archive record (optional)</Label>
          {attachedRecord ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-brand-gold/20 bg-brand-bg/50 px-3 py-2.5">
              <FileText className="w-4 h-4 text-brand-gold shrink-0" />
              <span className="text-sm text-brand-cream truncate flex-1">{attachedRecord.title}</span>
              <button type="button" onClick={() => setAttachedRecord(null)} className="text-brand-muted hover:text-brand-burgundy-light" aria-label="Remove">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Button type="button" variant="outline" onClick={() => setPickerOpen(true)} className="border-brand-gold/20 text-brand-cream rounded-xl">
              <Search className="w-4 h-4 mr-1.5" /> Find a record
            </Button>
          )}
        </div>

        {/* Images */}
        <div className="space-y-2">
          <Label>Photos (optional)</Label>
          <div className="flex flex-wrap gap-2">
            {images.map((url, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="w-20 h-20 rounded-lg object-cover border border-brand-gold/15" />
                <button
                  type="button"
                  onClick={() => setImages(images.filter((_, idx) => idx !== i))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-brand-bg border border-brand-gold/30 flex items-center justify-center text-brand-muted hover:text-brand-burgundy-light"
                  aria-label="Remove image"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {images.length < 8 && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-20 h-20 rounded-lg border border-dashed border-brand-gold/30 flex items-center justify-center text-brand-muted hover:border-brand-gold/50 hover:text-brand-gold transition-colors"
              >
                {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        <Button
          type="submit"
          disabled={loading || uploading}
          className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Post'}
        </Button>
      </form>

      {pickerOpen && (
        <RecordPicker
          onPick={(r) => {
            setAttachedRecord(r);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}
