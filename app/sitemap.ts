import { MetadataRoute } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';

const BASE = 'https://reparationroad.org';

// Rebuild the sitemap at most once a day — record listing hits the DB, so we
// don't want to run it on every crawler request.
export const revalidate = 86400;

// Keep the file comfortably under the 50k-URL sitemap limit.
const PER_COLLECTION_CAP = 5000;
const GLOBAL_RECORD_CAP = 45000;
const PAGE = 1000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/collection`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE}/forum`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${BASE}/membership`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/booking`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];

  const supabase = createAdminClient();
  const { data: collections } = await supabase
    .from('collections')
    .select('slug, table_name, discriminator_column, discriminator_value, parent_slug')
    .eq('is_published', true)
    .order('slug');

  const cols = collections ?? [];

  // Every published collection has a landing page.
  const collectionPages: MetadataRoute.Sitemap = cols.map((c) => ({
    url: `${BASE}/collection/${c.slug}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  // Records only for leaf collections (no children) so a parent that shares a
  // table with its children doesn't duplicate every record under its own slug.
  const parentSlugs = new Set(cols.map((c) => c.parent_slug).filter(Boolean));
  const leaves = cols.filter((c) => c.table_name && !parentSlugs.has(c.slug));

  const recordPages: MetadataRoute.Sitemap = [];
  for (const c of leaves) {
    if (recordPages.length >= GLOBAL_RECORD_CAP) break;
    try {
      let from = 0;
      let taken = 0;
      // Paginate past the 1000-row read cap, up to this collection's limit.
      while (taken < PER_COLLECTION_CAP && recordPages.length < GLOBAL_RECORD_CAP) {
        let q = supabase.from(c.table_name!).select('slug').range(from, from + PAGE - 1);
        if (c.discriminator_column && c.discriminator_value) {
          q = q.ilike(c.discriminator_column, c.discriminator_value);
        }
        const { data, error } = await q;
        if (error || !data || data.length === 0) break;
        for (const r of data as { slug: string | null }[]) {
          if (!r.slug) continue;
          recordPages.push({
            url: `${BASE}/collection/${c.slug}/${encodeURIComponent(r.slug)}`,
            lastModified: now,
            changeFrequency: 'monthly',
            priority: 0.5,
          });
        }
        taken += data.length;
        from += PAGE;
        if (data.length < PAGE) break;
      }
    } catch {
      // A table without a slug column (or other issue) — skip it.
    }
  }

  return [...staticPages, ...collectionPages, ...recordPages];
}
