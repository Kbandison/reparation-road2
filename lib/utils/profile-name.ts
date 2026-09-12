/**
 * How a person is named across the site.
 *
 * This existed in eight places with fallbacks that had drifted apart, which is
 * why the dashboard greeted most people as "Researcher" while the forum showed
 * their name perfectly well: one copy read first_name and nothing else, and
 * most accounts have no first_name at all.
 */

export interface NameableProfile {
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  handle?: string | null;
}

/**
 * The full name to show in headings, bylines and cards.
 *
 * A display name wins when set — it is the name the person chose. Otherwise
 * their real name, then their handle, which everyone now has, so the generic
 * fallback is close to unreachable.
 */
export function profileName(p: NameableProfile | null | undefined, fallback = 'Researcher'): string {
  if (!p) return fallback;

  const display = p.display_name?.trim();
  if (display) return display;

  // Collapses inner whitespace: imported names carry stray spaces
  // ("Michael Nancy " + "Edge") which would otherwise show a double gap.
  const full = [p.first_name, p.last_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ');
  if (full) return full;

  const handle = p.handle?.trim();
  if (handle) return handle;

  return fallback;
}

/**
 * The short form for greetings.
 *
 * "Welcome back, Kevin" rather than the full name — but derived from whatever
 * profileName resolves to, so someone who set only a display name is greeted by
 * it rather than being told they are a Researcher.
 */
export function profileFirstName(
  p: NameableProfile | null | undefined,
  fallback = 'Researcher',
): string {
  const first = p?.first_name?.trim();
  if (first) return first.split(/\s+/)[0];

  const resolved = profileName(p, fallback);
  return resolved.split(/\s+/)[0] || fallback;
}
