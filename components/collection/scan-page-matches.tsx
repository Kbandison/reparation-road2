import { ScrollText } from 'lucide-react';
import { HighlightMatch } from '@/components/shared/highlight-match';

export interface PageMatchResult {
  imageKey: string;
  snippet: string;
  recordId: string;
  recordSlug?: string;
  records: number;
}

interface ScanPageMatchesProps {
  matches: PageMatchResult[];
  query: string;
  /** Opens a record on the page, which shows the scan and its transcript. */
  onOpen: (match: PageMatchResult) => void;
}

/** Search hits inside page transcripts: one per scanned page, not one per record on it. */
export function ScanPageMatches({ matches, query, onOpen }: ScanPageMatchesProps) {
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-[11px] text-brand-muted font-medium uppercase tracking-wide">
        <ScrollText className="w-3.5 h-3.5 text-brand-gold" aria-hidden="true" /> On scanned pages
      </p>
      {matches.map((m) => (
        <button
          key={m.imageKey}
          type="button"
          onClick={() => onOpen(m)}
          className="bg-brand-card border border-brand-gold/[0.08] rounded-xl p-4 hover:border-brand-gold/25 transition-all hover:-translate-y-0.5 block w-full text-left group"
        >
          <p className="text-sm text-brand-cream/90 font-mono leading-relaxed break-words">
            <HighlightMatch text={m.snippet} query={query} />
          </p>
          <p className="text-[11px] text-brand-muted mt-1.5">
            Found in the AI transcription of a page with {m.records} record{m.records === 1 ? '' : 's'} on it
          </p>
        </button>
      ))}
    </div>
  );
}
