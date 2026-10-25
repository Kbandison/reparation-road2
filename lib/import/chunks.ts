import type { ApiResult } from './http';
import type { ImportFailure } from './types';

/**
 * Sending a large file in pieces. Vercel refuses request bodies over 4.5 MB
 * (FUNCTION_PAYLOAD_TOO_LARGE), and the wizard used to send every row in one
 * request, so files past roughly 17,000 rows never got in.
 */

/** Well under Vercel's 4.5 MB, leaving room for the column mapping and tag sent with every chunk. */
export const CHUNK_MAX_BYTES = 3_000_000;

/** Also capped by rows, so each request finishes in seconds and a failure costs little. */
export const CHUNK_MAX_ROWS = 5_000;

/** Rows `start` (inclusive) to `end` (exclusive) of the file. */
export interface RowChunk {
  start: number;
  end: number;
}

/**
 * Splits `count` rows into consecutive chunks, starting a new one before a row
 * would push the current one past `maxBytes` or `maxRows`. A single row bigger
 * than `maxBytes` still gets a chunk of its own.
 */
export function chunkRows(
  count: number,
  rowBytes: (index: number) => number,
  { maxBytes = CHUNK_MAX_BYTES, maxRows = CHUNK_MAX_ROWS } = {},
): RowChunk[] {
  const chunks: RowChunk[] = [];
  let start = 0;
  let bytes = 0;
  for (let i = 0; i < count; i++) {
    const size = rowBytes(i);
    if (i > start && (bytes + size > maxBytes || i - start >= maxRows)) {
      chunks.push({ start, end: i });
      start = i;
      bytes = 0;
    }
    bytes += size;
  }
  if (count > start) chunks.push({ start, end: count });
  return chunks;
}

/** Bytes a value takes once sent as JSON (UTF-8), for sizing chunks. */
export function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/** Progress through a chunked step, in rows. */
export interface ChunkProgress {
  done: number;
  total: number;
}

const rowsOf = (chunk: RowChunk) => chunk.end - chunk.start;

/**
 * A failure the server couldn't have written anything for: every 4xx comes
 * back from checks that run before the insert (or from Vercel refusing the
 * request outright). A 5xx or a dropped connection could have happened midway.
 */
const isRejectedBeforeWriting = (status: number) => status >= 400 && status < 500;

/**
 * Sends every chunk as a dry run, so a value that doesn't fit stops the import
 * before any chunk is written. A dry run writes nothing, so a dropped
 * connection or server hiccup is retried once. Returns the first failure.
 */
export async function checkChunks(
  chunks: RowChunk[],
  check: (chunk: RowChunk) => Promise<ApiResult>,
  onProgress?: (progress: ChunkProgress) => void,
): Promise<ApiResult | null> {
  const total = chunks.reduce((n, c) => n + rowsOf(c), 0);
  let done = 0;
  for (const chunk of chunks) {
    let result = await check(chunk);
    if (!result.ok && !isRejectedBeforeWriting(result.status)) result = await check(chunk);
    if (!result.ok) return result;
    done += rowsOf(chunk);
    onProgress?.({ done, total });
  }
  return null;
}

export interface ChunkedInsertResult {
  inserted: number;
  /** Rows that didn't go in (or may not have), grouped by reason, with their spreadsheet row numbers. */
  failures: ImportFailure[];
  /** Why the import stopped before the last chunk, or null when every chunk was sent. */
  stopReason: string | null;
  /** The very first chunk was refused as not fitting the table, so nothing at all was written. */
  rejectedUpFront: boolean;
}

/**
 * Inserts chunk by chunk, in order. When a request fails in a way that could
 * have happened midway (a 5xx or a dropped connection), the table's row count
 * shows whether the chunk landed: all of it counts as inserted, none of it is
 * retried once, and anything else stops the import. Retrying blind could
 * insert the same rows twice.
 *
 * After a stop, the remaining rows are reported as failures, so the admin's
 * "rows to fix" download holds exactly what still needs importing.
 */
export async function insertChunks({
  chunks,
  rowNumbers,
  insert,
  countRows,
  onProgress,
}: {
  chunks: RowChunk[];
  /** Spreadsheet row of each file row, for reporting rows that didn't go in. */
  rowNumbers: number[];
  insert: (chunk: RowChunk) => Promise<ApiResult>;
  /** The table's current row count, or null when it can't be read. */
  countRows: () => Promise<number | null>;
  onProgress?: (progress: ChunkProgress) => void;
}): Promise<ChunkedInsertResult> {
  const total = chunks.reduce((n, c) => n + rowsOf(c), 0);
  let inserted = 0;
  let done = 0;
  const rowsByMessage = new Map<string, number[]>();
  const fail = (message: string, chunk: RowChunk) => {
    const list = rowsByMessage.get(message) ?? [];
    for (let i = chunk.start; i < chunk.end; i++) list.push(rowNumbers[i] ?? i + 2);
    rowsByMessage.set(message, list);
  };
  const result = (stopReason: string | null, rejectedUpFront = false): ChunkedInsertResult => ({
    inserted,
    failures: [...rowsByMessage].map(([message, rows]) => ({ message, rows })),
    stopReason,
    rejectedUpFront,
  });

  // Rows already in the table, so a failed request can be checked against it.
  const baseline = await countRows();

  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    let stop: { reason: string; uncertain: boolean } | null = null;

    for (let attempt = 0; ; attempt++) {
      const response = await insert(chunk);
      if (response.ok) {
        inserted += Number(response.data.inserted) || 0;
        const failures = Array.isArray(response.data.failures) ? (response.data.failures as ImportFailure[]) : [];
        for (const { message, rows } of failures) rowsByMessage.set(message, [...(rowsByMessage.get(message) ?? []), ...rows]);
        break;
      }

      const reason = response.data.error || 'The import request failed';
      if (isRejectedBeforeWriting(response.status)) {
        if (index === 0 && response.status === 422) return result(reason, true);
        stop = { reason, uncertain: false };
        break;
      }

      // Did the chunk land before the request failed?
      const now = await countRows();
      const landed = now === null || baseline === null ? null : now - (baseline + inserted);
      if (landed === rowsOf(chunk)) {
        inserted += landed;
        break;
      }
      if (landed === 0 && attempt === 0) continue;
      stop = { reason, uncertain: landed !== 0 };
      break;
    }

    if (stop) {
      fail(
        stop.uncertain
          ? `Some of these may have gone in before the import stopped (${stop.reason}). Check the collection before importing them again.`
          : `Not imported: the import stopped here (${stop.reason})`,
        chunk,
      );
      for (const rest of chunks.slice(index + 1)) fail(`Not imported: the import stopped before reaching these rows (${stop.reason})`, rest);
      return result(stop.reason);
    }

    done += rowsOf(chunk);
    onProgress?.({ done, total });
  }

  return result(null);
}
