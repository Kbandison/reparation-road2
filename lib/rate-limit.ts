import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Rate limiting for public endpoints.
 *
 * Counting happens in Postgres rather than in the process: serverless functions
 * are replaced and run concurrently, so an in-memory counter resets constantly
 * and stops nothing. It only appears to work in local testing, which is the
 * worst property a limiter can have.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets. */
  retryAfter: number;
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    if (error || !data?.[0]) {
      console.error('[rate-limit] check failed, allowing request:', error);
      // Fail open. The endpoints behind this all need the database anyway, so a
      // database that cannot answer will fail the request a moment later on its
      // own — refusing here would only turn an outage into a confusing one.
      return { allowed: true, remaining: 0, retryAfter: 0 };
    }

    const row = data[0] as { allowed: boolean; remaining: number; retry_after: number };
    return {
      allowed: row.allowed,
      remaining: row.remaining,
      retryAfter: row.retry_after,
    };
  } catch (e) {
    console.error('[rate-limit] check threw, allowing request:', e);
    return { allowed: true, remaining: 0, retryAfter: 0 };
  }
}

/**
 * Apply several limits at once, reporting the first that trips.
 *
 * Every limit is counted even after one fails, so a caller hammering the
 * endpoint still accrues against the global budget rather than getting a free
 * pass once their per-IP limit is spent.
 */
export async function checkRateLimits(
  limits: { key: string; limit: number; windowSeconds: number }[],
): Promise<RateLimitResult> {
  const results = await Promise.all(
    limits.map((l) => checkRateLimit(l.key, l.limit, l.windowSeconds)),
  );
  const blocked = results.find((r) => !r.allowed);
  return blocked ?? { allowed: true, remaining: Math.min(...results.map((r) => r.remaining)), retryAfter: 0 };
}

/** Standard headers so a well-behaved client can back off on its own. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'Retry-After': String(result.retryAfter),
    'X-RateLimit-Remaining': String(result.remaining),
  };
}
