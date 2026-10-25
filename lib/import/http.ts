/**
 * Reading the import API's answers in the browser. The API answers in JSON
 * with an `error` message, but a request Vercel stops before it reaches the
 * route (too large, too slow, a crash) comes back as plain text. Reading only
 * JSON turned those into vague fallbacks like "The file failed its final check".
 */

export interface ApiResult {
  ok: boolean;
  status: number;
  /** The parsed JSON body. When the request failed, `error` always holds a readable reason. */
  data: Record<string, unknown> & { error?: string };
}

/** Why a request failed when the answer isn't the API's own JSON. */
export function describeHttpFailure(status: number, bodyText: string): string {
  // Vercel's error pages name the cause, e.g. FUNCTION_PAYLOAD_TOO_LARGE.
  const code = bodyText.match(/\b[A-Z]+(?:_[A-Z]+){2,}\b/)?.[0];
  const reason =
    status === 413
      ? 'The request was too large for the server'
      : status === 504
        ? 'The server took too long to answer'
        : `The server answered with an error (HTTP ${status})`;
  return code ? `${reason} (${code}).` : `${reason}.`;
}

/** Reads a response as the import API's JSON, giving every failure a readable `error`. */
export async function readApiResponse(res: Response): Promise<ApiResult> {
  const text = await res.text().catch(() => '');
  let data: ApiResult['data'] = {};
  try {
    const parsed: unknown = text ? JSON.parse(text) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed as ApiResult['data'];
  } catch {
    // Not JSON: Vercel (or a proxy) answered before the route did.
  }
  if (!res.ok && typeof data.error !== 'string') data = { ...data, error: describeHttpFailure(res.status, text) };
  return { ok: res.ok, status: res.status, data };
}

/** fetch, but a dropped connection comes back as a failed result instead of throwing. */
export async function fetchApi(input: string, init?: RequestInit): Promise<ApiResult> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    return { ok: false, status: 0, data: { error: "Couldn't reach the server. Check your connection and try again." } };
  }
  return readApiResponse(res);
}
