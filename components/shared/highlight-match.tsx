import type { ReactNode } from 'react';

// Same tokenization rules the search API uses, so the UI highlights every
// token that the query matched on (not just the literal phrase).
function tokenizeQuery(q: string): string[] {
  return q
    .trim()
    .split(/[\s,.;:()/\\-]+/)
    .map((t) => t.replace(/[%,]/g, ''))
    .filter((t) => t.length >= 2);
}

interface HighlightMatchProps {
  text: string;
  query: string;
}

/**
 * Highlights every token of the search query inside `text` and trims the
 * surrounding string to a window around the matches with leading/trailing
 * ellipses. Falls through to the raw text if the query has no usable tokens
 * or none of them appear in the value.
 */
export function HighlightMatch({ text, query }: HighlightMatchProps) {
  if (!query || query.length < 2 || !text) return <>{text}</>;

  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return <>{text}</>;

  const lowerText = text.toLowerCase();
  type Match = { start: number; end: number };
  const matches: Match[] = [];
  for (const token of tokens) {
    const lowerToken = token.toLowerCase();
    let idx = 0;
    while ((idx = lowerText.indexOf(lowerToken, idx)) !== -1) {
      matches.push({ start: idx, end: idx + token.length });
      idx += Math.max(1, token.length);
    }
  }

  if (matches.length === 0) return <>{text}</>;

  // Merge overlapping/adjacent matches so we don't render a single span
  // as multiple <mark> elements.
  matches.sort((a, b) => a.start - b.start);
  const merged: Match[] = [matches[0]];
  for (let i = 1; i < matches.length; i++) {
    const last = merged[merged.length - 1];
    if (matches[i].start <= last.end) {
      last.end = Math.max(last.end, matches[i].end);
    } else {
      merged.push({ ...matches[i] });
    }
  }

  // Context window around the matches.
  const firstStart = merged[0].start;
  const lastEnd = merged[merged.length - 1].end;
  const contextStart = Math.max(0, firstStart - 80);
  const contextEnd = Math.min(text.length, lastEnd + 80);

  const segments: ReactNode[] = [];
  if (contextStart > 0) segments.push('...');

  let cursor = contextStart;
  let key = 0;
  for (const m of merged) {
    if (m.start >= contextEnd) break;
    if (m.start > cursor) segments.push(text.slice(cursor, m.start));
    const end = Math.min(m.end, contextEnd);
    segments.push(
      <mark key={key++} className="bg-brand-gold/30 text-brand-cream rounded px-0.5">
        {text.slice(m.start, end)}
      </mark>,
    );
    cursor = end;
  }
  if (cursor < contextEnd) segments.push(text.slice(cursor, contextEnd));
  if (contextEnd < text.length) segments.push('...');

  return <>{segments}</>;
}
