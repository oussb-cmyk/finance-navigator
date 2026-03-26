import { useState, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useProjectStore } from '@/store/useProjectStore';
import { useProjectEntries } from '@/hooks/useStableStoreSelectors';
import { classifyEntries, reclassifyEntries, classifyWithConfidence } from '@/lib/journalClassification';
import type { ClassificationResult } from '@/lib/journalClassification';
import { useLearningStore } from '@/store/useLearningStore';
import { JOURNAL_TYPES } from '@/types/finance';
import type { JournalType, JournalEntry } from '@/types/finance';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { JournalSearchFilters, applySearchFilters, highlightMatch, type SearchFilters } from '@/components/workspace/JournalSearchFilters';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AlertTriangle, Sparkles, CheckCircle, RotateCcw, ChevronDown, ChevronRight, Eye, ShieldAlert, Lightbulb } from 'lucide-react';

/* ── Journal colour tokens (semantic) ──────────────────────────────── */
const JOURNAL_COLORS: Record<JournalType, string> = {
  sales: 'bg-success/15 text-success border-success/30',
  purchases: 'bg-destructive/15 text-destructive border-destructive/30',
  bank: 'bg-info/15 text-info border-info/30',
  cash: 'bg-purple-500/15 text-purple-700 border-purple-500/30',
  payroll: 'bg-pink-500/15 text-pink-700 border-pink-500/30',
  tax: 'bg-warning/15 text-warning border-warning/30',
  financing: 'bg-cyan-500/15 text-cyan-700 border-cyan-500/30',
  general: 'bg-muted text-muted-foreground border-border',
};

const JOURNAL_DOT: Record<JournalType, string> = {
  sales: 'bg-success',
  purchases: 'bg-destructive',
  bank: 'bg-info',
  cash: 'bg-purple-500',
  payroll: 'bg-pink-500',
  tax: 'bg-warning',
  financing: 'bg-cyan-500',
  general: 'bg-muted-foreground',
};

/* ── Confidence helpers ────────────────────────────────────────────── */
function confidenceBadgeClass(level: 'high' | 'medium' | 'low'): string {
  switch (level) {
    case 'high': return 'bg-success/15 text-success border-success/30';
    case 'medium': return 'bg-warning/15 text-warning border-warning/30';
    case 'low': return 'bg-destructive/15 text-destructive border-destructive/30';
  }
}

function confidenceRowBg(level: 'high' | 'medium' | 'low'): string {
  switch (level) {
    case 'high': return '';
    case 'medium': return 'bg-warning/5';
    case 'low': return 'bg-destructive/5';
  }
}

/* ── Grouped-by-account helper ─────────────────────────────────────── */
interface AccountGroup {
  accountCode: string;
  accountName: string;
  journalType: JournalType | undefined;
  entries: JournalEntry[];
}

function groupByAccount(entries: JournalEntry[]): AccountGroup[] {
  const map = new Map<string, AccountGroup>();
  for (const e of entries) {
    const key = e.accountCode || '__none__';
    if (!map.has(key)) {
      map.set(key, {
        accountCode: e.accountCode,
        accountName: e.accountName,
        journalType: e.journalType,
        entries: [],
      });
    }
    map.get(key)!.entries.push(e);
  }
  return Array.from(map.values()).sort((a, b) => a.accountCode.localeCompare(b.accountCode));
}

/* ── Component ─────────────────────────────────────────────────────── */

export default function JournalClassificationPage() {
  const { projectId } = useParams();
  const pid = projectId || '';
  const entries = useProjectEntries(pid);
  const setProjectEntries = useProjectStore((s) => s.setProjectEntries);
  const learnAccountPatterns = useLearningStore((s) => s.learnAccountPatterns);
  const recordCorrection = useLearningStore((s) => s.recordCorrection);

  const [filterJournal, setFilterJournal] = useState<string>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkType, setBulkType] = useState<JournalType | ''>('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({ query: '', amountMin: '', amountMax: '', dateFrom: '', dateTo: '' });
  const [showOnlyIssues, setShowOnlyIssues] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  /* ── Confidence map (computed once per entries change) ──── */
  const confidenceMap = useMemo(() => {
    const map = new Map<string, ClassificationResult>();
    entries.forEach((e) => {
      map.set(e.id, classifyWithConfidence(e));
    });
    return map;
  }, [entries]);

  /* ── Confidence summary stats ─────────────────────────── */
  const confidenceStats = useMemo(() => {
    let high = 0, medium = 0, low = 0;
    confidenceMap.forEach((c) => {
      if (c.level === 'high') high++;
      else if (c.level === 'medium') medium++;
      else low++;
    });
    return { high, medium, low, needsReview: medium + low };
  }, [confidenceMap]);

  /* ── Derived data ─────────────────────────────────────── */
  const unclassified = useMemo(() => entries.filter((e) => !e.journalType).length, [entries]);

  const workingEntries = useMemo(() => {
    let result = entries;
    // Focus mode: only low/medium confidence
    if (focusMode) {
      result = result.filter((e) => {
        const c = confidenceMap.get(e.id);
        return c && c.level !== 'high';
      });
      // Sort by confidence ascending
      result = [...result].sort((a, b) => {
        const ca = confidenceMap.get(a.id)?.confidence ?? 0;
        const cb = confidenceMap.get(b.id)?.confidence ?? 0;
        return ca - cb;
      });
    }
    // Show only issues toggle
    if (showOnlyIssues && !focusMode) {
      result = result.filter((e) => {
        const c = confidenceMap.get(e.id);
        return c && c.level === 'low';
      });
    }
    return result;
  }, [entries, focusMode, showOnlyIssues, confidenceMap]);

  const journalFiltered = useMemo(() => {
    if (filterJournal === 'all') return workingEntries;
    if (filterJournal === 'unclassified') return workingEntries.filter((e) => !e.journalType);
    return workingEntries.filter((e) => e.journalType === filterJournal);
  }, [workingEntries, filterJournal]);

  const filteredEntries = useMemo(
    () => applySearchFilters(journalFiltered, searchFilters) as JournalEntry[],
    [journalFiltered, searchFilters],
  );

  const journalCounts = useMemo(() => {
    const counts: Record<string, number> = { unclassified: 0 };
    JOURNAL_TYPES.forEach((j) => { counts[j.value] = 0; });
    entries.forEach((e) => {
      if (!e.journalType) counts.unclassified++;
      else counts[e.journalType] = (counts[e.journalType] || 0) + 1;
    });
    return counts;
  }, [entries]);

  const accountGroups = useMemo(() => groupByAccount(filteredEntries), [filteredEntries]);

  /* ── Actions ──────────────────────────────────────────── */
  const handleAutoClassify = useCallback(() => {
    if (!projectId) return;
    const classified = classifyEntries(entries);
    setProjectEntries(projectId, classified);
  }, [projectId, entries, setProjectEntries]);

  const handleReclassifyAll = useCallback(() => {
    if (!projectId) return;
    const reclassified = reclassifyEntries(entries);
    setProjectEntries(projectId, reclassified);
  }, [projectId, entries, setProjectEntries]);

  const handleChangeJournal = useCallback(
    (entryId: string, type: JournalType) => {
      if (!projectId) return;
      const entry = entries.find((e) => e.id === entryId);
      if (entry) {
        recordCorrection(projectId, {
          original: { accountCode: entry.accountCode, description: entry.description },
          corrected: { accountCode: entry.accountCode, description: entry.description },
          timestamp: Date.now(),
        });
        learnAccountPatterns(projectId, [{ code: entry.accountCode, name: entry.accountName }]);
      }
      const updated = entries.map((e) => (e.id === entryId ? { ...e, journalType: type } : e));
      setProjectEntries(projectId, updated);
    },
    [projectId, entries, setProjectEntries, recordCorrection, learnAccountPatterns],
  );

  const handleBulkApply = useCallback(() => {
    if (!projectId || !bulkType || selected.size === 0) return;
    const updated = entries.map((e) =>
      selected.has(e.id) ? { ...e, journalType: bulkType as JournalType } : e,
    );
    setProjectEntries(projectId, updated);
    setSelected(new Set());
    setBulkType('');
  }, [projectId, bulkType, selected, entries, setProjectEntries]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroup = (code: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  /* ── Empty state ──────────────────────────────────────── */
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

  /* ── Main render ──────────────────────────────────────── */
  return (
    <TooltipProvider>
      <div>
        {/* Header */}
        <div className="page-header flex items-start justify-between">
          <div>
            <h1 className="page-title">Journal Classification</h1>
            <p className="page-subtitle">
              {entries.length} entries · {entries.length - unclassified} classified · {unclassified} unclassified
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleReclassifyAll}>
              <RotateCcw className="h-3 w-3 mr-1" />
              Re-Classify All
            </Button>
            <Button variant="default" size="sm" onClick={handleAutoClassify}>
              <Sparkles className="h-3 w-3 mr-1" />
              Auto-Classify
            </Button>
          </div>
        </div>

        {/* ── Confidence summary panel ──────────────────────── */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground font-medium">Total Entries</p>
            <p className="text-2xl font-bold text-foreground mt-1">{entries.length}</p>
          </div>
          <div className="bg-success/10 border border-success/30 rounded-xl p-4">
            <p className="text-xs text-success font-medium">High Confidence</p>
            <p className="text-2xl font-bold text-success mt-1">{confidenceStats.high}</p>
          </div>
          <div className="bg-warning/10 border border-warning/30 rounded-xl p-4">
            <p className="text-xs text-warning font-medium">Medium Confidence</p>
            <p className="text-2xl font-bold text-warning mt-1">{confidenceStats.medium}</p>
          </div>
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4">
            <p className="text-xs text-destructive font-medium">Needs Review</p>
            <p className="text-2xl font-bold text-destructive mt-1">{confidenceStats.low}</p>
          </div>
        </div>

        {/* ── Priority review banner ───────────────────────── */}
        {confidenceStats.needsReview > 0 ? (
          <div className={`border rounded-xl p-4 mb-6 flex items-center justify-between ${
            confidenceStats.low > 0 
              ? 'bg-destructive/10 border-destructive/30' 
              : 'bg-warning/10 border-warning/30'
          }`}>
            <div className="flex items-center gap-3">
              <ShieldAlert className={`h-5 w-5 shrink-0 ${confidenceStats.low > 0 ? 'text-destructive' : 'text-warning'}`} />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {confidenceStats.needsReview} entries need review
                </p>
                <p className="text-xs text-muted-foreground">
                  {confidenceStats.low > 0 && `${confidenceStats.low} low confidence · `}
                  {confidenceStats.medium > 0 && `${confidenceStats.medium} medium confidence`}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant={focusMode ? 'secondary' : 'default'}
              onClick={() => setFocusMode(!focusMode)}
              className="gap-1.5"
            >
              <Eye className="h-3.5 w-3.5" />
              {focusMode ? 'Exit Focus Mode' : 'Review Issues'}
            </Button>
          </div>
        ) : (
          <div className="bg-success/10 border border-success/30 rounded-xl p-4 mb-6 flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-success shrink-0" />
            <p className="text-sm font-semibold text-foreground">All entries classified with high confidence — ready for Mapping</p>
          </div>
        )}

        {/* Focus mode indicator */}
        {focusMode && (
          <div className="bg-info/10 border border-info/30 rounded-xl p-3 mb-4 flex items-center gap-3">
            <Eye className="h-4 w-4 text-info" />
            <p className="text-sm text-foreground">
              <span className="font-semibold">Focus Mode:</span> Showing {workingEntries.length} entries sorted by lowest confidence first
            </p>
            <Button size="sm" variant="ghost" className="ml-auto text-xs" onClick={() => setFocusMode(false)}>
              Exit
            </Button>
          </div>
        )}

        {/* ── Filter chips + hover summary ─────────────────── */}
        {!focusMode && (
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              onClick={() => setFilterJournal('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                filterJournal === 'all'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border text-foreground hover:bg-muted'
              }`}
            >
              All ({entries.length})
            </button>

            {unclassified > 0 && (
              <button
                onClick={() => setFilterJournal('unclassified')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  filterJournal === 'unclassified'
                    ? 'bg-warning text-warning-foreground border-warning'
                    : 'bg-warning/10 border-warning/30 text-foreground hover:bg-warning/20'
                }`}
              >
                Unclassified ({unclassified})
              </button>
            )}

            {JOURNAL_TYPES.map(
              (j) =>
                journalCounts[j.value] > 0 && (
                  <HoverCard key={j.value} openDelay={200} closeDelay={100}>
                    <HoverCardTrigger asChild>
                      <button
                        onClick={() => setFilterJournal(j.value)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          filterJournal === j.value
                            ? 'bg-primary text-primary-foreground border-primary'
                            : `${JOURNAL_COLORS[j.value]} hover:opacity-80`
                        }`}
                      >
                        {j.label} ({journalCounts[j.value]})
                      </button>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-56 p-3" side="bottom">
                      <p className="text-xs font-semibold mb-2">{j.label} Journal</p>
                      <p className="text-xs text-muted-foreground">
                        {journalCounts[j.value]} entries classified as {j.label}
                      </p>
                    </HoverCardContent>
                  </HoverCard>
                ),
            )}
          </div>
        )}

        {/* ── Search bar + show-only-issues toggle ─────────── */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex-1">
            <JournalSearchFilters
              filters={searchFilters}
              onChange={setSearchFilters}
              resultCount={filteredEntries.length}
              totalCount={entries.length}
            />
          </div>
          {!focusMode && (
            <div className="flex items-center gap-2 shrink-0">
              <Switch
                checked={showOnlyIssues}
                onCheckedChange={setShowOnlyIssues}
                id="show-issues"
              />
              <label htmlFor="show-issues" className="text-xs font-medium text-muted-foreground cursor-pointer">
                Only issues
              </label>
            </div>
          )}
        </div>

        {/* ── Bulk edit bar ────────────────────────────────── */}
        {selected.size > 0 && (
          <div className="bg-muted border border-border rounded-xl p-3 mb-4 flex items-center gap-3">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <Select value={bulkType} onValueChange={(v) => setBulkType(v as JournalType)}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue placeholder="Assign journal..." />
              </SelectTrigger>
              <SelectContent>
                {JOURNAL_TYPES.map((j) => (
                  <SelectItem key={j.value} value={j.value}>
                    {j.label}
                  </SelectItem>
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

        {/* ── Grouped table ────────────────────────────────── */}
        <div className="space-y-3">
          {accountGroups.map((group) => {
            const isCollapsed = collapsedGroups.has(group.accountCode);
            const groupJournal = group.entries[0]?.journalType;
            const dotColor = groupJournal ? JOURNAL_DOT[groupJournal] : 'bg-warning';

            return (
              <div key={group.accountCode} className="bg-card border border-border rounded-xl overflow-hidden">
                {/* Account header */}
                <button
                  onClick={() => toggleGroup(group.accountCode)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${dotColor}`} />
                  <span className="mono text-sm font-bold text-foreground">{highlightMatch(group.accountCode || '—', searchFilters.query)}</span>
                  <span className="text-sm text-muted-foreground truncate">{highlightMatch(group.accountName, searchFilters.query)}</span>
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {group.entries.length}
                  </Badge>
                  {groupJournal && (
                    <Badge className={`text-xs ${JOURNAL_COLORS[groupJournal]}`}>{groupJournal}</Badge>
                  )}
                  {!groupJournal && (
                    <Badge className="text-xs bg-warning/15 text-warning border-warning/30">unclassified</Badge>
                  )}
                </button>

                {/* Transactions */}
                {!isCollapsed && (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th className="w-8">
                          <Checkbox
                            checked={group.entries.every((e) => selected.has(e.id))}
                            onCheckedChange={() => {
                              const ids = group.entries.map((e) => e.id);
                              setSelected((prev) => {
                                const next = new Set(prev);
                                const allSelected = ids.every((id) => next.has(id));
                                ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
                                return next;
                              });
                            }}
                          />
                        </th>
                        <th>Date</th>
                        <th>Reference</th>
                        <th>Description</th>
                        <th className="text-right">Debit</th>
                        <th className="text-right">Credit</th>
                        <th>Journal</th>
                        <th className="w-24 text-center">Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.entries.map((e) => {
                        const conf = confidenceMap.get(e.id);
                        const rowBg = conf ? confidenceRowBg(conf.level) : '';

                        return (
                          <tr key={e.id} className={rowBg}>
                            <td>
                              <Checkbox
                                checked={selected.has(e.id)}
                                onCheckedChange={() => toggleSelect(e.id)}
                              />
                            </td>
                            <td className="text-xs mono">{highlightMatch(e.date, searchFilters.query)}</td>
                            <td className="text-xs mono text-muted-foreground">{highlightMatch(e.reference, searchFilters.query)}</td>
                            <td className="text-sm max-w-[200px]">
                              <div className="truncate">{highlightMatch(e.description, searchFilters.query)}</div>
                              {/* Smart suggestion for low confidence */}
                              {conf && conf.suggestion && conf.level === 'low' && (
                                <div className="flex items-center gap-1 mt-1">
                                  <Lightbulb className="h-3 w-3 text-warning shrink-0" />
                                  <span className="text-[10px] text-warning truncate">{conf.suggestion}</span>
                                </div>
                              )}
                            </td>
                            <td className="text-right mono text-sm">
                              {e.debit > 0 ? `${e.debit.toLocaleString()}` : ''}
                            </td>
                            <td className="text-right mono text-sm">
                              {e.credit > 0 ? `${e.credit.toLocaleString()}` : ''}
                            </td>
                            <td>
                              <Select
                                value={e.journalType || ''}
                                onValueChange={(v) => handleChangeJournal(e.id, v as JournalType)}
                              >
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
                                    {conf.suggestion && (
                                      <p className="text-xs text-warning mt-1">{conf.suggestion}</p>
                                    )}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>

        {filteredEntries.length === 0 && (
          <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground">
            {focusMode ? 'No entries need review — all entries have high confidence.' : 'No entries match this filter.'}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
