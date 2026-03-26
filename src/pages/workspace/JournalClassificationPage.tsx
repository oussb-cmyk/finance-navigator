import { useState, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useProjectStore } from '@/store/useProjectStore';
import { useProjectEntries } from '@/hooks/useStableStoreSelectors';
import { classifyEntries } from '@/lib/journalClassification';
import { JOURNAL_TYPES } from '@/types/finance';
import type { JournalType, JournalEntry } from '@/types/finance';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, Sparkles, CheckCircle, Filter } from 'lucide-react';

const JOURNAL_COLORS: Record<JournalType, string> = {
  sales: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  purchases: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  bank: 'bg-blue-500/15 text-blue-700 border-blue-500/30',
  cash: 'bg-purple-500/15 text-purple-700 border-purple-500/30',
  general: 'bg-muted text-muted-foreground border-border',
};

export default function JournalClassificationPage() {
  const { projectId } = useParams();
  const pid = projectId || '';
  const entries = useProjectEntries(pid);
  const setProjectEntries = useProjectStore((s) => s.setProjectEntries);

  const [filterJournal, setFilterJournal] = useState<string>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkType, setBulkType] = useState<JournalType | ''>('');

  const unclassified = useMemo(() => entries.filter(e => !e.journalType).length, [entries]);

  const filteredEntries = useMemo(() => {
    if (filterJournal === 'all') return entries;
    if (filterJournal === 'unclassified') return entries.filter(e => !e.journalType);
    return entries.filter(e => e.journalType === filterJournal);
  }, [entries, filterJournal]);

  const journalCounts = useMemo(() => {
    const counts: Record<string, number> = { unclassified: 0 };
    JOURNAL_TYPES.forEach(j => { counts[j.value] = 0; });
    entries.forEach(e => {
      if (!e.journalType) counts.unclassified++;
      else counts[e.journalType] = (counts[e.journalType] || 0) + 1;
    });
    return counts;
  }, [entries]);

  const handleAutoClassify = useCallback(() => {
    if (!projectId) return;
    const classified = classifyEntries(entries);
    setProjectEntries(projectId, classified);
  }, [projectId, entries, setProjectEntries]);

  const handleChangeJournal = useCallback((entryId: string, type: JournalType) => {
    if (!projectId) return;
    const updated = entries.map(e => e.id === entryId ? { ...e, journalType: type } : e);
    setProjectEntries(projectId, updated);
  }, [projectId, entries, setProjectEntries]);

  const handleBulkApply = useCallback(() => {
    if (!projectId || !bulkType || selected.size === 0) return;
    const updated = entries.map(e => selected.has(e.id) ? { ...e, journalType: bulkType as JournalType } : e);
    setProjectEntries(projectId, updated);
    setSelected(new Set());
    setBulkType('');
  }, [projectId, bulkType, selected, entries, setProjectEntries]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filteredEntries.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredEntries.map(e => e.id)));
    }
  };

  if (entries.length === 0) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">Journal Classification</h1>
          <p className="page-subtitle">Import data first to classify entries into journals</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground">
          No entries to classify. Go to Data Center to import data.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">Journal Classification</h1>
          <p className="page-subtitle">
            {entries.length} entries · {entries.length - unclassified} classified · {unclassified} unclassified
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleAutoClassify}>
            <Sparkles className="h-3 w-3 mr-1" />Auto-Classify
          </Button>
        </div>
      </div>

      {/* Validation warning */}
      {unclassified > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-700">{unclassified} unclassified entries</p>
            <p className="text-xs text-amber-600">All entries should be classified before proceeding to Mapping</p>
          </div>
        </div>
      )}

      {unclassified === 0 && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 mb-6 flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
          <p className="text-sm font-semibold text-emerald-700">All entries classified — ready for Mapping</p>
        </div>
      )}

      {/* Journal summary chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setFilterJournal('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${filterJournal === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-foreground hover:bg-muted'}`}
        >
          All ({entries.length})
        </button>
        {unclassified > 0 && (
          <button
            onClick={() => setFilterJournal('unclassified')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${filterJournal === 'unclassified' ? 'bg-amber-600 text-white border-amber-600' : 'bg-amber-500/10 border-amber-500/30 text-amber-700 hover:bg-amber-500/20'}`}
          >
            Unclassified ({unclassified})
          </button>
        )}
        {JOURNAL_TYPES.map(j => journalCounts[j.value] > 0 && (
          <button
            key={j.value}
            onClick={() => setFilterJournal(j.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${filterJournal === j.value ? 'bg-primary text-primary-foreground border-primary' : `${JOURNAL_COLORS[j.value]} hover:opacity-80`}`}
          >
            {j.label} ({journalCounts[j.value]})
          </button>
        ))}
      </div>

      {/* Bulk edit bar */}
      {selected.size > 0 && (
        <div className="bg-muted border border-border rounded-xl p-3 mb-4 flex items-center gap-3">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Select value={bulkType} onValueChange={(v) => setBulkType(v as JournalType)}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue placeholder="Assign journal..." />
            </SelectTrigger>
            <SelectContent>
              {JOURNAL_TYPES.map(j => (
                <SelectItem key={j.value} value={j.value}>{j.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="default" onClick={handleBulkApply} disabled={!bulkType}>
            Apply
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-8">
                <Checkbox
                  checked={selected.size === filteredEntries.length && filteredEntries.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
              </th>
              <th>Date</th>
              <th>Reference</th>
              <th>Description</th>
              <th>Account</th>
              <th className="text-right">Debit</th>
              <th className="text-right">Credit</th>
              <th>Journal</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map((e) => (
              <tr key={e.id} className={!e.journalType ? 'bg-amber-500/5' : ''}>
                <td>
                  <Checkbox
                    checked={selected.has(e.id)}
                    onCheckedChange={() => toggleSelect(e.id)}
                  />
                </td>
                <td className="text-xs mono">{e.date}</td>
                <td className="text-xs mono text-muted-foreground">{e.reference}</td>
                <td className="text-sm max-w-[250px] truncate">{e.description}</td>
                <td>
                  <span className="mono text-xs">{e.accountCode}</span>
                  <span className="text-xs text-muted-foreground ml-1">{e.accountName}</span>
                </td>
                <td className="text-right mono text-sm">{e.debit > 0 ? `$${e.debit.toLocaleString()}` : ''}</td>
                <td className="text-right mono text-sm">{e.credit > 0 ? `$${e.credit.toLocaleString()}` : ''}</td>
                <td>
                  <Select
                    value={e.journalType || ''}
                    onValueChange={(v) => handleChangeJournal(e.id, v as JournalType)}
                  >
                    <SelectTrigger className="w-[130px] h-7 text-xs">
                      <SelectValue placeholder="Unclassified" />
                    </SelectTrigger>
                    <SelectContent>
                      {JOURNAL_TYPES.map(j => (
                        <SelectItem key={j.value} value={j.value}>{j.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
