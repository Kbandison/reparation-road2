'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Search, X } from 'lucide-react';
import type { TreeIndividual } from '@/lib/types';
import { lifespan } from '@/lib/family-tree/display';
import { buildSearchIndex, searchPeople } from '@/lib/family-tree/search';

const MAX_RESULTS = 8;

interface TreeSearchProps {
  individuals: TreeIndividual[];
  /** Take the view to this person. */
  onPick: (id: string) => void;
}

/**
 * Search the whole tree by name as you type. Picking a result takes the view
 * to that person. Press "/" anywhere on the page to jump into the box.
 */
export function TreeSearch({ individuals, onPick }: TreeSearchProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const byId = useMemo(() => new Map(individuals.map((p) => [p.id, p])), [individuals]);
  const index = useMemo(() => buildSearchIndex(individuals), [individuals]);
  const matches = useMemo(() => searchPeople(index, query), [index, query]);
  const shown = matches.slice(0, MAX_RESULTS);
  const listOpen = open && query.trim().length > 0;

  // "/" focuses the search, unless the user is already typing somewhere.
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pick = (id: string) => {
    onPick(id);
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(shown.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (listOpen && shown[active]) {
        e.preventDefault();
        pick(shown[active].id);
      }
    } else if (e.key === 'Escape') {
      if (listOpen) setOpen(false);
      else {
        setQuery('');
        inputRef.current?.blur();
      }
    }
  };

  return (
    <div className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-muted" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // Wait a beat so a click on a result lands before the list closes.
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
        placeholder="Search people…"
        aria-label="Search people in this tree"
        role="combobox"
        aria-expanded={listOpen}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={listOpen && shown[active] ? `${listId}-${shown[active].id}` : undefined}
        autoComplete="off"
        spellCheck={false}
        className="h-9 w-full rounded-xl border border-brand-gold/20 bg-brand-card/90 pl-8 pr-14 text-sm text-brand-cream placeholder:text-brand-muted backdrop-blur focus:border-brand-gold/50 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {query ? (
        <button
          type="button"
          onClick={() => {
            setQuery('');
            inputRef.current?.focus();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-brand-muted hover:text-brand-cream"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : (
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-brand-gold/20 px-1.5 text-[10px] text-brand-muted sm:block">/</kbd>
      )}

      {listOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-brand-gold/20 bg-brand-card shadow-xl">
          {shown.length === 0 ? (
            <p className="px-3 py-3 text-xs text-brand-muted">No one named “{query.trim()}” in this tree.</p>
          ) : (
            <ul id={listId} role="listbox" aria-label="People" className="max-h-80 overflow-y-auto py-1">
              {shown.map((entry, i) => {
                const person = byId.get(entry.id);
                const years = person ? lifespan(person) : '';
                const place = person?.birth_place?.trim();
                return (
                  <li
                    key={entry.id}
                    id={`${listId}-${entry.id}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    // mousedown, not click: it fires before the input's blur closes the list.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(entry.id);
                    }}
                    className={`cursor-pointer px-3 py-2 ${i === active ? 'bg-brand-card-hover' : ''}`}
                  >
                    <p className="truncate text-sm text-brand-cream">{entry.name}</p>
                    {(years || place) && (
                      <p className="truncate text-[11px] text-brand-muted">
                        {[years, place].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {matches.length > shown.length && (
            <p className="border-t border-brand-gold/[0.08] px-3 py-1.5 text-[11px] text-brand-muted">
              {shown.length} of {matches.length.toLocaleString()} matches. Keep typing to narrow it down.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
