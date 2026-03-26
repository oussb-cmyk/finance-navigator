import { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, SlidersHorizontal, X } from 'lucide-react';

export interface SearchFilters {
  query: string;
  amountMin: string;
  amountMax: string;
  dateFrom: string;
  dateTo: string;
}

const EMPTY_FILTERS: SearchFilters = { query: '', amountMin: '', amountMax: '', dateFrom: '', dateTo: '' };

interface Props {
  filters: SearchFilters;
  onChange: (f: SearchFilters) => void;
  resultCount: number;
  totalCount: number;
}

export function JournalSearchFilters({ filters, onChange, resultCount, totalCount }: Props) {
  const [open, setOpen] = useState(false);
  const hasFilters = filters.amountMin || filters.amountMax || filters.dateFrom || filters.dateTo;
  const activeCount = [filters.amountMin, filters.amountMax, filters.dateFrom, filters.dateTo].filter(Boolean).length;
  const isFiltered = !!filters.query || !!hasFilters;

  const update = useCallback((patch: Partial<SearchFilters>) => {
    onChange({ ...filters, ...patch });
  }, [filters, onChange]);

  const clearAll = useCallback(() => onChange(EMPTY_FILTERS), [onChange]);

  return (
    <div className="flex items-center gap-3 mb-4">
      {/* Search input */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search account, description, amount, reference…"
          value={filters.query}
          onChange={(e) => update({ query: e.target.value })}
          className="pl-9 h-9 text-sm"
        />
        {filters.query && (
          <button
            onClick={() => update({ query: '' })}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Advanced filters popover */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-1.5">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {activeCount > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{activeCount}</Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-4 space-y-4" align="end">
          <p className="text-sm font-semibold text-foreground">Advanced Filters</p>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Amount Range</label>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Min"
                value={filters.amountMin}
                onChange={(e) => update({ amountMin: e.target.value })}
                className="h-8 text-xs"
              />
              <Input
                type="number"
                placeholder="Max"
                value={filters.amountMax}
                onChange={(e) => update({ amountMax: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Date Range</label>
            <div className="flex gap-2">
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => update({ dateFrom: e.target.value })}
                className="h-8 text-xs"
              />
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) => update({ dateTo: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
          </div>

          {hasFilters && (
            <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => {
              update({ amountMin: '', amountMax: '', dateFrom: '', dateTo: '' });
              setOpen(false);
            }}>
              Clear Filters
            </Button>
          )}
        </PopoverContent>
      </Popover>

      {/* Result count */}
      {isFiltered && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {resultCount} of {totalCount} entries
          </span>
          <button onClick={clearAll} className="text-xs text-primary hover:underline">
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Search/filter logic (pure function) ──────────────────────────── */

export function applySearchFilters(entries: readonly { accountCode: string; accountName: string; description: string; reference: string; debit: number; credit: number; date: string; }[], filters: SearchFilters) {
  let result = [...entries];

  // Global search — smart detection
  if (filters.query.trim()) {
    const terms = filters.query.toLowerCase().trim().split(/\s+/);
    result = result.filter((e) =>
      terms.every((term) => {
        const isNumeric = /^\d+([.,]\d+)?$/.test(term);
        const numVal = parseFloat(term.replace(',', '.'));
        if (isNumeric) {
          // Search amounts and account numbers
          return (
            e.accountCode.includes(term) ||
            e.debit.toString().includes(term) ||
            e.credit.toString().includes(term) ||
            (numVal && (e.debit === numVal || e.credit === numVal))
          );
        }
        // Text search
        return (
          e.accountCode.toLowerCase().includes(term) ||
          e.accountName.toLowerCase().includes(term) ||
          e.description.toLowerCase().includes(term) ||
          e.reference.toLowerCase().includes(term)
        );
      }),
    );
  }

  // Amount range
  const min = filters.amountMin ? parseFloat(filters.amountMin) : null;
  const max = filters.amountMax ? parseFloat(filters.amountMax) : null;
  if (min !== null) result = result.filter((e) => e.debit >= min || e.credit >= min);
  if (max !== null) result = result.filter((e) => (e.debit > 0 ? e.debit <= max : true) && (e.credit > 0 ? e.credit <= max : true));

  // Date range
  if (filters.dateFrom) result = result.filter((e) => e.date >= filters.dateFrom);
  if (filters.dateTo) result = result.filter((e) => e.date <= filters.dateTo);

  return result;
}

export function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const escapedTerms = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escapedTerms.join('|')})`, 'gi');
  const parts = text.split(regex);
  if (parts.length <= 1) return text;
  return parts.map((part, i) =>
    regex.test(part) ? <mark key={i} className="bg-warning/30 text-foreground rounded-sm px-0.5">{part}</mark> : part
  );
}
