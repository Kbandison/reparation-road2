export interface Profile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  subscription_status: 'free' | 'paid' | 'donor';
  role: 'user' | 'admin';
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_interval: 'month' | 'year' | null;
  subscription_period_start: string | null;
  subscription_period_end: string | null;
  subscription_cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

export interface Collection {
  id: string;
  slug: string;
  name: string;
  short_description: string | null;
  long_description: string | null;
  category: string;
  era: string | null;
  region: string | null;
  table_name: string | null;
  discriminator_column: string | null;
  discriminator_value: string | null;
  record_count: number;
  has_images: boolean;
  has_ocr: boolean;
  has_transcription: boolean;
  access_tier: 'free' | 'explorer' | 'scholar';
  thumbnail_url: string | null;
  display_columns: string[];
  search_columns: string[];
  title_columns: string[] | null;
  sort_order: number;
  is_published: boolean;
  parent_slug: string | null;
  display_type: 'table' | 'book';
  citation_template: string | null;
  created_at: string;
  updated_at: string;
}

export interface CollectionRecord {
  id: string;
  slug?: string;
  image_path?: string;
  image_url?: string;
  ocr_text?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface Bookmark {
  id: string;
  user_id: string;
  collection_slug: string;
  record_id: string;
  record_title: string | null;
  notes: string | null;
  created_at: string;
}

export interface ForumCategory {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  icon: string;
  sort_order: number;
  created_at: string;
}

export interface ForumThread {
  id: string;
  category_id: string;
  user_id: string;
  title: string;
  slug: string;
  content: string;
  is_pinned: boolean;
  is_locked: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
  profiles?: Pick<Profile, 'first_name' | 'last_name' | 'email'>;
  forum_posts?: { count: number }[];
}

export interface ForumPost {
  id: string;
  thread_id: string;
  user_id: string;
  content: string;
  is_edited: boolean;
  edited_at: string | null;
  created_at: string;
  profiles?: Pick<Profile, 'first_name' | 'last_name' | 'email'>;
  forum_reactions?: ForumReaction[];
}

export interface ForumReaction {
  id: string;
  post_id: string;
  user_id: string;
  reaction_type: 'like' | 'helpful' | 'insightful';
  created_at: string;
}

export interface Booking {
  id: string;
  name: string;
  email: string;
  message: string | null;
  session_type: string;
  date: string;
  time: string;
  created_at: string;
}

export interface RelatedRecord {
  id: string;
  source_record_id: string;
  source_table: string;
  source_name: string | null;
  source_collection: string;
  source_collection_slug: string;
  target_record_id: string;
  target_table: string;
  target_name: string | null;
  target_collection: string;
  target_collection_slug: string;
  relationship_type: string | null;
  relationship_note: string | null;
  display_priority: number;
  is_bidirectional: boolean;
  is_featured: boolean;
}

export interface AlgorithmicMatch {
  id: string;
  slug: string;
  name: string;
  collectionSlug: string;
  collectionName: string;
  tableName: string;
  matchReasons: string[];
  score: number;
}

export interface RelatedRecordsResponse {
  curated: RelatedRecord[];
  algorithmic: AlgorithmicMatch[];
}
