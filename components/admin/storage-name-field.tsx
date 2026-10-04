'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { finalStorageName } from '@/lib/storage/names';

interface StorageNameFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Buckets and folders get the lowercase-hyphen cleanup; files keep their name. */
  kind: 'clean' | 'file';
  /** A file's extension, shown after the box and kept on rename. */
  extension?: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

/**
 * Name input with a live preview of the cleaned-up name, so "Box 12 (Henrico)"
 * visibly becomes "box-12-henrico" before anything is created.
 */
export function StorageNameField({
  id,
  label,
  value,
  onChange,
  kind,
  extension = '',
  placeholder,
  disabled,
  autoFocus,
}: StorageNameFieldProps) {
  const final = finalStorageName(kind, value, extension);
  const typed = kind === 'file' ? value.trim() + extension : value.trim();

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={`${id}-preview`}
          className="bg-brand-bg border-brand-gold/[0.15] focus:border-brand-gold h-10"
        />
        {extension && <span className="text-sm text-brand-muted font-mono shrink-0">{extension}</span>}
      </div>
      <p id={`${id}-preview`} className="text-[11px] text-brand-muted min-h-4" aria-live="polite">
        {!value.trim() ? (
          kind === 'clean' ? 'Lowercase letters, numbers and hyphens.' : ' '
        ) : !final ? (
          <span className="text-brand-burgundy-light">Needs at least one letter or number.</span>
        ) : final !== typed ? (
          <>Will be saved as <span className="font-mono text-brand-cream">{final}</span></>
        ) : (
          ' '
        )}
      </p>
    </div>
  );
}
