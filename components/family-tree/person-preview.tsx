'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  X,
  ExternalLink,
  Link2,
  Users,
  UserPlus,
  Baby,
  Heart,
  Trash2,
  Loader2,
} from 'lucide-react';
import type { TreeIndividual } from '@/lib/types';

const SEX_LABEL: Record<string, string> = { M: 'Male', F: 'Female' };

function fullName(p: TreeIndividual): string {
  return [p.given_name, p.surname].filter(Boolean).join(' ').trim() || 'Unnamed';
}

/**
 * One person, as a modal.
 *
 * Used on both trees. A visitor sees the details and nothing else; the owner
 * also gets the actions that only exist here — adding a relative and deleting —
 * with everything else on the full profile page, which is where the fields and
 * archive matching live.
 *
 * On a visitor's view, notes and the raw GEDCOM are not fetched at all, so
 * there is nothing here to leak by accident.
 */
export function PersonPreview({
  person,
  onClose,
  ownerName,
  yourCopy,
  canEdit = false,
  onAddRelative,
  onDelete,
}: {
  person: TreeIndividual;
  onClose: () => void;
  ownerName: string;
  /** Where the viewer's own record of this person lives, when they have one. */
  yourCopy?: { treeId: string; individualId: string };
  /** Owner-only actions. The full profile page has neither. */
  canEdit?: boolean;
  onAddRelative?: (kind: 'parent' | 'child' | 'spouse') => void;
  onDelete?: () => Promise<void>;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const rows: [string, string][] = [];
  if (person.sex && SEX_LABEL[person.sex]) rows.push(['Sex', SEX_LABEL[person.sex]]);
  if (person.birth_date) rows.push(['Born', person.birth_date]);
  if (person.birth_place) rows.push(['Birthplace', person.birth_place]);
  if (person.death_date) rows.push(['Died', person.death_date]);
  if (person.death_place) rows.push(['Place of death', person.death_place]);
  if (person.occupation) rows.push(['Occupation', person.occupation]);

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center p-4"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Dismisses on a click outside, which is what people expect of a popup. */}
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-brand-bg/70 backdrop-blur-sm cursor-default"
      />

      <div className="relative w-full max-w-md rounded-2xl border border-brand-gold/20 bg-brand-card p-6 shadow-xl">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-brand-muted hover:text-brand-cream"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-4">
          {person.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={person.photo_url}
              alt={fullName(person)}
              className="w-16 h-16 rounded-full object-cover border border-brand-gold/15 shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-brand-gold/10 text-brand-gold flex items-center justify-center text-lg font-semibold shrink-0">
              {(person.given_name?.[0] ?? '?').toUpperCase()}
            </div>
          )}
          <div className="min-w-0 pr-6">
            <h2 className="font-display text-xl font-semibold text-brand-cream leading-tight">
              {fullName(person)}
            </h2>
            <p className="text-xs text-brand-muted mt-1">In {ownerName}&rsquo;s tree</p>
          </div>
        </div>

        {rows.length > 0 && (
          <dl className="mt-5 space-y-2">
            {rows.map(([label, value]) => (
              <div key={label} className="flex gap-3 text-sm">
                <dt className="text-brand-muted w-32 shrink-0">{label}</dt>
                <dd className="text-brand-cream min-w-0">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        {person.archive_record_id && person.archive_collection_slug && (
          <Link
            href={`/collection/${person.archive_collection_slug}/${person.archive_record_id}`}
            className="mt-5 inline-flex items-center gap-1.5 text-sm text-brand-gold hover:text-brand-gold-light"
          >
            <Link2 className="w-3.5 h-3.5" />
            {person.archive_record_title || 'Linked archive record'}
          </Link>
        )}

        {canEdit && (
          <div className="mt-5 border-t border-brand-gold/[0.08] pt-4 space-y-3">
            <Link
              href={`/family-tree/${person.tree_id}/person/${person.id}`}
              className="inline-flex items-center gap-1.5 text-sm text-brand-gold hover:text-brand-gold-light"
            >
              View full profile <ExternalLink className="w-3.5 h-3.5" />
            </Link>

            {/* Kept here rather than moved to the full profile, which has
                neither: without these the canvas cannot grow a tree and a person
                cannot be removed at all. */}
            {onAddRelative && (
              <div className="flex flex-wrap gap-2">
                {([
                  ['parent', 'Parent', UserPlus],
                  ['child', 'Child', Baby],
                  ['spouse', 'Spouse', Heart],
                ] as const).map(([kind, label, Icon]) => (
                  <button
                    key={kind}
                    onClick={() => onAddRelative(kind)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-brand-gold/20 px-3 py-1.5 text-xs text-brand-cream hover:border-brand-gold/40"
                  >
                    <Icon className="w-3.5 h-3.5" /> Add {label.toLowerCase()}
                  </button>
                ))}
              </div>
            )}

            {onDelete &&
              (confirmingDelete ? (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-brand-muted">Remove this person?</span>
                  <button
                    onClick={async () => {
                      setDeleting(true);
                      try {
                        await onDelete();
                      } finally {
                        setDeleting(false);
                      }
                    }}
                    disabled={deleting}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-brand-burgundy px-3 py-1.5 text-xs text-brand-cream"
                  >
                    {deleting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      'Yes, remove'
                    )}
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    className="text-xs text-brand-muted hover:text-brand-cream"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  className="inline-flex items-center gap-1.5 text-xs text-brand-muted hover:text-brand-burgundy-light"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove from tree
                </button>
              ))}
          </div>
        )}

        {yourCopy && (
          <div className="mt-5 border-t border-brand-gold/[0.08] pt-4">
            <p className="text-sm text-brand-cream inline-flex items-center gap-2">
              <Users className="w-4 h-4 text-brand-gold" />
              You have this person too
            </p>
            <Link
              href={`/family-tree/${yourCopy.treeId}/person/${yourCopy.individualId}`}
              className="mt-2 inline-flex items-center gap-1.5 text-sm text-brand-gold hover:text-brand-gold-light"
            >
              Open your record <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
