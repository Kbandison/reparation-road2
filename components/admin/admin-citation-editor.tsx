'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Save, RotateCcw, Quote } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Collection } from '@/lib/types';

interface AdminCitationEditorProps {
  collection: Collection;
}

const PLACEHOLDERS = [
  { key: '{{record_title}}', desc: 'Record display name' },
  { key: '{{collection_name}}', desc: 'Collection name' },
  { key: '{{record_id}}', desc: 'Record slug or ID' },
  { key: '{{collection_slug}}', desc: 'Collection slug' },
  { key: '{{accessed_date}}', desc: 'Current date' },
  { key: '{{url}}', desc: 'Full record URL' },
];

const DEFAULT_PREVIEW = `"[Record Title]," [Collection Name], Reparation Road Digital Archive, reparationroad.org/collection/[slug]/[record], accessed [date].`;

export function AdminCitationEditor({ collection }: AdminCitationEditorProps) {
  const router = useRouter();
  const supabase = createClient();

  const [expanded, setExpanded] = useState(false);
  const [template, setTemplate] = useState(collection.citation_template || '');
  const [sourceInfo, setSourceInfo] = useState(collection.source_information || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const hasChanges =
    template !== (collection.citation_template || '') ||
    sourceInfo !== (collection.source_information || '');

  const handleSave = async () => {
    setSaving(true);
    await supabase
      .from('collections')
      .update({
        citation_template: template || null,
        source_information: sourceInfo || null,
      })
      .eq('id', collection.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    router.refresh();
  };

  const handleReset = () => {
    setTemplate('');
  };

  // Generate a preview with sample values
  const preview = template
    ? template
        .replace(/\{\{record_title\}\}/g, 'John Smith')
        .replace(/\{\{collection_name\}\}/g, collection.name)
        .replace(/\{\{record_id\}\}/g, 'john-smith')
        .replace(/\{\{collection_slug\}\}/g, collection.slug)
        .replace(/\{\{accessed_date\}\}/g, new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))
        .replace(/\{\{url\}\}/g, `reparationroad.org/collection/${collection.slug}/john-smith`)
    : DEFAULT_PREVIEW;

  return (
    <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-brand-card-hover/50 transition-colors rounded-2xl"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-brand-muted" />
          ) : (
            <ChevronRight className="w-4 h-4 text-brand-muted" />
          )}
          <Quote className="w-4 h-4 text-brand-muted" />
          <span className="text-sm font-medium text-brand-cream">Citation &amp; Source</span>
          {collection.citation_template && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-brand-gold/10 text-brand-gold">Custom</span>
          )}
          {collection.source_information && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-brand-sage/10 text-brand-sage">Source</span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-brand-gold/[0.06]">
          <div className="pt-3">
            <p className="text-xs text-brand-muted mb-3">
              Customize how citations appear for records in this collection. Leave empty to use the default format.
            </p>

            {/* Template textarea */}
            <textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={3}
              placeholder={`"{{record_title}}," {{collection_name}}, Reparation Road Digital Archive, {{url}}, accessed {{accessed_date}}.`}
              className="w-full px-3 py-2 bg-brand-bg border border-brand-gold/[0.08] rounded-xl text-sm text-brand-cream placeholder:text-brand-muted/50 focus:outline-none focus:border-brand-gold/25 resize-none font-mono"
            />

            {/* Placeholders reference */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {PLACEHOLDERS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setTemplate((t) => t + p.key)}
                  className="text-[10px] px-2 py-0.5 rounded-md border border-brand-gold/[0.08] text-brand-muted hover:text-brand-cream hover:border-brand-gold/15 transition-colors"
                  title={p.desc}
                >
                  {p.key}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="bg-brand-bg border border-brand-gold/[0.06] rounded-xl p-3">
            <p className="text-[10px] text-brand-muted font-medium uppercase tracking-wide mb-1.5">Preview</p>
            <p className="text-xs text-brand-cream/70 italic leading-relaxed">{preview}</p>
          </div>

          {/* Source information */}
          <div>
            <p className="text-xs text-brand-muted mb-2">
              Source information &mdash; the archival provenance shown on every record in
              this collection (repository, record group, physical reference, etc.). A
              record can override this individually.
            </p>
            <textarea
              value={sourceInfo}
              onChange={(e) => setSourceInfo(e.target.value)}
              rows={3}
              placeholder={'e.g. Georgia Archives, RG 4-2-46, Register of Free Persons of Color, 1819–1864.'}
              className="w-full px-3 py-2 bg-brand-bg border border-brand-gold/[0.08] rounded-xl text-sm text-brand-cream placeholder:text-brand-muted/50 focus:outline-none focus:border-brand-gold/25 resize-y"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-gold/10 text-brand-gold rounded-xl text-xs font-medium hover:bg-brand-gold/20 transition-colors disabled:opacity-40"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : saved ? 'Saved' : 'Save Template'}
            </button>
            {template && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-1.5 text-brand-muted hover:text-brand-cream rounded-xl text-xs transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset to Default
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
