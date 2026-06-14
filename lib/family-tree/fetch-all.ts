import type { SupabaseClient } from '@supabase/supabase-js';

// PostgREST returns at most 1000 rows per request by default, so a large tree
// (e.g. a 1400-person GEDCOM import) would silently load only the first 1000
// people and 1000 relationships — dropping connections and leaving people
// looking isolated. This pages through the full result set in 1000-row
// batches so every row is loaded.
const PAGE = 1000;

interface FetchAllOptions {
  select?: string;
  orderBy?: string;
}

export async function fetchAllRows<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  match: Record<string, string>,
  options: FetchAllOptions = {}
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase
      .from(table)
      .select(options.select ?? '*')
      .match(match)
      .range(from, from + PAGE - 1);
    if (options.orderBy) q = q.order(options.orderBy, { ascending: true });

    const { data, error } = await q;
    if (error || !data || data.length === 0) break;
    out.push(...(data as T[]));
    if (data.length < PAGE) break;
  }
  return out;
}
