import { MetadataRoute } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages = ['', '/about'].map((path) => ({
    url: `https://reparationroad.org${path}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: path === '' ? 1 : 0.8,
  }));

  const supabase = createAdminClient();
  const { data: collections } = await supabase
    .from('collections')
    .select('slug')
    .eq('is_published', true);

  const collectionPages = (collections || []).map((c) => ({
    url: `https://reparationroad.org/collection/${c.slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  return [...staticPages, ...collectionPages];
}
