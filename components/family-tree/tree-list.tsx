'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Loader2, Trash2, Network, Users, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils/format';
import type { FamilyTree } from '@/lib/types';

export type TreeWithCount = FamilyTree & { count: number };

export function TreeList({ initialTrees }: { initialTrees: TreeWithCount[] }) {
  const router = useRouter();
  const [trees, setTrees] = useState(initialTrees);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function createTree() {
    setCreating(true);
    try {
      const res = await fetch('/api/family-tree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'My Family Tree' }),
      });
      const data = await res.json();
      if (data.tree) router.push(`/family-tree/${data.tree.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function deleteTree(id: string) {
    if (!window.confirm('Delete this tree and everyone in it? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await fetch(`/api/family-tree/${id}`, { method: 'DELETE' });
      setTrees((t) => t.filter((x) => x.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-6">
        <Button
          onClick={createTree}
          disabled={creating}
          className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          New tree
        </Button>
      </div>

      {trees.length === 0 ? (
        <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-12 text-center">
          <Network className="w-12 h-12 text-brand-gold/50 mx-auto mb-4" />
          <h2 className="font-display text-xl text-brand-cream mb-2">Build your family tree</h2>
          <p className="text-sm text-brand-muted max-w-md mx-auto mb-6">
            Create a tree from scratch, or import a GEDCOM file from Ancestry, FamilySearch, or any
            genealogy program — then cross-reference your ancestors against the archive.
          </p>
          <Button
            onClick={createTree}
            disabled={creating}
            className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create your first tree
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {trees.map((tree) => (
            <div
              key={tree.id}
              className="group relative bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-5 hover:border-brand-gold/[0.25] transition-colors"
            >
              <Link href={`/family-tree/${tree.id}`} className="block">
                <Network className="w-6 h-6 text-brand-gold mb-3" />
                <h3 className="font-display text-lg font-semibold text-brand-cream truncate pr-6">
                  {tree.name}
                </h3>
                {tree.description && (
                  <p className="text-sm text-brand-muted mt-1 line-clamp-2">{tree.description}</p>
                )}
                <div className="flex items-center gap-3 mt-4 text-xs text-brand-muted">
                  <span className="inline-flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> {tree.count} {tree.count === 1 ? 'person' : 'people'}
                  </span>
                  <span>Updated {formatDate(tree.updated_at)}</span>
                </div>
                <span className="inline-flex items-center gap-1 text-xs text-brand-gold mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  Open <ArrowRight className="w-3 h-3" />
                </span>
              </Link>
              <button
                onClick={() => deleteTree(tree.id)}
                disabled={deletingId === tree.id}
                className="absolute top-4 right-4 text-brand-muted hover:text-brand-burgundy-light transition-colors"
                aria-label="Delete tree"
              >
                {deletingId === tree.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
