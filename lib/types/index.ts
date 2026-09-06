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
  // Newsletter consent. Deliberately independent of subscription_status —
  // cancelling a membership is not an unsubscribe, and unsubscribing is not a
  // cancellation. Present once newsletter_migration.sql is run.
  newsletter_status?: 'subscribed' | 'unsubscribed' | 'cleaned';
  newsletter_opted_in_at?: string | null;
  newsletter_opt_in_source?: string | null;
  newsletter_pending_opt_in?: boolean;
  newsletter_unsubscribed_at?: string | null;
  resend_contact_id?: string | null;
  // Forum identity (present once the migration is run; default-safe otherwise).
  handle?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  research_surnames?: string[] | null;
  research_regions?: string[] | null;
  karma?: number;
  created_at: string;
  updated_at: string;
}

export interface ForumNotification {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: 'reply' | 'reaction' | 'mention' | 'vote' | 'follow';
  thread_id: string | null;
  post_id: string | null;
  is_read: boolean;
  created_at: string;
}

export type ForumFollowTarget = 'thread' | 'user' | 'surname';

export interface ForumFollow {
  id: string;
  user_id: string;
  target_type: ForumFollowTarget;
  target_id: string;
  created_at: string;
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
  // When set, records are listed in this fixed column order (e.g. the original
  // document order) instead of being sorted by the first display column.
  sort_columns: string[] | null;
  sort_order: number;
  is_published: boolean;
  parent_slug: string | null;
  display_type: 'table' | 'book';
  citation_template: string | null;
  // Default archival source / provenance shown on every record in the
  // collection (a record-level override can replace it). Null until set.
  source_information: string | null;
  created_at: string;
  updated_at: string;
}

// Per-record override for the generated citation and/or the collection's
// source information. Absent row = use the collection defaults.
export interface RecordCitationOverride {
  id: string;
  table_name: string;
  record_id: string;
  citation: string | null;
  source_information: string | null;
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

export type ForumPostType = 'discussion' | 'find' | 'help';

// A record attached to a forum post (the "Share a Find" hook).
export interface ForumAttachedRecord {
  collection_slug: string;
  record_id: string;
  title: string;
}

// Another thread reposted into this one (the internal "Share to your feed").
export interface ForumSharedThread {
  slug: string;
  title: string;
  author?: string | null;
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
  // Social fields (present once the migration is run; default-safe otherwise).
  vote_count?: number;
  image_urls?: string[] | null;
  attached_record?: ForumAttachedRecord | null;
  shared_thread?: ForumSharedThread | null;
  tags?: string[] | null;
  post_type?: ForumPostType | null;
  created_at: string;
  updated_at: string;
  profiles?: Pick<Profile, 'first_name' | 'last_name' | 'email'>;
  forum_posts?: { count: number }[];
}

export interface ForumAuthor {
  id: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
}

export type FeedSort = 'hot' | 'new' | 'top';

// A thread reaction (the "rate" control on a feed post). Mirrors a post
// reaction but keyed on a thread.
export interface ForumThreadReaction {
  id: string;
  user_id: string;
  reaction_type: string;
}

// A thread as it appears in the feed, with the derived presentation data the
// list needs (author, counts, the viewer's vote, hot score).
export interface FeedItem {
  thread: ForumThread;
  author: ForumAuthor;
  categorySlug: string;
  categoryName: string;
  replyCount: number;
  voteCount: number;
  myVote: number; // -1 | 0 | 1
  reactions: ForumThreadReaction[];
  hotScore: number;
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

// ── Family tree ──────────────────────────────────────────────────────────

export interface FamilyTree {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  // The person the pedigree view centers on. Null falls back to an auto-pick.
  home_person_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TreeIndividual {
  id: string;
  tree_id: string;
  user_id: string;
  given_name: string | null;
  surname: string | null;
  sex: 'M' | 'F' | 'U' | null;
  birth_date: string | null;
  birth_place: string | null;
  death_date: string | null;
  death_place: string | null;
  is_living: boolean;
  occupation: string | null;
  notes: string | null;
  // Original @I123@ pointer when imported from a GEDCOM file.
  gedcom_xref: string | null;
  // Set when the individual is linked to a record in the archive.
  archive_collection_slug: string | null;
  archive_record_id: string | null;
  archive_record_title: string | null;
  // When archive matching was last run for this person (null = never).
  matched_at?: string | null;
  // The full raw GEDCOM subtree + direct source citations (present once the
  // full-import migration is run; default-safe otherwise).
  raw_gedcom?: GedcomNode | null;
  citations?: TreeCitation[] | null;
  // Primary photo (present once the media migration is run).
  photo_url?: string | null;
  pos_x: number;
  pos_y: number;
  created_at?: string;
  updated_at?: string;
}

// A node of a preserved GEDCOM record (every tag is kept).
export interface GedcomNode {
  tag: string;
  value: string;
  children: GedcomNode[];
}

// A source citation pointer captured from the file.
export interface TreeCitation {
  source_xref: string | null;
  page: string | null;
  text: string | null;
}

// A life event / fact for a person (birth, marriage, residence, custom…).
export interface TreeEvent {
  id: string;
  tree_id: string;
  user_id: string;
  individual_id: string;
  related_individual_id: string | null;
  tag: string;
  type: string;
  label: string;
  date: string | null;
  place: string | null;
  value: string | null;
  note: string | null;
  sources: TreeCitation[];
  raw: GedcomNode | null;
  position: number;
  created_at: string;
}

// A photo / media file attached to a person.
export interface TreeMedia {
  id: string;
  tree_id: string;
  user_id: string;
  individual_id: string | null;
  title: string | null;
  url: string;
  storage_path: string | null;
  format: string | null;
  is_primary: boolean;
  created_at: string;
}

// A bibliography source captured from the file.
export interface TreeSource {
  id: string;
  tree_id: string;
  user_id: string;
  gedcom_xref: string;
  title: string | null;
  author: string | null;
  publication: string | null;
  repository: string | null;
  text: string | null;
  raw: GedcomNode | null;
  created_at: string;
}

// A persisted archive match for a tree individual (suggested, linked, or
// dismissed). Mirrors an ArchiveMatch plus its stored status.
export interface TreeArchiveMatch {
  id: string;
  individual_id: string;
  tree_id: string;
  collection_slug: string;
  collection_name: string | null;
  record_id: string;
  record_slug: string | null;
  title: string | null;
  score: number;
  match_reasons: string[];
  detail_url: string | null;
  status: 'suggested' | 'linked' | 'dismissed';
  created_at: string;
}

export type TreeRelationshipType = 'parent' | 'spouse';

export interface TreeRelationship {
  id: string;
  tree_id: string;
  user_id: string;
  type: TreeRelationshipType;
  // 'parent': from_id = parent, to_id = child.
  // 'spouse': from_id/to_id are partners (unordered).
  from_id: string;
  to_id: string;
  // For parent edges: 'adopted' | 'step' | 'foster' for non-biological links;
  // null/undefined means biological or unspecified.
  parent_type?: string | null;
  created_at?: string;
}

// Full payload for rendering a tree on the canvas.
export interface TreeGraph {
  tree: FamilyTree;
  individuals: TreeIndividual[];
  relationships: TreeRelationship[];
}

// One candidate archive record matched against a tree individual.
export interface ArchiveMatch {
  id: string;
  slug: string;
  title: string;
  collectionSlug: string;
  collectionName: string;
  matchReasons: string[];
  score: number;
  detailUrl: string;
}
