'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Pencil, Check } from 'lucide-react';
import type { FamilyTree } from '@/lib/types';

export function TreeHeader({ tree }: { tree: FamilyTree }) {
  const [name, setName] = useState(tree.name);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tree.name);

  async function save() {
    const next = draft.trim() || name;
    setName(next);
    setEditing(false);
    if (next === name) return;
    await fetch(`/api/family-tree/${tree.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: next }),
    }).catch(() => {});
  }

  return (
    <div className="flex items-center gap-3 min-w-0">
      <Link
        href="/family-tree"
        className="inline-flex items-center gap-1 text-sm text-brand-muted hover:text-brand-cream transition-colors shrink-0"
      >
        <ChevronLeft className="w-4 h-4" /> Trees
      </Link>
      <span className="text-brand-gold/30 shrink-0">/</span>
      {editing ? (
        <div className="flex items-center gap-2 min-w-0">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') {
                setDraft(name);
                setEditing(false);
              }
            }}
            className="font-display text-xl font-semibold bg-brand-bg/60 border border-brand-gold/30 rounded-lg px-2 py-0.5 text-brand-cream focus:outline-none focus:border-brand-gold/60 min-w-0"
          />
          <button onClick={save} className="text-brand-gold hover:text-brand-gold-light" aria-label="Save name">
            <Check className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => {
            setDraft(name);
            setEditing(true);
          }}
          className="group inline-flex items-center gap-2 min-w-0"
        >
          <h1 className="font-display text-xl font-semibold text-brand-cream truncate">{name}</h1>
          <Pencil className="w-3.5 h-3.5 text-brand-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </button>
      )}
    </div>
  );
}
