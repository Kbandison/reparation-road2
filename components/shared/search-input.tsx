'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface SearchInputProps {
  placeholder?: string;
  value?: string;
  onSearch: (value: string) => void;
  debounceMs?: number;
  className?: string;
  autoFocus?: boolean;
}

export function SearchInput({
  placeholder = 'Search...',
  value: externalValue,
  onSearch,
  debounceMs = 300,
  className,
  autoFocus,
}: SearchInputProps) {
  const [value, setValue] = useState(externalValue || '');

  useEffect(() => {
    if (externalValue !== undefined) setValue(externalValue);
  }, [externalValue]);

  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(value);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [value, debounceMs, onSearch]);

  return (
    <div className={`relative ${className || ''}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
      <Input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus={autoFocus}
        className="pl-10 bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
      />
    </div>
  );
}
