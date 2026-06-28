'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Pencil,
  Loader2,
  ExternalLink,
  Link2,
  X,
  Search,
  Users,
  Heart,
  Baby,
  UserRound,
  FileText,
  Briefcase,
  MapPin,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fullName, initials, lifespan } from '@/lib/family-tree/display';
import type { TreeIndividual, TreeArchiveMatch } from '@/lib/types';

export interface RelRef {
  id: string;
  name: string;
  lifespan: string;
  parentType?: string | null;
}

interface Props {
  treeId: string;
  treeName: string;
  initialPerson: TreeIndividual;
  relatives: { parents: RelRef[]; spouses: RelRef[]; children: RelRef[]; siblings: RelRef[] };
  initialMatches: TreeArchiveMatch[];
}

const FIELD =
  'w-full rounded-xl border border-brand-gold/[0.12] bg-brand-bg/60 px-3 py-2 text-sm text-brand-cream placeholder:text-brand-muted/60 focus:border-brand-gold/40 focus:outline-none';
const LABEL = 'block text-xs font-medium text-brand-muted mb-1';
const json = { 'Content-Type': 'application/json' };

function sexTint(sex: TreeIndividual['sex']): string {
  return sex === 'M'
    ? 'bg-brand-sage/20 text-brand-sage'
    : sex === 'F'
      ? 'bg-brand-burgundy/25 text-brand-burgundy-light'
      : 'bg-brand-gold/15 text-brand-gold';
}

const REL_ICON = { parents: Users, spouses: Heart, children: Baby, siblings: UserRound } as const;
const REL_LABEL = { parents: 'Parents', spouses: 'Spouses', children: 'Children', siblings: 'Siblings' } as const;

export function PersonProfile({ treeId, treeName, initialPerson, relatives, initialMatches }: Props) {
  const [person, setPerson] = useState(initialPerson);
  const [matches, setMatches] = useState(initialMatches);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(initialPerson);
  const [saving, setSaving] = useState(false);
  const [matching, setMatching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const suggestions = matches.filter(
    (m) => m.status === 'suggested' && m.record_id !== person.archive_record_id,
  );

  function set<K extends keyof TreeIndividual>(key: K, value: TreeIndividual[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function saveVitals() {
    setSaving(true);
    try {
      const res = await fetch(`/api/family-tree/individuals/${person.id}`, {
        method: 'PATCH',
        headers: json,
        body: JSON.stringify({
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
        }),
      });
      const data = await res.json();
      if (data.individual) setPerson(data.individual);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function rescan() {
    setMatching(true);
    try {
      const res = await fetch('/api/family-tree/match', {
        method: 'POST',
        headers: json,
        body: JSON.stringify({ individual_id: person.id }),
      });
      const data = await res.json();
      setMatches((data.matches ?? []) as TreeArchiveMatch[]);
    } finally {
      setMatching(false);
    }
  }

  async function linkMatch(m: TreeArchiveMatch) {
    setBusyId(m.id);
    try {
      const res = await fetch(`/api/family-tree/matches/${m.id}`, {
        method: 'PATCH',
        headers: json,
        body: JSON.stringify({ status: 'linked' }),
      });
      if (res.ok) {
        setPerson((p) => ({
          ...p,
          archive_collection_slug: m.collection_slug,
          archive_record_id: m.record_id,
          archive_record_title: m.title,
        }));
        setMatches((prev) =>
          prev.map((x) =>
            x.id === m.id
              ? { ...x, status: 'linked' }
              : x.status === 'linked'
                ? { ...x, status: 'suggested' }
                : x,
          ),
        );
      }
    } finally {
      setBusyId(null);
    }
  }

  async function dismissMatch(m: TreeArchiveMatch) {
    setBusyId(m.id);
    try {
      const res = await fetch(`/api/family-tree/matches/${m.id}`, {
        method: 'PATCH',
        headers: json,
        body: JSON.stringify({ status: 'dismissed' }),
      });
      if (res.ok) setMatches((prev) => prev.filter((x) => x.id !== m.id));
    } finally {
      setBusyId(null);
    }
  }

  async function unlink() {
    const linked = matches.find((m) => m.status === 'linked' || m.record_id === person.archive_record_id);
    setBusyId('unlink');
    try {
      if (linked) {
        await fetch(`/api/family-tree/matches/${linked.id}`, {
          method: 'PATCH',
          headers: json,
          body: JSON.stringify({ status: 'suggested' }),
        });
        setMatches((prev) => prev.map((x) => (x.id === linked.id ? { ...x, status: 'suggested' } : x)));
      } else {
        await fetch(`/api/family-tree/individuals/${person.id}`, {
          method: 'PATCH',
          headers: json,
          body: JSON.stringify({
            archive_collection_slug: null,
            archive_record_id: null,
            archive_record_title: null,
          }),
        });
      }
      setPerson((p) => ({
        ...p,
        archive_collection_slug: null,
        archive_record_id: null,
        archive_record_title: null,
      }));
    } finally {
      setBusyId(null);
    }
  }

  const name = fullName(person) || 'Unnamed person';
  const span = lifespan(person);
  const hasAnyRelatives =
    relatives.parents.length + relatives.spouses.length + relatives.children.length + relatives.siblings.length > 0;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-4">
        <Link
          href={`/family-tree/${treeId}`}
          className="inline-flex items-center gap-1.5 text-sm text-brand-muted hover:text-brand-gold transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> {treeName || 'Family tree'}
        </Link>
      </div>

      {/* Header */}
      <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6 mb-6">
        <div className="flex items-start gap-4">
          <div
            className={cn(
              'w-16 h-16 rounded-full flex items-center justify-center text-xl font-semibold shrink-0',
              sexTint(person.sex),
            )}
          >
            {initials(person)}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-semibold text-brand-cream truncate">{name}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-brand-muted">
              {span && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" /> {span}
                </span>
              )}
              {person.occupation && (
                <span className="inline-flex items-center gap-1">
                  <Briefcase className="w-3.5 h-3.5" /> {person.occupation}
                </span>
              )}
              {person.is_living && <span className="text-brand-sage">Living</span>}
            </div>
          </div>
          {!editing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setForm(person);
                setEditing(true);
              }}
              className="rounded-xl border-brand-gold/20 text-brand-cream shrink-0"
            >
              <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
            </Button>
          )}
        </div>

        {/* Read view: places + notes */}
        {!editing && (
          <div className="mt-4 space-y-2">
            {(person.birth_place || person.death_place) && (
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                {person.birth_place && (
                  <span className="inline-flex items-center gap-1.5 text-brand-cream-muted">
                    <MapPin className="w-3.5 h-3.5 text-brand-muted" /> Born in {person.birth_place}
                  </span>
                )}
                {person.death_place && (
                  <span className="inline-flex items-center gap-1.5 text-brand-cream-muted">
                    <MapPin className="w-3.5 h-3.5 text-brand-muted" /> Died in {person.death_place}
                  </span>
                )}
              </div>
            )}
            {person.notes && (
              <p className="text-sm text-brand-cream-muted leading-relaxed whitespace-pre-wrap">{person.notes}</p>
            )}
          </div>
        )}

        {/* Edit form */}
        {editing && (
          <div className="mt-5 pt-5 border-t border-brand-gold/[0.06] space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Given name</label>
                <input className={FIELD} value={form.given_name ?? ''} onChange={(e) => set('given_name', e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Surname</label>
                <input className={FIELD} value={form.surname ?? ''} onChange={(e) => set('surname', e.target.value)} />
              </div>
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
              <div className="flex items-end pb-2">
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
              <div>
                <label className={LABEL}>Born</label>
                <input className={FIELD} value={form.birth_date ?? ''} onChange={(e) => set('birth_date', e.target.value)} placeholder="1840" />
              </div>
              <div>
                <label className={LABEL}>Birthplace</label>
                <input className={FIELD} value={form.birth_place ?? ''} onChange={(e) => set('birth_place', e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Died</label>
                <input className={FIELD} value={form.death_date ?? ''} onChange={(e) => set('death_date', e.target.value)} placeholder="1902" />
              </div>
              <div>
                <label className={LABEL}>Place of death</label>
                <input className={FIELD} value={form.death_place ?? ''} onChange={(e) => set('death_place', e.target.value)} />
              </div>
            </div>
            <div>
              <label className={LABEL}>Occupation</label>
              <input className={FIELD} value={form.occupation ?? ''} onChange={(e) => set('occupation', e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>Notes</label>
              <textarea className={`${FIELD} min-h-[80px] resize-y`} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={saveVitals} disabled={saving} className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
              </Button>
              <Button variant="outline" onClick={() => setEditing(false)} disabled={saving} className="rounded-xl border-brand-gold/20 text-brand-cream">
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Relationships */}
      <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6 mb-6">
        <h2 className="font-display text-lg font-semibold text-brand-cream mb-4">Relationships</h2>
        {!hasAnyRelatives ? (
          <p className="text-sm text-brand-muted">No relatives recorded yet.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-5">
            {(['parents', 'spouses', 'children', 'siblings'] as const).map((group) => {
              const list = relatives[group];
              if (list.length === 0) return null;
              const Icon = REL_ICON[group];
              return (
                <div key={group}>
                  <p className="text-[11px] uppercase tracking-wide text-brand-muted mb-2 inline-flex items-center gap-1">
                    <Icon className="w-3 h-3" /> {REL_LABEL[group]}
                  </p>
                  <div className="space-y-1.5">
                    {list.map((r) => (
                      <Link
                        key={r.id}
                        href={`/family-tree/${treeId}/person/${r.id}`}
                        className="flex items-center gap-2 rounded-xl border border-brand-gold/[0.1] bg-brand-bg/40 px-3 py-2 hover:border-brand-gold/35 transition-colors"
                      >
                        <UserRound className="w-3.5 h-3.5 text-brand-gold shrink-0" />
                        <span className="text-sm text-brand-cream truncate">{r.name}</span>
                        {r.lifespan && <span className="text-xs text-brand-muted">{r.lifespan}</span>}
                        {r.parentType && (
                          <span className="text-[10px] text-brand-muted ml-auto capitalize">{r.parentType}</span>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Archive records */}
      <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="font-display text-lg font-semibold text-brand-cream">Archive records</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={rescan}
            disabled={matching}
            className="rounded-xl border-brand-gold/20 text-brand-cream"
          >
            {matching ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Search className="w-3.5 h-3.5 mr-1.5" />}
            Re-scan
          </Button>
        </div>

        {/* Linked */}
        {person.archive_record_id && (
          <div className="rounded-xl border border-brand-sage/30 bg-brand-sage/[0.06] p-4 mb-4">
            <p className="text-[11px] uppercase tracking-wide text-brand-muted mb-1">Linked record</p>
            <p className="text-sm text-brand-cream mb-2">{person.archive_record_title || 'Record'}</p>
            <div className="flex items-center gap-3">
              {person.archive_collection_slug && (
                <a
                  href={`/collection/${person.archive_collection_slug}?record=${encodeURIComponent(person.archive_record_id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-brand-gold hover:text-brand-gold-light"
                >
                  <ExternalLink className="w-3 h-3" /> View record
                </a>
              )}
              <button
                onClick={unlink}
                disabled={busyId === 'unlink'}
                className="text-xs text-brand-muted hover:text-brand-burgundy-light ml-auto inline-flex items-center gap-1"
              >
                {busyId === 'unlink' ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                Unlink
              </button>
            </div>
          </div>
        )}

        {/* Suggestions */}
        {suggestions.length === 0 ? (
          !person.archive_record_id && (
            <p className="text-sm text-brand-muted">
              No archive matches found yet. Try re-scanning, or add a birth year or place to improve results.
            </p>
          )
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-wide text-brand-muted">
              {suggestions.length} possible {suggestions.length === 1 ? 'match' : 'matches'}
            </p>
            {suggestions.map((m) => (
              <div key={m.id} className="rounded-xl border border-brand-gold/[0.12] bg-brand-bg/40 p-3">
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 text-brand-gold mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-brand-cream truncate">{m.title || 'Record'}</p>
                    <p className="text-xs text-brand-muted">{m.collection_name}</p>
                    {m.match_reasons?.length > 0 && (
                      <p className="text-[11px] text-brand-sage mt-0.5">{m.match_reasons.join(' · ')}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-2 pl-6">
                  <button
                    onClick={() => linkMatch(m)}
                    disabled={busyId === m.id}
                    className="inline-flex items-center gap-1 text-xs text-brand-gold hover:text-brand-gold-light"
                  >
                    {busyId === m.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                    Link
                  </button>
                  {m.detail_url && (
                    <a
                      href={m.detail_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-brand-muted hover:text-brand-cream"
                    >
                      <ExternalLink className="w-3 h-3" /> View
                    </a>
                  )}
                  <button
                    onClick={() => dismissMatch(m)}
                    disabled={busyId === m.id}
                    className="inline-flex items-center gap-1 text-xs text-brand-muted hover:text-brand-burgundy-light ml-auto"
                  >
                    <X className="w-3 h-3" /> Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
