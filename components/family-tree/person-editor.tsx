'use client';

import { useState, useEffect } from 'react';
import {
  X,
  Trash2,
  UserPlus,
  Heart,
  Baby,
  Search,
  Loader2,
  Link2,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TreeIndividual, ArchiveMatch } from '@/lib/types';
import { fullName } from '@/lib/family-tree/display';

interface Props {
  person: TreeIndividual;
  onSave: (patch: Partial<TreeIndividual>) => Promise<void>;
  onDelete: () => Promise<void>;
  onAddRelative: (kind: 'parent' | 'child' | 'spouse') => void;
  onLinkArchive: (match: ArchiveMatch | null) => Promise<void>;
  onClose: () => void;
}

const FIELD =
  'w-full rounded-xl border border-brand-gold/[0.12] bg-brand-bg/60 px-3 py-2 text-sm text-brand-cream placeholder:text-brand-muted/60 focus:border-brand-gold/40 focus:outline-none';
const LABEL = 'block text-xs font-medium text-brand-muted mb-1';

export function PersonEditor({
  person,
  onSave,
  onDelete,
  onAddRelative,
  onLinkArchive,
  onClose,
}: Props) {
  const [form, setForm] = useState(person);
  const [saving, setSaving] = useState(false);
  const [matches, setMatches] = useState<ArchiveMatch[] | null>(null);
  const [matching, setMatching] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  // Reset the form whenever a different person is selected.
  useEffect(() => {
    setForm(person);
    setMatches(null);
  }, [person]);

  function set<K extends keyof TreeIndividual>(key: K, value: TreeIndividual[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        given_name: form.given_name,
        surname: form.surname,
        sex: form.sex,
        birth_date: form.birth_date,
        birth_place: form.birth_place,
        death_date: form.death_date,
        death_place: form.death_place,
        occupation: form.occupation,
        is_living: form.is_living,
        notes: form.notes,
      });
    } finally {
      setSaving(false);
    }
  }

  async function runMatch() {
    setMatching(true);
    setMatches(null);
    try {
      const res = await fetch('/api/family-tree/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ individual_id: person.id }),
      });
      const data = await res.json();
      setMatches(Array.isArray(data.matches) ? data.matches : []);
    } catch {
      setMatches([]);
    } finally {
      setMatching(false);
    }
  }

  async function link(match: ArchiveMatch) {
    setLinkingId(match.id);
    try {
      await onLinkArchive(match);
    } finally {
      setLinkingId(null);
    }
  }

  return (
    <div className="flex h-full flex-col bg-brand-card border-l border-brand-gold/[0.1]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-brand-gold/[0.08]">
        <h2 className="font-display text-base font-semibold text-brand-cream truncate">
          {fullName(person) || 'Unnamed person'}
        </h2>
        <button
          onClick={onClose}
          className="text-brand-muted hover:text-brand-cream transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Identity */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={LABEL}>Given name</label>
            <input
              className={FIELD}
              value={form.given_name ?? ''}
              onChange={(e) => set('given_name', e.target.value)}
              placeholder="John"
            />
          </div>
          <div>
            <label className={LABEL}>Surname</label>
            <input
              className={FIELD}
              value={form.surname ?? ''}
              onChange={(e) => set('surname', e.target.value)}
              placeholder="Smith"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={LABEL}>Sex</label>
            <select
              className={FIELD}
              value={form.sex ?? ''}
              onChange={(e) => set('sex', (e.target.value || null) as TreeIndividual['sex'])}
            >
              <option value="">—</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
              <option value="U">Unknown</option>
            </select>
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm text-brand-cream cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_living}
                onChange={(e) => set('is_living', e.target.checked)}
                className="accent-brand-gold"
              />
              Living
            </label>
          </div>
        </div>

        {/* Birth */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={LABEL}>Born</label>
            <input
              className={FIELD}
              value={form.birth_date ?? ''}
              onChange={(e) => set('birth_date', e.target.value)}
              placeholder="1840"
            />
          </div>
          <div>
            <label className={LABEL}>Birthplace</label>
            <input
              className={FIELD}
              value={form.birth_place ?? ''}
              onChange={(e) => set('birth_place', e.target.value)}
              placeholder="Savannah, GA"
            />
          </div>
        </div>

        {/* Death */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={LABEL}>Died</label>
            <input
              className={FIELD}
              value={form.death_date ?? ''}
              onChange={(e) => set('death_date', e.target.value)}
              placeholder="1902"
            />
          </div>
          <div>
            <label className={LABEL}>Place of death</label>
            <input
              className={FIELD}
              value={form.death_place ?? ''}
              onChange={(e) => set('death_place', e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className={LABEL}>Occupation</label>
          <input
            className={FIELD}
            value={form.occupation ?? ''}
            onChange={(e) => set('occupation', e.target.value)}
          />
        </div>

        <div>
          <label className={LABEL}>Notes</label>
          <textarea
            className={`${FIELD} min-h-[72px] resize-y`}
            value={form.notes ?? ''}
            onChange={(e) => set('notes', e.target.value)}
          />
        </div>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save changes'}
        </Button>

        {/* Add relatives */}
        <div className="pt-2 border-t border-brand-gold/[0.08]">
          <p className={LABEL}>Add a relative</p>
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-brand-gold/20 text-brand-cream"
              onClick={() => onAddRelative('parent')}
            >
              <UserPlus className="w-3.5 h-3.5" /> Parent
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-brand-gold/20 text-brand-cream"
              onClick={() => onAddRelative('spouse')}
            >
              <Heart className="w-3.5 h-3.5" /> Spouse
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-brand-gold/20 text-brand-cream"
              onClick={() => onAddRelative('child')}
            >
              <Baby className="w-3.5 h-3.5" /> Child
            </Button>
          </div>
        </div>

        {/* Archive matching */}
        <div className="pt-2 border-t border-brand-gold/[0.08]">
          {person.archive_record_id ? (
            <div className="rounded-xl border border-brand-sage/30 bg-brand-sage/[0.06] p-3">
              <p className="text-xs text-brand-muted mb-1">Linked archive record</p>
              <p className="text-sm text-brand-cream mb-2">
                {person.archive_record_title || 'Record'}
              </p>
              <div className="flex gap-2">
                {person.archive_collection_slug && (
                  <a
                    href={`/collection/${person.archive_collection_slug}?record=${encodeURIComponent(person.archive_record_id)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-brand-gold hover:text-brand-gold-light"
                  >
                    <ExternalLink className="w-3 h-3" /> View
                  </a>
                )}
                <button
                  onClick={() => onLinkArchive(null)}
                  className="text-xs text-brand-muted hover:text-brand-burgundy-light ml-auto"
                >
                  Unlink
                </button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={runMatch}
              disabled={matching}
              className="w-full rounded-xl border-brand-gold/20 text-brand-cream"
            >
              {matching ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Search className="w-3.5 h-3.5" />
              )}
              Search the archive for this person
            </Button>
          )}

          {matches !== null && !person.archive_record_id && (
            <div className="mt-3 space-y-2">
              {matches.length === 0 ? (
                <p className="text-xs text-brand-muted text-center py-2">
                  No likely matches found in the archive.
                </p>
              ) : (
                matches.map((m) => (
                  <div
                    key={`${m.collectionSlug}-${m.id}`}
                    className="rounded-xl border border-brand-gold/[0.12] bg-brand-bg/40 p-3"
                  >
                    <p className="text-sm text-brand-cream truncate">{m.title}</p>
                    <p className="text-xs text-brand-muted">{m.collectionName}</p>
                    {m.matchReasons.length > 0 && (
                      <p className="text-[11px] text-brand-sage mt-0.5">
                        {m.matchReasons.join(' · ')}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <button
                        onClick={() => link(m)}
                        disabled={linkingId === m.id}
                        className="inline-flex items-center gap-1 text-xs text-brand-gold hover:text-brand-gold-light"
                      >
                        {linkingId === m.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Link2 className="w-3 h-3" />
                        )}
                        Link
                      </button>
                      <a
                        href={m.detailUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-brand-muted hover:text-brand-cream"
                      >
                        <ExternalLink className="w-3 h-3" /> View
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-brand-gold/[0.08]">
        <button
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 text-xs text-brand-muted hover:text-brand-burgundy-light transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete this person
        </button>
      </div>
    </div>
  );
}
