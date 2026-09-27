import { SYSTEM_COLUMNS } from './records';
import type { TableColumns } from './types';

// Server-only: reads the Supabase service key. Never import from a client component.

export interface ColumnInfo {
  /** Postgres type, e.g. "integer", "text", "timestamp with time zone". */
  type: string;
  notNull: boolean;
  hasDefault: boolean;
}

export interface TableSchema {
  columns: Record<string, ColumnInfo>;
}

interface OpenApiProperty {
  format?: string;
  type?: string;
  default?: unknown;
}

interface OpenApiDefinition {
  properties?: Record<string, OpenApiProperty>;
  required?: string[];
}

/**
 * A table's real columns, or null when the table doesn't exist.
 *
 * PostgREST publishes an OpenAPI (Swagger 2.0) description of every table it
 * serves at the API root. Read with the service key it lists each column's
 * Postgres type, whether it's NOT NULL, and its default. That's everything the
 * import checks a file against, with no SQL helper function to install. It
 * mirrors PostgREST's schema cache, which reloads a moment after DDL (see
 * waitForSchema).
 */
export async function fetchTableSchema(tableName: string): Promise<TableSchema | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase admin credentials are not configured');

  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Couldn't read the database schema (HTTP ${res.status})`);

  const spec = (await res.json()) as { definitions?: Record<string, OpenApiDefinition> };
  const definition = spec.definitions?.[tableName];
  if (!definition?.properties) return null;

  const notNull = new Set(definition.required ?? []);
  const columns: Record<string, ColumnInfo> = {};
  for (const [name, prop] of Object.entries(definition.properties)) {
    columns[name] = {
      type: prop.format ?? prop.type ?? 'unknown',
      notNull: notNull.has(name),
      hasDefault: prop.default !== undefined,
    };
  }
  return { columns };
}

/**
 * Re-reads the schema until `isReady` holds. PostgREST reloads its schema cache
 * asynchronously after DDL, so a table or column created a moment ago can be
 * briefly invisible. Returns the last schema read either way.
 */
export async function waitForSchema(
  tableName: string,
  isReady: (schema: TableSchema | null) => boolean,
  { attempts = 10, intervalMs = 500 } = {},
): Promise<TableSchema | null> {
  let schema = await fetchTableSchema(tableName);
  for (let attempt = 1; attempt < attempts && !isReady(schema); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    schema = await fetchTableSchema(tableName);
  }
  return schema;
}

/** The columns a file maps onto, with what the import checks them against. */
export function describeColumns(schema: TableSchema): TableColumns & { columns: string[] } {
  const names = Object.keys(schema.columns).filter((c) => !SYSTEM_COLUMNS.has(c));
  return {
    columns: names,
    columnTypes: Object.fromEntries(names.map((c) => [c, schema.columns[c].type])),
    // The import always generates slugs, so a file never has to supply one.
    requiredColumns: names.filter(
      (c) => c !== 'slug' && schema.columns[c].notNull && !schema.columns[c].hasDefault,
    ),
  };
}
