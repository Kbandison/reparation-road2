import { displayValue, isBlank } from './values';

/** URL-safe slug text: lowercase words joined by single hyphens. */
export function slugify(text: string, maxLength = 80): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/, '');
}

/**
 * Gives every record a slug nothing else in the table uses. Record pages look
 * records up by slug with maybeSingle(), so a repeated slug makes both rows
 * unreachable, and appending used to restart the counter at 0 every time.
 *
 * - Generated slugs keep the long-standing `<first text value>-<row index>`
 *   form, so a fresh import gets the same slugs as before. When an earlier
 *   import already took one, the next free number for that name is used.
 * - A slug the file supplies is kept as-is unless it's taken, then gets -2, -3…
 *
 * `taken` holds the table's existing slugs and is updated in place.
 */
export function assignUniqueSlugs(records: Record<string, unknown>[], taken: Set<string>): void {
  const nextNumber = new Map<string, number>();

  const claim = (preferred: string, base: string, firstNumber: number): string => {
    let slug = preferred;
    if (taken.has(slug)) {
      let n = Math.max(nextNumber.get(base) ?? firstNumber, firstNumber);
      while (taken.has(`${base}-${n}`)) n++;
      nextNumber.set(base, n + 1);
      slug = `${base}-${n}`;
    }
    taken.add(slug);
    return slug;
  };

  records.forEach((record, index) => {
    if (!isBlank(record.slug)) {
      const supplied = displayValue(record.slug);
      record.slug = claim(supplied, supplied, 2);
      return;
    }
    const firstText = Object.entries(record).find(
      ([column, value]) => column !== 'slug' && typeof value === 'string' && value.trim(),
    )?.[1] as string | undefined;
    const base = (firstText && slugify(firstText)) || 'record';
    record.slug = claim(`${base}-${index}`, base, 0);
  });
}
