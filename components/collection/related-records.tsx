import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { RelatedRecord } from '@/lib/types';

interface RelatedRecordsProps {
  records: RelatedRecord[];
  currentRecordId: string;
}

export function RelatedRecords({ records, currentRecordId }: RelatedRecordsProps) {
  if (records.length === 0) return null;

  return (
    <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6">
      <h3 className="font-display text-lg font-semibold text-brand-cream mb-4">Related Records</h3>
      <ul className="space-y-3">
        {records.map((rel) => {
          const isSource = rel.source_record_id === currentRecordId;
          const targetSlug = isSource ? rel.target_collection_slug : rel.source_collection_slug;
          const targetId = isSource ? rel.target_record_id : rel.source_record_id;
          const targetName = isSource ? rel.target_name : rel.source_name;
          const targetCollection = isSource ? rel.target_collection : rel.source_collection;

          return (
            <li key={rel.id}>
              <Link
                href={`/collection/${targetSlug}/${targetId}`}
                className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-brand-card-hover transition-colors group"
              >
                <div>
                  <p className="text-sm text-brand-cream group-hover:text-brand-gold transition-colors">
                    {targetName || 'Related Record'}
                  </p>
                  <p className="text-xs text-brand-muted">
                    {targetCollection}
                    {rel.relationship_type && ` · ${rel.relationship_type}`}
                  </p>
                  {rel.relationship_note && (
                    <p className="text-xs text-brand-muted/70 mt-0.5">{rel.relationship_note}</p>
                  )}
                </div>
                <ArrowRight className="w-4 h-4 text-brand-muted group-hover:text-brand-gold flex-shrink-0" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
