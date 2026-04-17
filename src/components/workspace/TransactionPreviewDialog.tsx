import { useState, useMemo, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, Search, Trash2, Sparkles, Download, ArrowRight, Edit3, X, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { POSTES, CATEGORIES_TRESO, CATEGORIES_PNL } from '@/types/transaction';
import type { Transaction } from '@/types/transaction';
import { autoCategorize } from '@/lib/transactionCategorization';
import type { LearnedPattern } from '@/lib/transactionCategorization';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ColumnDetection {
  dateCol: string;
  descCol: string;
  amountCol: string;
  sourceCol: string;
  entityCol: string;
  tvaCol: string;
}

export interface TransactionPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rawRows: Record<string, unknown>[];
  headers: string[];
  fileName: string;
  detectedColumns: ColumnDetection;
  learnedPatterns: LearnedPattern[];
  activity?: string;
  onConfirm: (transactions: Transaction[]) => void;
}

function InlineSelect({ value, options, onChange, placeholder }: {
  value: string; options: readonly string[]; onChange: (v: string) => void; placeholder?: string;
}) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search) return [...options];
    const q = search.toLowerCase();
    return options.filter(o => o.toLowerCase().includes(q));
  }, [options, search]);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-7 text-xs w-full min-w-[130px]">
        <SelectValue placeholder={placeholder || 'Select...'} />
      </SelectTrigger>
      <SelectContent>
        <div className="px-2 pb-1">
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..." className="h-7 text-xs" onClick={(e) => e.stopPropagation()} />
        </div>
        {filtered.map(opt => (
          <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
        ))}
        {filtered.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">No match</div>}
      </SelectContent>
    </Select>
  );
}

export function TransactionPreviewDialog({
  open, onOpenChange, rawRows, headers, fileName, detectedColumns, learnedPatterns, activity, onConfirm,
}: TransactionPreviewDialogProps) {
  // Column mapping state (user can adjust)
  const [colMap, setColMap] = useState<ColumnDetection>(detectedColumns);
  const [mappingConfirmed, setMappingConfirmed] = useState(false);

  // Parse transactions from raw rows using current column mapping
  const parsedTransactions = useMemo(() => {
    const { dateCol, descCol, amountCol, sourceCol, entityCol, tvaCol } = colMap;
    return rawRows.map((row, idx) => {
      const desc = String(row[descCol] || '');
      const amt = parseFloat(String(row[amountCol] || '0').replace(/[^\d.,-]/g, '').replace(',', '.')) || 0;
      const suggestion = autoCategorize(desc, amt, learnedPatterns);
      return {
        id: `tx-preview-${idx}`,
        date: String(row[dateCol] || ''),
        description: desc,
        amount: amt,
        sourceAccount: String(row[sourceCol] || ''),
        poste: suggestion.confidence >= 60 ? suggestion.poste : '',
        categorieTreso: suggestion.confidence >= 60 ? suggestion.categorieTreso : '',
        categoriePnL: suggestion.confidence >= 60 ? suggestion.categoriePnL : '',
        tva: parseFloat(String(row[tvaCol] || '0')) || 0,
        entity: String(row[entityCol] || ''),
        source: fileName,
        isMapped: suggestion.confidence >= 60,
        _confidence: suggestion.confidence,
      } as Transaction & { _confidence: number };
    }).filter(tx => tx.date || tx.description || tx.amount !== 0);
  }, [rawRows, colMap, learnedPatterns, fileName]);

  // Local editable state
  const [transactions, setTransactions] = useState<(Transaction & { _confidence: number })[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Transaction>>({});
  const [isCategorizing, setIsCategorizing] = useState(false);

  // Initialize transactions when mapping is confirmed
  const confirmMapping = () => {
    setTransactions(parsedTransactions);
    setMappingConfirmed(true);
  };

  // Stats
  const mappedCount = useMemo(() => transactions.filter(t => t.isMapped && t.poste).length, [transactions]);
  const mappingPercent = transactions.length > 0 ? Math.round((mappedCount / transactions.length) * 100) : 0;
  const unmappedCount = transactions.length - mappedCount;

  // Filtering
  const filtered = useMemo(() => {
    if (!searchQuery) return transactions;
    const q = searchQuery.toLowerCase();
    return transactions.filter(t =>
      t.description.toLowerCase().includes(q) ||
      t.sourceAccount.toLowerCase().includes(q) ||
      String(t.amount).includes(q) ||
      t.poste.toLowerCase().includes(q)
    );
  }, [transactions, searchQuery]);

  const toggleSelect = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(t => t.id)));
  };

  const handleFieldChange = useCallback((txId: string, field: keyof Transaction, value: string | number) => {
    setTransactions(prev => prev.map(t => {
      if (t.id !== txId) return t;
      const updated = { ...t, [field]: value };
      if (field === 'poste' || field === 'categorieTreso' || field === 'categoriePnL') {
        updated.isMapped = !!(updated.poste && updated.categorieTreso && updated.categoriePnL);
      }
      return updated;
    }));
  }, []);

  const handleBulkPoste = (poste: string) => {
    const ids = new Set(selected);
    setTransactions(prev => prev.map(t =>
      ids.has(t.id) ? { ...t, poste, isMapped: true } : t
    ));
    toast.success(`Updated ${selected.size} rows`);
    setSelected(new Set());
  };

  const handleBulkDelete = () => {
    const ids = new Set(selected);
    setTransactions(prev => prev.filter(t => !ids.has(t.id)));
    toast.success(`Removed ${selected.size} rows`);
    setSelected(new Set());
  };

  const handleRemoveDuplicates = () => {
    const seen = new Set<string>();
    const deduped = transactions.filter(t => {
      const key = `${t.date}|${t.description}|${t.amount}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const removed = transactions.length - deduped.length;
    if (removed > 0) {
      setTransactions(deduped);
      toast.success(`Removed ${removed} duplicate${removed > 1 ? 's' : ''}`);
    } else {
      toast.info('No duplicates found');
    }
  };

  const handleAutoCategorize = () => {
    let count = 0;
    setTransactions(prev => prev.map(t => {
      if (t.isMapped && t.poste && t.poste !== 'Autres charges') return t;
      const suggestion = autoCategorize(t.description, t.amount, learnedPatterns);
      if (suggestion.confidence >= 60) {
        count++;
        return { ...t, poste: suggestion.poste, categorieTreso: suggestion.categorieTreso, categoriePnL: suggestion.categoriePnL, isMapped: true, _confidence: suggestion.confidence };
      }
      return t;
    }));
    toast.success(`Auto-categorized ${count} transactions`);
  };

  const startEdit = (tx: Transaction) => {
    setEditingId(tx.id);
    setEditForm({ date: tx.date, description: tx.description, amount: tx.amount, sourceAccount: tx.sourceAccount, entity: tx.entity, tva: tx.tva });
  };
  const saveEdit = () => {
    if (!editingId) return;
    setTransactions(prev => prev.map(t => t.id === editingId ? { ...t, ...editForm } : t));
    setEditingId(null);
    setEditForm({});
  };

  const handleConfirmImport = () => {
    if (unmappedCount > 0 && mappingPercent < 50) {
      toast.warning('Less than 50% categorized. Please categorize more transactions before importing.');
      return;
    }
    // Strip internal _confidence field
    const finalTxs: Transaction[] = transactions.map(({ _confidence, ...rest }) => ({
      ...rest,
      id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    }));
    onConfirm(finalTxs);
  };

  const colOptions = ['', ...headers];

  // ─── Column Mapping Step ───────────────────────────────────────
  if (!mappingConfirmed) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Column Detection — {fileName}
            </DialogTitle>
            <DialogDescription>
              We detected your columns automatically. Confirm or adjust the mapping below.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 mb-2">
            <p className="text-sm font-medium text-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Columns auto-detected — confirm or adjust
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {([
              { label: 'Date', key: 'dateCol' as const, required: true },
              { label: 'Description', key: 'descCol' as const, required: true },
              { label: 'Amount', key: 'amountCol' as const, required: true },
              { label: 'Source Account', key: 'sourceCol' as const, required: false },
              { label: 'Entity', key: 'entityCol' as const, required: false },
              { label: 'TVA / VAT', key: 'tvaCol' as const, required: false },
            ]).map(({ label, key, required }) => (
              <div key={key} className="space-y-1">
                <label className="text-xs font-medium text-foreground flex items-center gap-1">
                  {label}
                  {required && <span className="text-destructive">*</span>}
                </label>
                <Select value={colMap[key]} onValueChange={(v) => setColMap(prev => ({ ...prev, [key]: v }))}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select column..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" className="text-muted-foreground text-sm">— Not mapped —</SelectItem>
                    {headers.map(h => (
                      <SelectItem key={h} value={h} className="text-sm">{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          {/* Preview first 3 rows */}
          <div className="mt-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Preview (first 3 rows)</p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50">
                    {headers.map(h => (
                      <th key={h} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rawRows.slice(0, 3).map((row, i) => (
                    <tr key={i} className="border-t border-border">
                      {headers.map(h => (
                        <td key={h} className="px-2 py-1.5 text-foreground whitespace-nowrap max-w-[150px] truncate">
                          {String(row[h] || '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={confirmMapping} disabled={!colMap.dateCol || !colMap.amountCol}>
              Confirm Mapping
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ─── Enrichment / Preview Step ─────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[95vw] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Transaction Preview — {fileName}
            <Badge variant="secondary" className="ml-2 text-xs">{transactions.length} rows</Badge>
          </DialogTitle>
          <DialogDescription>
            Review, edit, and categorize your transactions before importing.
          </DialogDescription>
        </DialogHeader>

        {/* Stats bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-muted/30 border border-border rounded-lg p-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</p>
            <p className="text-base font-bold text-foreground">{transactions.length}</p>
          </div>
          <div className="bg-muted/30 border border-border rounded-lg p-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Categorized</p>
            <p className="text-base font-bold text-success">{mappedCount}</p>
          </div>
          <div className="bg-muted/30 border border-border rounded-lg p-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Unmapped</p>
            <p className="text-base font-bold text-warning">{unmappedCount}</p>
          </div>
          <div className="bg-muted/30 border border-border rounded-lg p-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Completion</p>
            <div className="flex items-center gap-2 mt-0.5">
              <Progress value={mappingPercent} className="h-2 flex-1" />
              <span className="text-sm font-bold text-foreground">{mappingPercent}%</span>
            </div>
          </div>
        </div>

        {/* Action bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search transactions..." className="h-8 pl-8 text-xs" />
          </div>
          <Button size="sm" variant="outline" onClick={handleAutoCategorize} className="h-8 text-xs gap-1">
            <Sparkles className="h-3 w-3" /> Auto-categorize
          </Button>
          <Button size="sm" variant="outline" onClick={handleRemoveDuplicates} className="h-8 text-xs gap-1">
            Remove duplicates
          </Button>
          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Bulk actions */}
        {selected.size > 0 && (
          <div className="flex items-center gap-2 bg-accent/50 rounded-lg px-3 py-2">
            <span className="text-xs font-medium text-foreground">{selected.size} selected</span>
            <Select onValueChange={handleBulkPoste}>
              <SelectTrigger className="h-7 w-[160px] text-xs"><SelectValue placeholder="Set Poste..." /></SelectTrigger>
              <SelectContent>
                {POSTES.map(p => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="ghost" onClick={handleBulkDelete} className="text-destructive h-7 text-xs">
              <Trash2 className="h-3 w-3 mr-1" />Delete
            </Button>
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8 sticky top-0 bg-background z-10">
                  <Checkbox checked={selected.size === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead className="text-xs sticky top-0 bg-background z-10">Date</TableHead>
                <TableHead className="text-xs sticky top-0 bg-background z-10">Description</TableHead>
                <TableHead className="text-xs sticky top-0 bg-background z-10">Amount</TableHead>
                <TableHead className="text-xs sticky top-0 bg-background z-10">Source</TableHead>
                <TableHead className="text-xs min-w-[140px] sticky top-0 bg-background z-10">Poste</TableHead>
                <TableHead className="text-xs min-w-[140px] sticky top-0 bg-background z-10">Cat. Tréso</TableHead>
                <TableHead className="text-xs min-w-[140px] sticky top-0 bg-background z-10">Cat. P&L</TableHead>
                <TableHead className="text-xs sticky top-0 bg-background z-10">TVA</TableHead>
                <TableHead className="text-xs sticky top-0 bg-background z-10 w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((tx) => {
                const isEditing = editingId === tx.id;
                const isMissing = !tx.poste;
                return (
                  <TableRow key={tx.id} className={isMissing ? 'bg-warning/5' : ''}>
                    <TableCell className="py-1">
                      <Checkbox checked={selected.has(tx.id)} onCheckedChange={() => toggleSelect(tx.id)} />
                    </TableCell>
                    <TableCell className="text-xs py-1">
                      {isEditing ? (
                        <Input value={editForm.date || ''} onChange={(e) => setEditForm(f => ({ ...f, date: e.target.value }))} className="h-7 text-xs w-[90px]" />
                      ) : tx.date}
                    </TableCell>
                    <TableCell className="text-xs py-1 max-w-[180px] truncate">
                      {isEditing ? (
                        <Input value={editForm.description || ''} onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))} className="h-7 text-xs" />
                      ) : tx.description}
                    </TableCell>
                    <TableCell className={`text-xs py-1 font-medium ${tx.amount >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {isEditing ? (
                        <Input type="number" value={editForm.amount ?? ''} onChange={(e) => setEditForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} className="h-7 text-xs w-[90px]" />
                      ) : tx.amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-xs py-1 text-muted-foreground">
                      {isEditing ? (
                        <Input value={editForm.sourceAccount || ''} onChange={(e) => setEditForm(f => ({ ...f, sourceAccount: e.target.value }))} className="h-7 text-xs w-[90px]" />
                      ) : tx.sourceAccount || '-'}
                    </TableCell>
                    <TableCell className="py-1">
                      <InlineSelect value={tx.poste} options={POSTES} onChange={(v) => handleFieldChange(tx.id, 'poste', v)} placeholder="Select Poste" />
                    </TableCell>
                    <TableCell className="py-1">
                      <InlineSelect value={tx.categorieTreso} options={CATEGORIES_TRESO} onChange={(v) => handleFieldChange(tx.id, 'categorieTreso', v)} placeholder="Cat. Tréso" />
                    </TableCell>
                    <TableCell className="py-1">
                      <InlineSelect value={tx.categoriePnL} options={CATEGORIES_PNL} onChange={(v) => handleFieldChange(tx.id, 'categoriePnL', v)} placeholder="Cat. P&L" />
                    </TableCell>
                    <TableCell className="text-xs py-1">
                      {isEditing ? (
                        <Input type="number" value={editForm.tva ?? ''} onChange={(e) => setEditForm(f => ({ ...f, tva: parseFloat(e.target.value) || 0 }))} className="h-7 text-xs w-[55px]" />
                      ) : tx.tva ? `${tx.tva}%` : '-'}
                    </TableCell>
                    <TableCell className="py-1">
                      {isEditing ? (
                        <div className="flex gap-0.5">
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={saveEdit}><Check className="h-3 w-3" /></Button>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingId(null)}><X className="h-3 w-3" /></Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => startEdit(tx)}>
                          <Edit3 className="h-3 w-3" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-8">
                    No transactions match your search.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Validation warning */}
        {unmappedCount > 0 && (
          <Alert className="border-warning/30 bg-warning/5">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertTitle className="text-sm">
              {unmappedCount} uncategorized transaction{unmappedCount > 1 ? 's' : ''}
            </AlertTitle>
            <AlertDescription className="text-xs">
              {mappingPercent >= 50
                ? 'You can import now and categorize later, or use Auto-categorize to fill missing fields.'
                : 'Please categorize at least 50% of transactions before importing.'}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConfirmImport} className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Confirm & Import ({transactions.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
