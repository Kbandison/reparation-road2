import type { Collection } from '@/lib/types';

/**
 * Folders are collections that hold other collections (tabs) and never
 * records. Marked with display_type = 'folder'; a collection with no table
 * that already has tabs under it counts too.
 */

type CollectionShape = Pick<Collection, 'slug' | 'name' | 'table_name' | 'parent_slug' | 'display_type'>;

export function isFolder(collection: CollectionShape, all: CollectionShape[]): boolean {
  if (collection.table_name) return false;
  return collection.display_type === 'folder' || all.some((c) => c.parent_slug === collection.slug);
}

/** Every collection nested under `slug`, at any depth. */
export function descendantSlugs(slug: string, all: Pick<Collection, 'slug' | 'parent_slug'>[]): Set<string> {
  const found = new Set<string>();
  const queue = [slug];
  while (queue.length) {
    const current = queue.shift()!;
    for (const c of all) {
      if (c.parent_slug === current && !found.has(c.slug)) {
        found.add(c.slug);
        queue.push(c.slug);
      }
    }
  }
  return found;
}

export interface FolderOption {
  slug: string;
  /** "Native American Records → Cherokee Agency Records" */
  label: string;
}

/**
 * Folders a collection can be placed in, labelled with their full path and
 * sorted by it. Pass `moving` to leave out that collection and everything
 * inside it (a folder can't go inside itself).
 */
export function folderOptions(all: CollectionShape[], moving?: string): FolderOption[] {
  const bySlug = new Map(all.map((c) => [c.slug, c]));
  const excluded = moving ? new Set([moving, ...descendantSlugs(moving, all)]) : new Set<string>();

  const pathOf = (c: CollectionShape) => {
    const names = [c.name];
    let node = c;
    for (let depth = 0; node.parent_slug && depth < 10; depth++) {
      const parent = bySlug.get(node.parent_slug);
      if (!parent) break;
      names.unshift(parent.name);
      node = parent;
    }
    return names.join(' → ');
  };

  return all
    .filter((c) => !excluded.has(c.slug) && isFolder(c, all))
    .map((c) => ({ slug: c.slug, label: pathOf(c) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
