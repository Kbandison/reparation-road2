'use client';

import { useState, useRef, useCallback } from 'react';
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
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;

  const handleChange = useCallback((newValue: string) => {
    setValue(newValue);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onSearchRef.current(newValue);
    }, debounceMs);
  }, [debounceMs]);

  return (
    <div className={`relative ${className || ''}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
      <Input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        autoFocus={autoFocus}
        className="pl-10 bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
      />
    </div>
  );
}
