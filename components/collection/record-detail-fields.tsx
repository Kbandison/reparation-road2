import type { CollectionRecord } from '@/lib/types';
import { snakeCaseToTitleCase } from '@/lib/utils/format';

const SKIP_FIELDS = new Set([
  'id', 'created_at', 'updated_at', 'slug', 'image_path', 'image_url',
  'ocr_json', 'tsv', 'ocr_text', 'embedding',
]);

interface RecordDetailFieldsProps {
  record: CollectionRecord;
}

export function RecordDetailFields({ record }: RecordDetailFieldsProps) {
  const fields = Object.entries(record).filter(
    ([key, value]) => !SKIP_FIELDS.has(key) && value !== null && value !== undefined && value !== ''
  );

  return (
    <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6">
      <h3 className="font-display text-lg font-semibold text-brand-cream mb-4">Record Details</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
        {fields.map(([key, value]) => (
          <div key={key} className="flex flex-col py-2 border-b border-brand-gold/[0.04] last:border-0">
            <span className="text-xs font-medium text-brand-muted uppercase tracking-wide">
              {snakeCaseToTitleCase(key)}
            </span>
            <span className="text-sm text-brand-cream mt-0.5">
              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
