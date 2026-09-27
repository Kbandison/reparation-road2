import type { ImportColumnType, RowValue } from './types';

/**
 * Value-level rules for the spreadsheet import: what counts as blank, which
 * values a Postgres column type will accept, and which type a brand-new column
 * should get. Pure functions, shared by the wizard and the import route so the
 * browser's pre-check and the server's final check can never disagree.
 */

type IntegerType = 'smallint' | 'integer' | 'bigint';

// BigInt keeps bigint bounds exact past 2^53; built from strings because the
// ES2017 build target has no bigint literals.
const INTEGER_BOUNDS: Record<IntegerType, [bigint, bigint]> = {
  smallint: [BigInt('-32768'), BigInt('32767')],
  integer: [BigInt('-2147483648'), BigInt('2147483647')],
  bigint: [BigInt('-9223372036854775808'), BigInt('9223372036854775807')],
};

const DECIMAL_TYPES = new Set(['numeric', 'real', 'double precision']);
const TEXT_TYPES = new Set(['text', 'character varying', 'character']);

// What Postgres accepts for an existing whole-number column: optional sign,
// digits only. No decimals, exponents or thousands separators.
const WHOLE_NUMBER = /^[+-]?\d+$/;
// Stricter test for giving a NEW column a number type. No "+" and no leading
// zeros, so an identifier like "007" stays text and keeps its zeros.
const CANONICAL_WHOLE_NUMBER = /^(0|-?[1-9]\d*)$/;
const DECIMAL_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

const PG_TRUE = new Set(['t', 'true', 'y', 'yes', 'on', '1']);
const PG_FALSE = new Set(['f', 'false', 'n', 'no', 'off', '0']);

export function isIntegerType(pgType: string): pgType is IntegerType {
  return pgType in INTEGER_BOUNDS;
}

/** An empty cell: nothing at all, or only whitespace. */
export function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

/** A value as the spreadsheet shows it, for examples and error messages. */
export function displayValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value);
}

function fitsIntegerType(value: unknown, pgType: IntegerType, canonical = false): boolean {
  let n: bigint;
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) return false;
    // Straight from the number: String(1e21) is "1e+21", which BigInt rejects.
    n = BigInt(value);
  } else if (typeof value === 'string') {
    const digits = value.trim();
    if (!(canonical ? CANONICAL_WHOLE_NUMBER : WHOLE_NUMBER).test(digits)) return false;
    n = BigInt(digits);
  } else {
    return false;
  }
  const [min, max] = INTEGER_BOUNDS[pgType];
  return n >= min && n <= max;
}

/** Postgres's reading of a yes/no value, or null when it isn't one. */
function toBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1 ? true : value === 0 ? false : null;
  if (typeof value !== 'string') return null;
  const word = value.trim().toLowerCase();
  if (PG_TRUE.has(word)) return true;
  if (PG_FALSE.has(word)) return false;
  return null;
}

/**
 * Whether a column of `pgType` will accept `value`. Types the import can't
 * check exactly (dates, uuids, json…) pass here; if one of those values is bad
 * after all, the insert pinpoints its row instead.
 */
export function valueFitsColumn(value: unknown, pgType: string): boolean {
  if (isBlank(value)) return true;
  if (isIntegerType(pgType)) return fitsIntegerType(value, pgType);
  if (DECIMAL_TYPES.has(pgType)) {
    if (typeof value === 'number') return Number.isFinite(value);
    return typeof value === 'string' && DECIMAL_NUMBER.test(value.trim());
  }
  if (pgType === 'boolean') return toBoolean(value) !== null;
  return true;
}

/**
 * The value to send for a column of `pgType`. Blanks become null. Numbers and
 * yes/no values go as real JSON numbers/booleans. Text goes exactly as typed.
 */
export function normalizeForColumn(value: unknown, pgType: string | undefined): unknown {
  if (isBlank(value)) return null;
  if (!pgType) return value;
  if (isIntegerType(pgType)) {
    if (typeof value === 'number') return value;
    const digits = String(value).trim();
    // bigint can exceed 2^53, so it travels as a string Postgres parses exactly.
    return pgType === 'bigint' ? digits : Number(digits);
  }
  if (DECIMAL_TYPES.has(pgType)) return typeof value === 'number' ? value : String(value).trim();
  if (pgType === 'boolean') return toBoolean(value) ?? value;
  return value;
}

/** Existing column types the wizard can safely widen to text without losing anything. */
export function canConvertToText(pgType: string): boolean {
  return isIntegerType(pgType) || DECIMAL_TYPES.has(pgType) || pgType === 'boolean';
}

/** Plain-English name for a Postgres column type. */
export function typeLabel(pgType: string): string {
  if (TEXT_TYPES.has(pgType)) return 'Text';
  if (isIntegerType(pgType)) return 'Whole number';
  if (DECIMAL_TYPES.has(pgType)) return 'Decimal number';
  if (pgType === 'boolean') return 'Yes/No';
  if (pgType === 'date') return 'Date';
  if (pgType.startsWith('timestamp')) return 'Date & time';
  if (pgType === 'json' || pgType === 'jsonb') return 'JSON';
  if (pgType === 'uuid') return 'ID';
  return pgType;
}

/** How a new column's values shape the type it can have. */
export interface ColumnProfile {
  /** The type a new column gets unless the admin picks another. */
  inferred: ImportColumnType;
  /** Every type these values fit. Text always does. */
  allowed: ImportColumnType[];
  /**
   * Set when the column is mostly whole numbers but some values aren't, which
   * is why it stays text. The examples let the wizard say so.
   */
  notWhole?: { count: number; examples: RowValue[] };
}

/**
 * Picks a type for a brand-new column from EVERY value it will hold, not a
 * sample. A column only becomes a number when each value is a clean whole
 * number. Anything else ("7months", "-", "abt 30") stays text, word for word.
 */
export function profileColumn(entries: { row: number; value: unknown }[]): ColumnProfile {
  let filled = 0;
  let whole = 0;
  let trueFalse = 0;
  let notWholeCount = 0;
  const examples: RowValue[] = [];

  for (const { row, value } of entries) {
    if (isBlank(value)) continue;
    filled++;
    if (fitsIntegerType(value, 'integer', true)) {
      whole++;
    } else {
      notWholeCount++;
      const shown = displayValue(value);
      if (examples.length < 3 && !examples.some((e) => e.value === shown)) {
        examples.push({ row, value: shown });
      }
    }
    if (typeof value === 'boolean' || (typeof value === 'string' && /^(true|false)$/i.test(value.trim()))) {
      trueFalse++;
    }
  }

  // An all-blank column has nothing to go on, so it stays text. Typing it as a
  // number would reject whatever a later import puts there.
  const canBeInteger = filled > 0 && whole === filled;
  const canBeBoolean = filled > 0 && trueFalse === filled;
  const allowed: ImportColumnType[] = ['text'];
  if (canBeInteger) allowed.push('integer');
  if (canBeBoolean) allowed.push('boolean');

  return {
    inferred: canBeInteger ? 'integer' : canBeBoolean ? 'boolean' : 'text',
    allowed,
    notWhole:
      !canBeInteger && whole > 0 && whole >= notWholeCount
        ? { count: notWholeCount, examples }
        : undefined,
  };
}
