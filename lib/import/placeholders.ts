import type { Collection } from '@/lib/types';
import { toTableName } from './records';

/**
 * Placeholder collections: rows in `collections` with no table and no tabs of
 * their own. The site shows them as "Coming Soon" until records are imported
 * into them. These helpers decide where such a collection's records should live.
 */

type CollectionShape = Pick<
  Collection,
  'slug' | 'name' | 'table_name' | 'parent_slug' | 'discriminator_column' | 'discriminator_value' | 'display_type'
>;

/** Shares a table with its sibling tabs, told apart by a tag column. */
export interface SharedPlacement {
  kind: 'shared';
  table: string;
  column: string;
  value: string;
}

/** Gets a table of its own. */
export interface OwnPlacement {
  kind: 'own';
  table: string;
}

export type Placement = SharedPlacement | OwnPlacement;

export const SAFE_IDENTIFIER = /^[a-z0-9_]+$/;

/** A collection grouping other collections (no table, has tabs). Not importable. */
export function hasTabs(collection: CollectionShape, all: CollectionShape[]): boolean {
  return all.some((c) => c.parent_slug === collection.slug);
}

/**
 * No table and no tabs, and not a folder: the collection page shows "Coming
 * Soon" until records are imported. An empty folder is waiting for tabs, not
 * records, so it never counts.
 */
export function isPlaceholder(collection: CollectionShape, all: CollectionShape[]): boolean {
  return !collection.table_name && collection.display_type !== 'folder' && !hasTabs(collection, all);
}

/**
 * Turns a slug tail into a tag in the siblings' style. Sibling tags are written
 * either with underscores ("john_brown") or as single words ("georgia").
 */
function toTag(tail: string, separator: string): string {
  return tail.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join(separator);
}

/**
 * The tag a placeholder would most likely use, derived from how its siblings
 * name theirs: "slave-merchants-john-brown" carries collection_tag "john_brown",
 * so "slave-merchants-aaron-lopez" gets "aaron_lopez".
 */
function suggestTag(slug: string, siblings: CollectionShape[]): string {
  const values = siblings.map((s) => s.discriminator_value!.toLowerCase());
  const separator = values.some((v) => v.includes('-')) && !values.some((v) => v.includes('_')) ? '-' : '_';

  for (const sibling of siblings) {
    const tail = sibling.discriminator_value!.toLowerCase().replace(/_/g, '-');
    if (!sibling.slug.endsWith(tail)) continue;
    const prefix = sibling.slug.slice(0, sibling.slug.length - tail.length);
    if (prefix && slug.startsWith(prefix)) return toTag(slug.slice(prefix.length), separator);
  }
  return toTag(slug, separator);
}

/**
 * Where a placeholder's records can go. `shared` is offered when its sibling
 * tabs share one table (the most common one if they don't all agree); `own` is
 * always possible. The admin can edit either before importing.
 */
export function suggestPlacements(
  placeholder: CollectionShape,
  all: CollectionShape[],
): { shared: SharedPlacement | null; own: OwnPlacement } {
  const own: OwnPlacement = { kind: 'own', table: toTableName(placeholder.slug) };
  if (!placeholder.parent_slug) return { shared: null, own };

  const tagged = all.filter(
    (c) =>
      c.parent_slug === placeholder.parent_slug &&
      c.slug !== placeholder.slug &&
      c.table_name &&
      c.discriminator_column &&
      c.discriminator_value,
  );
  if (tagged.length === 0) return { shared: null, own };

  // Group by table + tag column and take the biggest group.
  const groups = new Map<string, CollectionShape[]>();
  for (const c of tagged) {
    const key = `${c.table_name}\u0000${c.discriminator_column}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const [best] = [...groups.values()].sort((a, b) => b.length - a.length);

  return {
    shared: {
      kind: 'shared',
      table: best[0].table_name!,
      column: best[0].discriminator_column!,
      value: suggestTag(placeholder.slug, best),
    },
    own,
  };
}

/**
 * Problems with a placement before any file is read. Table-level checks that
 * need the database (an own table that already holds rows) happen later.
 */
export function placementProblems(
  placement: Placement,
  placeholder: CollectionShape,
  all: CollectionShape[],
): string[] {
  const problems: string[] = [];
  if (!SAFE_IDENTIFIER.test(placement.table)) {
    problems.push('Table names can only use lowercase letters, numbers and underscores.');
  }

  if (placement.kind === 'shared') {
    const value = placement.value.trim().toLowerCase();
    if (!value) problems.push(`Enter the ${placement.column} value these records will carry.`);
    // The tab filter matches tags case-insensitively, so compare that way too.
    const clash = all.find(
      (c) =>
        c.slug !== placeholder.slug &&
        c.table_name === placement.table &&
        c.discriminator_column === placement.column &&
        c.discriminator_value?.toLowerCase() === value,
    );
    if (value && clash) {
      problems.push(`"${clash.name}" already uses ${placement.column} = ${clash.discriminator_value}. Pick a different value.`);
    }
  } else {
    const owner = all.find((c) => c.slug !== placeholder.slug && c.table_name === placement.table);
    if (owner) {
      problems.push(`The table ${placement.table} already belongs to "${owner.name}". Pick another name, or share it as a tab.`);
    }
  }
  return problems;
}
