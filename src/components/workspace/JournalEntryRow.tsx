import { useState, useCallback, useEffect } from 'react';
import type { JournalEntry, JournalType } from '@/types/finance';
import type { ClassificationResult } from '@/lib/journalClassification';
import { JOURNAL_TYPES } from '@/types/finance';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AccountAutocomplete } from '@/components/workspace/AccountAutocomplete';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import { Lightbulb, Pencil, Check, X, RefreshCw } from 'lucide-react';

/* ── Colour helpers ─────────────────────────────────────────── */
const JOURNAL_DOT: Record<JournalType, string> = {
  sales: 'bg-success', purchases: 'bg-destructive', bank: 'bg-info',
  cash: 'bg-purple-500', payroll: 'bg-pink-500', tax: 'bg-warning',
  financing: 'bg-cyan-500', general: 'bg-muted-foreground',
};

function confidenceBadgeClass(level: 'high' | 'medium' | 'low'): string {
  switch (level) {
    case 'high': return 'bg-success/15 text-success border-success/30';
    case 'medium': return 'bg-warning/15 text-warning border-warning/30';
    case 'low': return 'bg-destructive/15 text-destructive border-destructive/30';
  }
}

function confidenceRowBg(conf: ClassificationResult): string {
  if (conf.inconsistency) return 'bg-destructive/10';
  switch (conf.level) {
    case 'high': return '';
    case 'medium': return 'bg-warning/5';
    case 'low': return 'bg-destructive/5';
  }
}

/* ── Props ──────────────────────────────────────────────────── */
interface JournalEntryRowProps {
  entry: JournalEntry;
  conf: ClassificationResult | undefined;
  selected: boolean;
  projectId: string;
  onToggleSelect: (id: string) => void;
  onChangeJournal: (id: string, type: JournalType) => void;
  onUpdateEntry: (updated: JournalEntry) => void;
  onApplySuggestion: (id: string) => void;
  highlightMatch: (text: string, query: string) => React.ReactNode;
  searchQuery: string;
}

export function JournalEntryRow({
  entry: e, conf, selected, projectId, onToggleSelect, onChangeJournal,
  onUpdateEntry, onApplySuggestion, highlightMatch, searchQuery,
}: JournalEntryRowProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    date: e.date, accountCode: e.accountCode, accountName: e.accountName,
    description: e.description, debit: String(e.debit || ''), credit: String(e.credit || ''),
  });
  const [justUpdated, setJustUpdated] = useState(false);

  // Flash "recomputed" indicator briefly after an update
  useEffect(() => {
    if (justUpdated) {
      const t = setTimeout(() => setJustUpdated(false), 2000);
      return () => clearTimeout(t);
    }
  }, [justUpdated]);

  const startEdit = useCallback(() => {
    setForm({
      date: e.date, accountCode: e.accountCode, accountName: e.accountName,
      description: e.description, debit: String(e.debit || ''), credit: String(e.credit || ''),
    });
    setEditing(true);
  }, [e]);

  const cancelEdit = () => setEditing(false);

  const saveEdit = useCallback(() => {
    const debit = parseFloat(form.debit.replace(/\s/g, '').replace(',', '.')) || 0;
    const credit = parseFloat(form.credit.replace(/\s/g, '').replace(',', '.')) || 0;
    onUpdateEntry({
      ...e,
      date: form.date,
      accountCode: form.accountCode,
      accountName: form.accountName,
      description: form.description,
      debit,
      credit,
    });
    setEditing(false);
    setJustUpdated(true);
  }, [e, form, onUpdateEntry]);

  const handleAccountSelect = useCallback((code: string, name: string) => {
    setForm((f) => ({ ...f, accountCode: code, accountName: name }));
  }, []);

  const rowBg = conf ? confidenceRowBg(conf) : '';

  if (editing) {
    return (
      <tr className="bg-accent/30">
        <td><Checkbox checked={selected} onCheckedChange={() => onToggleSelect(e.id)} /></td>
        <td>
          <Input type="date" value={form.date} onChange={(ev) => setForm({ ...form, date: ev.target.value })}
            className="h-7 text-xs w-[120px]" />
        </td>
        <td className="text-xs mono text-muted-foreground">{e.reference}</td>
        <td>
          <div className="flex gap-1">
            <AccountAutocomplete
              projectId={projectId}
              value={form.accountCode}
              onChange={handleAccountSelect}
              className="w-[100px]"
              placeholder="Account #"
            />
            <Input value={form.description} onChange={(ev) => setForm({ ...form, description: ev.target.value })}
              placeholder="Description" className="h-7 text-xs flex-1" />
          </div>
        </td>
        <td>
          <Input value={form.debit} onChange={(ev) => setForm({ ...form, debit: ev.target.value })}
            placeholder="0" className="h-7 text-xs w-[90px] text-right mono" />
        </td>
        <td>
          <Input value={form.credit} onChange={(ev) => setForm({ ...form, credit: ev.target.value })}
            placeholder="0" className="h-7 text-xs w-[90px] text-right mono" />
        </td>
        <td colSpan={2}>
          <div className="flex gap-1">
            <Button size="sm" variant="default" className="h-7 px-2" onClick={saveEdit}>
              <Check className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={cancelEdit}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className={`${rowBg} group cursor-pointer hover:bg-muted/30 ${justUpdated ? 'animate-pulse' : ''}`} onDoubleClick={startEdit}>
      <td><Checkbox checked={selected} onCheckedChange={() => onToggleSelect(e.id)} /></td>
      <td className="text-xs mono">{highlightMatch(e.date, searchQuery)}</td>
      <td className="text-xs mono text-muted-foreground">{highlightMatch(e.reference, searchQuery)}</td>
      <td className="text-sm max-w-[200px]">
        <div className="truncate">{highlightMatch(e.description, searchQuery)}</div>
        {conf && conf.inconsistency && (
          <div className="flex items-center gap-1 mt-1 p-1 rounded bg-destructive/10 border border-destructive/20">
            <Lightbulb className="h-3 w-3 text-destructive shrink-0" />
            <span className="text-[10px] text-destructive font-medium truncate">{conf.inconsistency}</span>
          </div>
        )}
        {conf && conf.suggestedAccount && (
          <div className="flex items-center gap-1 mt-1">
            <Lightbulb className="h-3 w-3 text-warning shrink-0" />
            <span className="text-[10px] text-warning truncate">
              Suggested: {conf.suggestedAccount} — {conf.suggestedAccountLabel}
            </span>
            <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px] text-warning hover:text-warning ml-1"
              onClick={(ev) => { ev.stopPropagation(); onApplySuggestion(e.id); }}>
              Apply
            </Button>
          </div>
        )}
        {conf && conf.suggestion && !conf.suggestedAccount && conf.level === 'low' && (
          <div className="flex items-center gap-1 mt-1">
            <Lightbulb className="h-3 w-3 text-warning shrink-0" />
            <span className="text-[10px] text-warning truncate">{conf.suggestion}</span>
            <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px] text-warning hover:text-warning ml-1"
              onClick={(ev) => { ev.stopPropagation(); onApplySuggestion(e.id); }}>
              Apply
            </Button>
          </div>
        )}
      </td>
      <td className="text-right mono text-sm">{e.debit > 0 ? e.debit.toLocaleString() : ''}</td>
      <td className="text-right mono text-sm">{e.credit > 0 ? e.credit.toLocaleString() : ''}</td>
      <td>
        <Select value={e.journalType || ''} onValueChange={(v) => onChangeJournal(e.id, v as JournalType)}>
          <SelectTrigger className="w-[130px] h-7 text-xs">
            <SelectValue placeholder="Unclassified" />
          </SelectTrigger>
          <SelectContent>
            {JOURNAL_TYPES.map((j) => (
              <SelectItem key={j.value} value={j.value}>
                <span className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${JOURNAL_DOT[j.value]}`} />
                  {j.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="text-center">
        <div className="flex items-center justify-center gap-1">
          {justUpdated && (
            <Tooltip>
              <TooltipTrigger asChild>
                <RefreshCw className="h-3 w-3 text-info animate-spin" />
              </TooltipTrigger>
              <TooltipContent side="left"><p className="text-xs">Recomputed</p></TooltipContent>
            </Tooltip>
          )}
          {conf && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge className={`text-[10px] px-2 py-0.5 cursor-help ${confidenceBadgeClass(conf.level)}`}>
                  {conf.confidence}%
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-[220px]">
                <p className="text-xs font-semibold mb-1">
                  {conf.level === 'high' ? 'High' : conf.level === 'medium' ? 'Medium' : 'Low'} Confidence
                </p>
                <p className="text-xs text-muted-foreground">{conf.reason}</p>
                {conf.suggestion && <p className="text-xs text-warning mt-1">{conf.suggestion}</p>}
              </TooltipContent>
            </Tooltip>
          )}
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100" onClick={startEdit}>
            <Pencil className="h-3 w-3" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
