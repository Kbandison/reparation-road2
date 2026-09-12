'use client';

import { useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface Individual {
  id: string;
  givenName: string | null;
  surname: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  deathDate: string | null;
  shared: boolean;
}

/** Rendered at once; beyond this the list is filtered rather than scrolled. */
const VISIBLE_LIMIT = 300;

/**
 * A researcher's tree, read-only.
 *
 * A list rather than the pedigree canvas: the canvas exists to be rearranged
 * and edited, and none of that applies to someone else's tree. What a visitor
 * actually wants is to find a name, so the search box is the interface.
 *
 * People the viewer also holds are marked, because those are the reason to be
 * here at all.
 */
export function SharedTreeList({
  individuals,
  ownerName,
}: {
  individuals: Individual[];
  ownerName: string;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return individuals;
    return individuals.filter((i) =>
      [i.givenName, i.surname, i.birthPlace, i.birthDate]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q)),
    );
  }, [individuals, query]);

  const sharedCount = individuals.filter((i) => i.shared).length;
  const shown = filtered.slice(0, VISIBLE_LIMIT);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, place or year"
            className="pl-9 bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold rounded-xl"
          />
        </div>
        {sharedCount > 0 && (
          <p className="text-sm text-brand-muted shrink-0 inline-flex items-center gap-1.5">
            <Users className="w-4 h-4 text-brand-gold" />
            {sharedCount} also in your trees
          </p>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-brand-muted">
          Nobody in {ownerName}&rsquo;s tree matches &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {shown.map((i) => (
              <div
                key={i.id}
                className={`rounded-xl border px-4 py-3 ${
                  i.shared
                    ? 'border-brand-gold/30 bg-brand-gold/[0.05]'
                    : 'border-brand-gold/[0.08]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-brand-cream">
                    {[i.givenName, i.surname].filter(Boolean).join(' ') || 'Unnamed'}
                  </p>
                  {i.shared && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-gold/20 text-brand-gold shrink-0">
                      In your tree
                    </span>
                  )}
                </div>
                {(i.birthDate || i.deathDate) && (
                  <p className="text-xs text-brand-muted mt-0.5">
                    {i.birthDate ? `b. ${i.birthDate}` : ''}
                    {i.birthDate && i.deathDate ? ' · ' : ''}
                    {i.deathDate ? `d. ${i.deathDate}` : ''}
                  </p>
                )}
                {i.birthPlace && (
                  <p className="text-xs text-brand-muted/80 mt-0.5 truncate">{i.birthPlace}</p>
                )}
              </div>
            ))}
          </div>

          {filtered.length > shown.length && (
            // Stated rather than silently cut: a list that stops without saying
            // so reads as "that is everyone".
            <p className="text-xs text-brand-muted">
              Showing {shown.length} of {filtered.length.toLocaleString()}. Search to
              narrow it down.
            </p>
          )}
        </>
      )}
    </div>
  );
}
