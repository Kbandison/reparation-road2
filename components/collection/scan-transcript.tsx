'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, Loader2, Pencil, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { fetchApi } from '@/lib/import/http';

interface Transcript {
  text: string;
  confidence: string | null;
  notes: string | null;
  edited: boolean;
}

interface ScanTranscriptProps {
  collectionSlug: string;
  /** The record's image_path. Mount with key={imagePath} so it reloads per page. */
  imagePath: string;
}

/** Lines shown before "Show all". */
const PREVIEW_LINES = 10;

/**
 * Claude's transcription of the scanned page, under the scan. Labelled as an
 * AI transcription; admins can correct it in place.
 */
export function ScanTranscript({ collectionSlug, imagePath }: ScanTranscriptProps) {
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ collection: collectionSlug, image: imagePath });
    void fetchApi(`/api/transcriptions?${params}`).then(({ ok, data }) => {
      if (!active || !ok) return;
      setTranscript((data.transcript as Transcript | null) ?? null);
      setCanEdit(data.canEdit === true);
    });
    return () => {
      active = false;
    };
  }, [collectionSlug, imagePath]);

  if (!transcript) return null;

  const lines = transcript.text.split('\n');
  const long = lines.length > PREVIEW_LINES;
  const shown = expanded || !long ? transcript.text : lines.slice(0, PREVIEW_LINES).join('\n');

  const save = async () => {
    setSaving(true);
    const { ok, data } = await fetchApi('/api/transcriptions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection: collectionSlug, image: imagePath, text: draft }),
    });
    setSaving(false);
    if (!ok) {
      toast.error(data.error);
      return;
    }
    setTranscript({ ...transcript, text: draft.trim(), edited: true });
    setEditing(false);
    toast.success('Transcription saved');
  };

  return (
    <div className="mt-4 bg-brand-card border border-brand-gold/[0.08] rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <p className="text-[11px] text-brand-muted font-medium uppercase tracking-wide">Transcription of this page</p>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-brand-gold/10 text-brand-gold">
            <Sparkles className="w-3 h-3" aria-hidden="true" />
            {transcript.edited ? 'AI transcription, corrected' : 'AI transcription · may contain errors'}
          </span>
          {canEdit && !editing && (
            <button
              type="button"
              onClick={() => {
                setDraft(transcript.text);
                setEditing(true);
              }}
              className="inline-flex items-center gap-1 text-[11px] text-brand-gold hover:text-brand-gold-light"
            >
              <Pencil className="w-3 h-3" aria-hidden="true" /> Edit
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={14}
            aria-label="Transcription text"
            className="font-mono text-xs leading-relaxed rounded-xl"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving} className="rounded-xl border-brand-gold/20 text-brand-cream">
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={saving} className="rounded-xl bg-brand-gold text-brand-bg hover:bg-brand-gold-light">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : 'Save'}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {transcript.text ? (
            <p className="text-xs text-brand-cream/90 leading-relaxed whitespace-pre-wrap break-words font-mono">{shown}</p>
          ) : (
            <p className="text-xs text-brand-muted">No writing on this page.</p>
          )}
          {long && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="mt-2 inline-flex items-center gap-1 text-[11px] text-brand-gold hover:text-brand-gold-light"
            >
              <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
              {expanded ? 'Show less' : `Show all ${lines.length} lines`}
            </button>
          )}
          {transcript.confidence === 'low' && (
            <p className="mt-2 text-[11px] text-brand-muted">Parts of this page were hard to read. Check the scan for anything important.</p>
          )}
          {transcript.notes && <p className="mt-1 text-[11px] text-brand-muted italic">{transcript.notes}</p>}
        </>
      )}
    </div>
  );
}
