'use client';

import { useRef } from 'react';
import { Quote, RotateCcw } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  CITATION_PLACEHOLDERS,
  DEFAULT_CITATION_TEMPLATE,
  fillCitationTemplate,
  type CitationDefaults,
} from '@/lib/collections/citation';

interface CollectionCitationFieldsProps {
  template: string;
  onTemplateChange: (value: string) => void;
  source: string;
  onSourceChange: (value: string) => void;
  /** For the preview. */
  collectionName: string;
  collectionSlug: string;
  /** What the parent folders would supply if these are left blank. */
  inherited: CitationDefaults;
  folder: boolean;
}

const TEXTAREA =
  'w-full px-3 py-2 bg-brand-card border border-brand-gold/[0.15] rounded-xl text-sm text-brand-cream placeholder:text-brand-muted/50 focus:outline-none focus:border-brand-gold/25 resize-y';

/** Collection-level citation format and source, edited inside the collection edit modal. */
export function CollectionCitationFields({
  template,
  onTemplateChange,
  source,
  onSourceChange,
  collectionName,
  collectionSlug,
  inherited,
  folder,
}: CollectionCitationFieldsProps) {
  const templateRef = useRef<HTMLTextAreaElement>(null);
  // Clicking a placeholder chip blurs the textarea, so remember the caret.
  const caret = useRef<{ start: number; end: number } | null>(null);

  const hasTemplate = template.trim() !== '';
  const effectiveTemplate = hasTemplate
    ? template
    : inherited.citationTemplate?.value ?? DEFAULT_CITATION_TEMPLATE;

  // A folder's format is filled in by each tab, so preview it with a stand-in tab.
  const preview = fillCitationTemplate(effectiveTemplate, {
    recordTitle: 'John Smith',
    recordId: 'john-smith',
    collectionName: folder ? '[Tab name]' : collectionName || '[Collection name]',
    collectionSlug: folder ? '[tab]' : collectionSlug,
  });

  const templateStatus = hasTemplate
    ? { label: 'Custom', className: 'bg-brand-gold/10 text-brand-gold' }
    : inherited.citationTemplate
      ? { label: `From ${inherited.citationTemplate.from.name}`, className: 'bg-brand-sage/10 text-brand-sage' }
      : { label: 'Default', className: 'bg-brand-muted/10 text-brand-muted' };

  const insertPlaceholder = (key: string) => {
    const at = caret.current ?? { start: template.length, end: template.length };
    onTemplateChange(template.slice(0, at.start) + key + template.slice(at.end));
    const pos = at.start + key.length;
    caret.current = { start: pos, end: pos };
    // Put the caret after the inserted placeholder once React has re-rendered.
    requestAnimationFrame(() => {
      templateRef.current?.focus();
      templateRef.current?.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="space-y-4 border-t border-brand-gold/[0.08] pt-4">
      <div>
        <Label className="flex items-center gap-1.5">
          <Quote className="w-3.5 h-3.5 text-brand-muted" aria-hidden="true" />
          Citation &amp; Source
        </Label>
        <p className="text-[11px] text-brand-muted mt-1">
          {folder
            ? 'Every tab inside this folder uses these unless the tab sets its own.'
            : 'Shown under “Cite this Record” on every record in this collection.'}{' '}
          A single record can still override both from its edit window.
        </p>
      </div>

      {/* Citation format */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="edit-citation-template" className="text-xs text-brand-muted">
            Citation format
          </Label>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-md truncate max-w-[60%] ${templateStatus.className}`}>
            {templateStatus.label}
          </span>
        </div>
        <textarea
          id="edit-citation-template"
          ref={templateRef}
          value={template}
          onChange={(e) => onTemplateChange(e.target.value)}
          onSelect={(e) => {
            caret.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd };
          }}
          rows={3}
          placeholder={inherited.citationTemplate?.value ?? DEFAULT_CITATION_TEMPLATE}
          className={`${TEXTAREA} font-mono`}
        />
        <div className="flex flex-wrap gap-1.5" aria-label="Insert a placeholder">
          {CITATION_PLACEHOLDERS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => insertPlaceholder(p.key)}
              title={p.desc}
              className="text-[10px] px-2 py-0.5 rounded-md border border-brand-gold/[0.08] text-brand-muted hover:text-brand-cream hover:border-brand-gold/25 transition-colors font-mono"
            >
              {p.key}
            </button>
          ))}
        </div>

        <div className="bg-brand-card border border-brand-gold/[0.06] rounded-xl p-3">
          <p className="text-[10px] text-brand-muted font-medium uppercase tracking-wide mb-1.5">Preview</p>
          <p className="text-xs text-brand-cream/70 italic leading-relaxed break-words">{preview}</p>
        </div>

        {hasTemplate && (
          <button
            type="button"
            onClick={() => onTemplateChange('')}
            className="flex items-center gap-1.5 text-xs text-brand-muted hover:text-brand-cream transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            {inherited.citationTemplate
              ? `Use ${inherited.citationTemplate.from.name}'s format`
              : 'Use the default format'}
          </button>
        )}
      </div>

      {/* Source information */}
      <div className="space-y-2">
        <Label htmlFor="edit-source-information" className="text-xs text-brand-muted">
          Source information
        </Label>
        <textarea
          id="edit-source-information"
          value={source}
          onChange={(e) => onSourceChange(e.target.value)}
          rows={3}
          placeholder="e.g. Georgia Archives, RG 4-2-46, Register of Free Persons of Color, 1819–1864."
          className={TEXTAREA}
        />
        {source.trim() === '' && inherited.sourceInformation ? (
          <div className="bg-brand-card border border-brand-gold/[0.06] rounded-xl p-3">
            <p className="text-[10px] text-brand-sage font-medium uppercase tracking-wide mb-1.5">
              Left blank, so it uses {inherited.sourceInformation.from.name}&apos;s source
            </p>
            <p className="text-xs text-brand-cream/70 leading-relaxed whitespace-pre-line break-words">
              {inherited.sourceInformation.value}
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-brand-muted">
            The archival provenance: repository, record group, physical reference, or the published
            work the records came from. Leave blank to show no source.
          </p>
        )}
      </div>
    </div>
  );
}
