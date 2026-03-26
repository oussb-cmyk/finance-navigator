import { useState, useRef, useEffect, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { searchPCGAccounts } from '@/lib/pcgAccounts';
import { useLearningStore } from '@/store/useLearningStore';

interface AccountAutocompleteProps {
  projectId: string;
  value: string;
  onChange: (code: string, name: string) => void;
  className?: string;
  placeholder?: string;
}

export function AccountAutocomplete({
  projectId, value, onChange, className = '', placeholder = 'Account #',
}: AccountAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const projectData = useLearningStore((s) => s.getProjectData(projectId));
  const userAccounts = useMemo(
    () => projectData.accountPatterns.map((p) => ({ code: p.code, name: p.name })),
    [projectData.accountPatterns],
  );

  const suggestions = useMemo(
    () => searchPCGAccounts(query, userAccounts, 8),
    [query, userAccounts],
  );

  // Sync external value
  useEffect(() => { setQuery(value); }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <Input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => query && setOpen(true)}
        placeholder={placeholder}
        className={`h-7 text-xs mono ${className}`}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 mt-1 w-[280px] max-h-[200px] overflow-auto bg-popover border border-border rounded-md shadow-lg">
          {suggestions.map((s) => (
            <button
              key={s.code}
              type="button"
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-accent transition-colors"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(s.code, s.label);
                setQuery(s.code);
                setOpen(false);
              }}
            >
              <span className="mono text-xs font-semibold text-foreground w-[50px] shrink-0">{s.code}</span>
              <span className="text-xs text-muted-foreground truncate">{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
