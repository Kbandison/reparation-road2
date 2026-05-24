'use client';

import Link from 'next/link';
import { ArrowRight, Bookmark, Clock, Library, FileText } from 'lucide-react';

/* ----------------------- type guards ----------------------- */

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}
function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}
function asNumber(v: unknown): number | null {
  return typeof v === 'number' ? v : null;
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/* ----------------------- shared shapes ----------------------- */

interface CollectionItem {
  slug: string;
  name: string;
  short_description?: string;
  era?: string;
  region?: string;
  category?: string;
  record_count?: number;
}

function readCollection(x: Record<string, unknown>): CollectionItem | null {
  const slug = asString(x.slug);
  const name = asString(x.name);
  if (!slug || !name) return null;
  return {
    slug,
    name,
    short_description: asString(x.short_description) ?? undefined,
    era: asString(x.era) ?? undefined,
    region: asString(x.region) ?? undefined,
    category: asString(x.category) ?? undefined,
    record_count: asNumber(x.record_count) ?? undefined,
  };
}

const RESERVED_RECORD_KEYS = new Set([
  'id',
  'slug',
  'collection_slug',
  'detail_url',
  'image_path',
]);

function recordTitle(record: Record<string, unknown>): string {
  for (const [k, v] of Object.entries(record)) {
    if (RESERVED_RECORD_KEYS.has(k)) continue;
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return asString(record.slug) || asString(record.id) || 'Untitled';
}

function recordMeta(record: Record<string, unknown>): string[] {
  const out: string[] = [];
  let seenTitle = false;
  for (const [k, v] of Object.entries(record)) {
    if (RESERVED_RECORD_KEYS.has(k)) continue;
    if (typeof v === 'string' && v.trim()) {
      if (!seenTitle) {
        seenTitle = true;
        continue;
      }
      out.push(v.trim());
    } else if (typeof v === 'number') {
      out.push(String(v));
    }
    if (out.length >= 3) break;
  }
  return out;
}

/* ----------------------- card components ----------------------- */

function CollectionsList({
  items,
  total,
}: {
  items: CollectionItem[];
  total?: number;
}) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-brand-muted px-3 py-1.5">
        No matching collections.
      </p>
    );
  }
  const shown = items.slice(0, 5);
  const more = (total ?? items.length) - shown.length;
  return (
    <div className="space-y-1.5">
      {shown.map((c) => (
        <Link
          key={c.slug}
          href={`/collection/${c.slug}`}
          className="group block bg-brand-card/70 border border-brand-gold/[0.08] hover:border-brand-gold/25 rounded-lg px-3 py-2 transition-colors"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-brand-cream truncate group-hover:text-brand-gold">
                {c.name}
              </p>
              {c.short_description && (
                <p className="text-[11px] text-brand-muted line-clamp-2 leading-relaxed mt-0.5">
                  {c.short_description}
                </p>
              )}
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-brand-muted group-hover:text-brand-gold flex-shrink-0 mt-0.5" />
          </div>
          <p className="flex flex-wrap items-center gap-x-1.5 mt-1.5 text-[10px] text-brand-muted">
            {c.record_count != null && (
              <span>{c.record_count.toLocaleString()} records</span>
            )}
            {c.era && <span>· {c.era}</span>}
            {c.region && <span>· {c.region}</span>}
            {c.category && <span>· {c.category}</span>}
          </p>
        </Link>
      ))}
      {more > 0 && (
        <p className="text-[11px] text-brand-muted px-3">+ {more} more</p>
      )}
    </div>
  );
}

function CollectionDetail({ item }: { item: CollectionItem }) {
  return (
    <Link
      href={`/collection/${item.slug}`}
      className="group block bg-brand-card/70 border border-brand-gold/[0.08] hover:border-brand-gold/25 rounded-lg px-3 py-2 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-brand-cream group-hover:text-brand-gold">
            {item.name}
          </p>
          {item.short_description && (
            <p className="text-[11px] text-brand-muted leading-relaxed mt-1">
              {item.short_description}
            </p>
          )}
        </div>
        <Library className="w-3.5 h-3.5 text-brand-gold/60 flex-shrink-0 mt-0.5" />
      </div>
      <p className="flex flex-wrap items-center gap-x-1.5 mt-1.5 text-[10px] text-brand-muted">
        {item.record_count != null && (
          <span>{item.record_count.toLocaleString()} records</span>
        )}
        {item.era && <span>· {item.era}</span>}
        {item.region && <span>· {item.region}</span>}
      </p>
    </Link>
  );
}

function RecordsList({
  records,
  collectionName,
}: {
  records: Record<string, unknown>[];
  collectionName?: string;
}) {
  if (records.length === 0) {
    return (
      <p className="text-xs text-brand-muted px-3 py-1.5">No records found.</p>
    );
  }
  const shown = records.slice(0, 5);
  const more = records.length - shown.length;
  return (
    <div className="space-y-1.5">
      {shown.map((r, i) => {
        const title = recordTitle(r);
        const meta = recordMeta(r);
        const href = asString(r.detail_url);
        const content = (
          <>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-brand-cream truncate">
                {title}
              </p>
              {href && (
                <ArrowRight className="w-3.5 h-3.5 text-brand-muted group-hover:text-brand-gold flex-shrink-0 mt-0.5" />
              )}
            </div>
            {meta.length > 0 && (
              <p className="text-[11px] text-brand-muted line-clamp-1 mt-0.5">
                {meta.join(' · ')}
              </p>
            )}
            {collectionName && (
              <p className="text-[10px] text-brand-muted/80 mt-1">
                in {collectionName}
              </p>
            )}
          </>
        );
        return href ? (
          <Link
            key={i}
            href={href}
            className="group block bg-brand-card/70 border border-brand-gold/[0.08] hover:border-brand-gold/25 rounded-lg px-3 py-2 transition-colors"
          >
            {content}
          </Link>
        ) : (
          <div
            key={i}
            className="bg-brand-card/70 border border-brand-gold/[0.08] rounded-lg px-3 py-2"
          >
            {content}
          </div>
        );
      })}
      {more > 0 && (
        <p className="text-[11px] text-brand-muted px-3">+ {more} more</p>
      )}
    </div>
  );
}

function RelatedList({
  related,
}: {
  related: Array<{
    name?: string;
    collection_name?: string;
    relationship_type?: string;
    relationship_note?: string;
    detail_url?: string;
  }>;
}) {
  if (related.length === 0) {
    return (
      <p className="text-xs text-brand-muted px-3 py-1.5">
        No curated related records.
      </p>
    );
  }
  const shown = related.slice(0, 5);
  const more = related.length - shown.length;
  return (
    <div className="space-y-1.5">
      {shown.map((r, i) => {
        const content = (
          <>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-brand-cream truncate">
                {r.name || 'Related record'}
              </p>
              {r.detail_url && (
                <ArrowRight className="w-3.5 h-3.5 text-brand-muted group-hover:text-brand-gold flex-shrink-0 mt-0.5" />
              )}
            </div>
            <p className="flex flex-wrap items-center gap-x-1.5 mt-0.5 text-[11px] text-brand-muted">
              {r.relationship_type && (
                <span className="text-brand-gold/80">{r.relationship_type}</span>
              )}
              {r.collection_name && <span>· in {r.collection_name}</span>}
            </p>
            {r.relationship_note && (
              <p className="text-[10px] text-brand-muted/80 mt-0.5 line-clamp-2">
                {r.relationship_note}
              </p>
            )}
          </>
        );
        return r.detail_url ? (
          <Link
            key={i}
            href={r.detail_url}
            className="group block bg-brand-card/70 border border-brand-gold/[0.08] hover:border-brand-gold/25 rounded-lg px-3 py-2 transition-colors"
          >
            {content}
          </Link>
        ) : (
          <div
            key={i}
            className="bg-brand-card/70 border border-brand-gold/[0.08] rounded-lg px-3 py-2"
          >
            {content}
          </div>
        );
      })}
      {more > 0 && (
        <p className="text-[11px] text-brand-muted px-3">+ {more} more</p>
      )}
    </div>
  );
}

interface BookmarkItem {
  record_title?: string;
  record_id: string;
  collection_slug: string;
  notes?: string;
}

function BookmarksList({ items }: { items: BookmarkItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-brand-muted px-3 py-1.5">No bookmarks yet.</p>
    );
  }
  const shown = items.slice(0, 5);
  const more = items.length - shown.length;
  return (
    <div className="space-y-1.5">
      {shown.map((b, i) => {
        // Open the record's modal on its collection page rather than a
        // dedicated detail page — keeps surrounding records visible.
        const href = `/collection/${b.collection_slug}?record=${encodeURIComponent(b.record_id)}`;
        return (
          <Link
            key={i}
            href={href}
            className="group block bg-brand-card/70 border border-brand-gold/[0.08] hover:border-brand-gold/25 rounded-lg px-3 py-2 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-brand-cream truncate flex items-center gap-1.5">
                  <Bookmark className="w-3 h-3 text-brand-gold flex-shrink-0" />
                  {b.record_title || 'Bookmarked record'}
                </p>
                {b.notes && (
                  <p className="text-[11px] text-brand-muted line-clamp-2 mt-0.5">
                    {b.notes}
                  </p>
                )}
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-brand-muted group-hover:text-brand-gold flex-shrink-0 mt-0.5" />
            </div>
          </Link>
        );
      })}
      {more > 0 && (
        <p className="text-[11px] text-brand-muted px-3">+ {more} more</p>
      )}
    </div>
  );
}

interface ActivityItem {
  type: string;
  target_slug: string;
  target_name?: string;
  collection_slug?: string;
}

function ActivityList({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-brand-muted px-3 py-1.5">
        No recent activity.
      </p>
    );
  }
  const shown = items.slice(0, 5);
  const more = items.length - shown.length;
  return (
    <div className="space-y-1.5">
      {shown.map((a, i) => {
        let href: string | null = null;
        if (a.type === 'record' && a.collection_slug) {
          href = `/collection/${a.collection_slug}?record=${encodeURIComponent(a.target_slug)}`;
        } else if (a.type === 'collection' || a.type === 'subcollection') {
          href = `/collection/${a.target_slug}`;
        }
        const content = (
          <>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-brand-cream truncate flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-brand-gold/70 flex-shrink-0" />
                {a.target_name || a.target_slug}
              </p>
              {href && (
                <ArrowRight className="w-3.5 h-3.5 text-brand-muted group-hover:text-brand-gold flex-shrink-0 mt-0.5" />
              )}
            </div>
            <p className="text-[10px] text-brand-muted/80 mt-0.5">
              {a.type === 'record' ? 'Record' : a.type === 'search' ? 'Search' : 'Collection'}
            </p>
          </>
        );
        return href ? (
          <Link
            key={i}
            href={href}
            className="group block bg-brand-card/70 border border-brand-gold/[0.08] hover:border-brand-gold/25 rounded-lg px-3 py-2 transition-colors"
          >
            {content}
          </Link>
        ) : (
          <div
            key={i}
            className="bg-brand-card/70 border border-brand-gold/[0.08] rounded-lg px-3 py-2"
          >
            {content}
          </div>
        );
      })}
      {more > 0 && (
        <p className="text-[11px] text-brand-muted px-3">+ {more} more</p>
      )}
    </div>
  );
}

/* ----------------------- dispatcher ----------------------- */

export function ToolResult({
  toolName,
  output,
}: {
  toolName: string;
  output: unknown;
}) {
  const out = asObj(output);
  // Errors are already surfaced by the status pill — don't double-render.
  if (out && asString(out.error)) return null;

  if (toolName === 'search_records_globally') {
    if (!out) return null;
    const groups = asArray(out.groups)
      .map((g) => asObj(g))
      .filter((x): x is Record<string, unknown> => x !== null);
    if (groups.length === 0) {
      return (
        <p className="text-xs text-brand-muted px-3 py-1.5">
          No records matched across the archive.
        </p>
      );
    }
    return (
      <div className="space-y-2">
        {groups.slice(0, 4).map((g, i) => {
          const collectionName = asString(g.collection_name) ?? 'Collection';
          const total = asNumber(g.total) ?? 0;
          const records = asArray(g.records)
            .map((r) => asObj(r))
            .filter((x): x is Record<string, unknown> => x !== null);
          return (
            <div
              key={i}
              className="bg-brand-card/70 border border-brand-gold/[0.08] rounded-lg px-3 py-2"
            >
              <p className="text-[11px] text-brand-gold/80 mb-1.5">
                {collectionName}
                <span className="text-brand-muted/80">
                  {' '}
                  · {total.toLocaleString()} match{total === 1 ? '' : 'es'}
                </span>
              </p>
              <div className="space-y-1">
                {records.slice(0, 4).map((r, ri) => {
                  const href = asString(r.detail_url);
                  const title = recordTitle(r);
                  const content = (
                    <>
                      <span className="text-sm text-brand-cream truncate flex-1">
                        {title}
                      </span>
                      {href && (
                        <ArrowRight className="w-3 h-3 text-brand-muted group-hover:text-brand-gold flex-shrink-0" />
                      )}
                    </>
                  );
                  return href ? (
                    <Link
                      key={ri}
                      href={href}
                      className="group flex items-center gap-2 px-1 py-0.5 rounded hover:bg-brand-card-hover/60 transition-colors"
                    >
                      {content}
                    </Link>
                  ) : (
                    <div key={ri} className="flex items-center gap-2 px-1 py-0.5">
                      {content}
                    </div>
                  );
                })}
                {records.length > 4 && (
                  <p className="text-[10px] text-brand-muted/70 px-1">
                    + {records.length - 4} more
                  </p>
                )}
              </div>
            </div>
          );
        })}
        {groups.length > 4 && (
          <p className="text-[11px] text-brand-muted px-3">
            + {groups.length - 4} more collections
          </p>
        )}
      </div>
    );
  }

  if (toolName === 'search_collections' || toolName === 'list_collections') {
    const items = asArray(out?.results)
      .map((r) => asObj(r))
      .filter((x): x is Record<string, unknown> => x !== null)
      .map(readCollection)
      .filter((x): x is CollectionItem => x !== null);
    return <CollectionsList items={items} />;
  }

  if (toolName === 'get_collection_info') {
    if (!out) return null;
    const item = readCollection(out);
    if (!item) return null;
    return <CollectionDetail item={item} />;
  }

  if (toolName === 'find_records') {
    if (!out) return null;
    const records = asArray(out.results)
      .map((r) => asObj(r))
      .filter((x): x is Record<string, unknown> => x !== null);
    const collection = asObj(out.collection);
    const collectionName = asString(collection?.name) ?? undefined;
    return <RecordsList records={records} collectionName={collectionName} />;
  }

  if (toolName === 'get_record') {
    if (!out) return null;
    const record = asObj(out.record);
    if (!record) return null;
    const collection = asObj(out.collection);
    const collectionName = asString(collection?.name) ?? undefined;
    return <RecordsList records={[record]} collectionName={collectionName} />;
  }

  if (toolName === 'get_related_records') {
    if (!out) return null;
    const arr = asArray(out.results)
      .map((r) => asObj(r))
      .filter((x): x is Record<string, unknown> => x !== null);
    const related = arr.map((r) => ({
      name: asString(r.related_name) ?? undefined,
      collection_name: asString(r.related_collection_name) ?? undefined,
      relationship_type: asString(r.relationship_type) ?? undefined,
      relationship_note: asString(r.relationship_note) ?? undefined,
      detail_url: asString(r.detail_url) ?? undefined,
    }));
    return <RelatedList related={related} />;
  }

  if (toolName === 'list_my_bookmarks') {
    if (!out) return null;
    const items = asArray(out.results)
      .map((r) => asObj(r))
      .filter((x): x is Record<string, unknown> => x !== null)
      .map((r): BookmarkItem | null => {
        const collection_slug = asString(r.collection_slug);
        const record_id = asString(r.record_id);
        if (!collection_slug || !record_id) return null;
        return {
          collection_slug,
          record_id,
          record_title: asString(r.record_title) ?? undefined,
          notes: asString(r.notes) ?? undefined,
        };
      })
      .filter((x): x is BookmarkItem => x !== null);
    return <BookmarksList items={items} />;
  }

  if (toolName === 'list_my_recent_activity') {
    if (!out) return null;
    const items = asArray(out.results)
      .map((r) => asObj(r))
      .filter((x): x is Record<string, unknown> => x !== null)
      .map((r): ActivityItem | null => {
        const type = asString(r.type);
        const target_slug = asString(r.target_slug);
        if (!type || !target_slug) return null;
        return {
          type,
          target_slug,
          target_name: asString(r.target_name) ?? undefined,
          collection_slug: asString(r.collection_slug) ?? undefined,
        };
      })
      .filter((x): x is ActivityItem => x !== null);
    return <ActivityList items={items} />;
  }

  // Unknown tool — render nothing; the model's prose will cover it.
  return null;
}

// Tiny helper used elsewhere if we want a "1 result" badge.
export function FileTextIcon() {
  return <FileText className="w-3 h-3" />;
}
