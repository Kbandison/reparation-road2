'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Check, Loader2, Network, Search, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { lifespan } from '@/lib/family-tree/display';
import { buildSearchIndex, searchPeople } from '@/lib/family-tree/search';
import type { FamilyTree, TreeIndividual } from '@/lib/types';
import type { TreeSave } from '@/lib/hooks/use-tree-saves';

interface SaveToTreeButtonProps {
  collectionSlug: string;
  /** The record's id (not its slug): saved records are keyed by id. */
  recordId: string;
  recordTitle: string;
  saves: TreeSave[];
  onChanged: () => void;
}

type PersonRow = Pick<TreeIndividual, 'id' | 'tree_id' | 'given_name' | 'surname' | 'birth_date' | 'death_date' | 'birth_place'>;

const LAST_TREE_KEY = 'rr-save-to-tree:last-tree';
const MAX_RESULTS = 8;

/**
 * "Save to family tree" on an archive record: pick a person in one of your
 * trees (searched the same way as on the tree) and the record is saved to
 * their profile. A person can hold any number of records.
 */
export function SaveToTreeButton({ collectionSlug, recordId, recordTitle, saves, onChanged }: SaveToTreeButtonProps) {
  const [open, setOpen] = useState(false);
  const [trees, setTrees] = useState<FamilyTree[] | null>(null);
  const [treeId, setTreeId] = useState('');
  const [people, setPeople] = useState<Record<string, PersonRow[]>>({});
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saved = saves.length > 0;

  // Opening loads the trees once and starts the search on the record's name.
  const openDialog = async () => {
    setOpen(true);
    setQuery(recordTitle);
    setError(null);
    if (trees) return;
    try {
      const res = await fetch('/api/family-tree');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load your trees');
      const list: FamilyTree[] = data.trees ?? [];
      setTrees(list);
      let remembered = '';
      try {
        remembered = localStorage.getItem(LAST_TREE_KEY) ?? '';
      } catch {
        // Storage can be blocked; the first tree is a fine default.
      }
      setTreeId(list.some((t) => t.id === remembered) ? remembered : (list[0]?.id ?? ''));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your trees');
    }
  };

  // Each tree's people are fetched the first time it's picked.
  useEffect(() => {
    if (!open || !treeId || people[treeId]) return;
    let active = true;
    fetch(`/api/family-tree/${treeId}/people`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load that tree');
        if (active) setPeople((prev) => ({ ...prev, [treeId]: data.people ?? [] }));
      })
      .catch((err: unknown) => active && setError(err instanceof Error ? err.message : 'Could not load that tree'));
    return () => {
      active = false;
    };
  }, [open, treeId, people]);

  const treePeople = useMemo(() => people[treeId] ?? null, [people, treeId]);
  const index = useMemo(() => (treePeople ? buildSearchIndex(treePeople as TreeIndividual[]) : []), [treePeople]);
  const results = useMemo(() => searchPeople(index, query), [index, query]);
  const byId = useMemo(() => new Map((treePeople ?? []).map((p) => [p.id, p])), [treePeople]);
  const savedTo = new Set(saves.map((s) => s.individualId));

  const chooseTree = (id: string) => {
    setTreeId(id);
    try {
      localStorage.setItem(LAST_TREE_KEY, id);
    } catch {
      // Not remembering the choice is fine.
    }
  };

  const save = async (individualId: string, name: string) => {
    setBusy(individualId);
    setError(null);
    try {
      const res = await fetch('/api/family-tree/saved-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ individualId, collectionSlug, recordId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save the record');
      toast.success(`Saved to ${name}`);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the record');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (entry: TreeSave) => {
    setBusy(entry.matchId);
    setError(null);
    try {
      const res = await fetch(`/api/family-tree/saved-records?matchId=${encodeURIComponent(entry.matchId)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not remove it');
      toast.success(`Removed from ${entry.personName}`);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove it');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className={`p-1.5 rounded-lg hover:bg-brand-card transition-colors ${saved ? 'text-brand-gold' : 'text-brand-muted hover:text-brand-cream'}`}
        aria-label={saved ? 'Saved to your family tree' : 'Save to family tree'}
        title={saved ? `Saved to ${saves.map((s) => s.personName).join(', ')}` : 'Save to family tree'}
      >
        <Network className="w-4 h-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        {/* Opened from inside the record viewer (z-[100], full-screen scan z-[110]), so it has to sit above both. */}
        <DialogContent
          overlayClassName="z-[120]"
          className="z-[130] max-h-[90vh] overflow-y-auto border-brand-gold/[0.12] bg-brand-card text-brand-cream sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle className="font-display text-brand-cream">Save to family tree</DialogTitle>
            <DialogDescription className="text-brand-muted">
              Save <span className="text-brand-cream">“{recordTitle}”</span> to someone in your tree. It appears on their profile.
            </DialogDescription>
          </DialogHeader>

          {saves.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-wide text-brand-muted">Saved to</p>
              <ul className="space-y-1">
                {saves.map((s) => (
                  <li key={s.matchId} className="flex items-center gap-2 rounded-xl border border-brand-sage/30 bg-brand-sage/[0.06] px-3 py-2 text-sm">
                    <Check className="w-3.5 h-3.5 shrink-0 text-brand-sage" aria-hidden="true" />
                    <Link href={`/family-tree/${s.treeId}/person/${s.individualId}`} className="min-w-0 truncate text-brand-cream hover:text-brand-gold">
                      {s.personName}
                    </Link>
                    <span className="truncate text-xs text-brand-muted">· {s.treeName}</span>
                    <button
                      type="button"
                      onClick={() => remove(s)}
                      disabled={busy === s.matchId}
                      className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs text-brand-muted hover:text-brand-burgundy-light"
                      aria-label={`Remove from ${s.personName}`}
                    >
                      {busy === s.matchId ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />} Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {trees === null && !error ? (
            <p className="flex items-center gap-2 text-sm text-brand-muted">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading your trees…
            </p>
          ) : trees && trees.length === 0 ? (
            <p className="text-sm text-brand-muted">
              You don’t have a family tree yet. <Link href="/family-tree" className="text-brand-gold hover:text-brand-gold-light">Start one</Link>, then save records to the people in it.
            </p>
          ) : trees && (
            <div className="space-y-3">
              {trees.length > 1 && (
                <div className="space-y-1.5">
                  <label htmlFor="save-tree-pick" className="block text-xs text-brand-muted">Tree</label>
                  <select
                    id="save-tree-pick"
                    value={treeId}
                    onChange={(e) => chooseTree(e.target.value)}
                    className="w-full rounded-xl border border-brand-gold/[0.15] bg-brand-bg px-3 py-2 text-sm text-brand-cream focus:border-brand-gold/40 focus:outline-none"
                  >
                    {trees.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} · started {new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-muted" aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search people in this tree…"
                  aria-label="Search people in this tree"
                  autoComplete="off"
                  spellCheck={false}
                  className="h-10 w-full rounded-xl border border-brand-gold/[0.15] bg-brand-bg pl-8 pr-3 text-sm text-brand-cream placeholder:text-brand-muted focus:border-brand-gold/40 focus:outline-none"
                />
              </div>

              {!treePeople ? (
                <p className="flex items-center gap-2 text-sm text-brand-muted">
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading people…
                </p>
              ) : !query.trim() ? (
                <p className="text-xs text-brand-muted">Type a name to find who this record belongs to.</p>
              ) : results.length === 0 ? (
                <p className="text-xs text-brand-muted">No one named “{query.trim()}” in this tree. Try fewer words, or just a surname.</p>
              ) : (
                <ul className="max-h-72 divide-y divide-brand-gold/[0.06] overflow-y-auto rounded-xl border border-brand-gold/[0.12]">
                  {results.slice(0, MAX_RESULTS).map((entry) => {
                    const p = byId.get(entry.id);
                    const meta = [p ? lifespan(p) : '', p?.birth_place?.trim()].filter(Boolean).join(' · ');
                    const already = savedTo.has(entry.id);
                    return (
                      <li key={entry.id} className="flex items-center gap-3 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-brand-cream">{entry.name}</p>
                          {meta && <p className="truncate text-[11px] text-brand-muted">{meta}</p>}
                        </div>
                        {already ? (
                          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-brand-sage">
                            <Check className="w-3.5 h-3.5" aria-hidden="true" /> Saved
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => save(entry.id, entry.name)}
                            disabled={busy !== null}
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand-gold px-2.5 py-1 text-xs text-brand-bg hover:bg-brand-gold-light disabled:opacity-60"
                          >
                            {busy === entry.id ? <Loader2 className="w-3 h-3 animate-spin" aria-label="Saving" /> : 'Save'}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {results.length > MAX_RESULTS && (
                <p className="text-[11px] text-brand-muted">
                  {MAX_RESULTS} of {results.length.toLocaleString()} matches. Keep typing to narrow it down.
                </p>
              )}
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-xl border border-brand-burgundy/25 bg-brand-burgundy/10 px-3 py-2 text-sm text-brand-burgundy-light">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** "Saved to Amos Bird in My Family Tree", shown on a record the viewer has saved. */
export function SavedToTreeNote({ saves }: { saves: TreeSave[] }) {
  if (saves.length === 0) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 border-b border-brand-gold/[0.06] bg-brand-sage/[0.06] px-6 py-2 text-xs text-brand-cream">
      <Network className="mr-1 w-3.5 h-3.5 text-brand-sage" aria-hidden="true" />
      Saved to
      {saves.map((s, i) => (
        <span key={s.matchId}>
          <Link href={`/family-tree/${s.treeId}/person/${s.individualId}`} className="font-medium text-brand-gold hover:text-brand-gold-light">
            {s.personName}
          </Link>
          <span className="text-brand-muted"> in {s.treeName}</span>
          {i < saves.length - 1 ? ',' : ''}
        </span>
      ))}
    </p>
  );
}
