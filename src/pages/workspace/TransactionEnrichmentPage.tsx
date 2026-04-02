import { useState, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, Filter, Search, Edit3, Trash2, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { toast } from 'sonner';
import { useTransactionStore } from '@/store/useTransactionStore';
import { POSTES, CATEGORIES_TRESO, CATEGORIES_PNL } from '@/types/transaction';
import type { Transaction } from '@/types/transaction';
import { autoCategorize } from '@/lib/transactionCategorization';

function ComboSelect({ value, options, onChange, placeholder }: {
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
      <SelectTrigger className="h-7 text-xs w-full min-w-[140px]">
        <SelectValue placeholder={placeholder || 'Select...'} />
      </SelectTrigger>
      <SelectContent>
        <div className="px-2 pb-1">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="h-7 text-xs"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
        {filtered.map(opt => (
          <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
        ))}
        {filtered.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">No match</div>}
      </SelectContent>
    </Select>
  );
}

export default function TransactionEnrichmentPage() {
  const { projectId } = useParams();
  const pid = projectId || '';

  const transactions = useTransactionStore((s) => s.getTransactions(pid));
  const updateTransaction = useTransactionStore((s) => s.updateTransaction);
  const bulkUpdateField = useTransactionStore((s) => s.bulkUpdateField);
  const deleteTransactions = useTransactionStore((s) => s.deleteTransactions);
  const learnFromCorrection = useTransactionStore((s) => s.learnFromCorrection);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPoste, setFilterPoste] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterMapped, setFilterMapped] = useState<'all' | 'mapped' | 'unmapped'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Transaction>>({});

  // Stats
  const mappedCount = useMemo(() => transactions.filter(t => t.isMapped && t.poste).length, [transactions]);
  const mappingPercent = transactions.length > 0 ? Math.round((mappedCount / transactions.length) * 100) : 0;
  const unmappedCount = transactions.length - mappedCount;

  // Filtering
  const filtered = useMemo(() => {
    let result = transactions;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t =>
        t.description.toLowerCase().includes(q) ||
        t.sourceAccount.toLowerCase().includes(q) ||
        String(t.amount).includes(q) ||
        t.poste.toLowerCase().includes(q)
      );
    }
    if (filterPoste !== 'all') result = result.filter(t => t.poste === filterPoste);
    if (filterCategory !== 'all') result = result.filter(t => t.categorieTreso === filterCategory);
    if (filterMapped === 'mapped') result = result.filter(t => t.isMapped);
    if (filterMapped === 'unmapped') result = result.filter(t => !t.isMapped || !t.poste);
    return result;
  }, [transactions, searchQuery, filterPoste, filterCategory, filterMapped]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(t => t.id)));
  };

  const startEdit = (tx: Transaction) => {
    setEditingId(tx.id);
    setEditForm({ date: tx.date, description: tx.description, amount: tx.amount, sourceAccount: tx.sourceAccount, entity: tx.entity, tva: tx.tva });
  };

  const saveEdit = () => {
    if (!editingId) return;
    updateTransaction(pid, editingId, editForm);
    setEditingId(null);
    setEditForm({});
  };

  const handleFieldChange = useCallback((txId: string, field: keyof Transaction, value: string | number) => {
    updateTransaction(pid, txId, { [field]: value });

    // Learn from user correction
    const tx = transactions.find(t => t.id === txId);
    if (tx && (field === 'poste' || field === 'categorieTreso' || field === 'categoriePnL')) {
      const updated = { ...tx, [field]: value };
      if (updated.poste && updated.categorieTreso && updated.categoriePnL) {
        learnFromCorrection(pid, tx.description, updated.poste, updated.categorieTreso, updated.categoriePnL);
      }
    }
  }, [pid, transactions, updateTransaction, learnFromCorrection]);

  const handleBulkPoste = (poste: string) => {
    bulkUpdateField(pid, Array.from(selected), 'poste', poste);
    toast.success(`Updated ${selected.size} rows`);
    setSelected(new Set());
  };

  const handleBulkDelete = () => {
    deleteTransactions(pid, Array.from(selected));
    toast.success(`Deleted ${selected.size} rows`);
    setSelected(new Set());
  };

  const handleAutoCategorizeAll = () => {
    const learned = useTransactionStore.getState().getLearnedPatterns(pid);
    let count = 0;
    for (const tx of transactions) {
      if (!tx.poste || tx.poste === 'Autres charges') {
        const suggestion = autoCategorize(tx.description, tx.amount, learned);
        if (suggestion.confidence >= 60) {
          updateTransaction(pid, tx.id, {
            poste: suggestion.poste,
            categorieTreso: suggestion.categorieTreso,
            categoriePnL: suggestion.categoriePnL,
            isMapped: true,
          });
          count++;
        }
      }
    }
    toast.success(`Auto-categorized ${count} transactions`);
  };

  if (transactions.length === 0) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">Transaction Enrichment</h1>
          <p className="page-subtitle">No transactions imported yet. Upload transaction data from the Data Center.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Transaction Enrichment</h1>
        <p className="page-subtitle">Categorize and enrich raw transaction data for financial reporting</p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-xs text-muted-foreground">Total Transactions</p>
          <p className="text-lg font-bold text-foreground">{transactions.length}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-xs text-muted-foreground">Categorized</p>
          <p className="text-lg font-bold text-success">{mappedCount}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-xs text-muted-foreground">Unmapped</p>
          <p className="text-lg font-bold text-warning">{unmappedCount}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-xs text-muted-foreground">Completion</p>
          <div className="flex items-center gap-2">
            <Progress value={mappingPercent} className="h-2 flex-1" />
            <span className="text-sm font-bold text-foreground">{mappingPercent}%</span>
          </div>
        </div>
      </div>

      {/* Unmapped warning */}
      {unmappedCount > 0 && (
        <div className="flex items-center gap-2 bg-warning/10 border border-warning/30 rounded-lg px-3 py-2 mb-4 text-sm">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
          <span className="text-foreground">{unmappedCount} transaction{unmappedCount > 1 ? 's' : ''} need categorization before generating reports.</span>
          <Button size="sm" variant="outline" className="ml-auto" onClick={handleAutoCategorizeAll}>
            Auto-categorize
          </Button>
        </div>
      )}

      {/* Search + Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search transactions..." className="h-8 pl-8 text-xs" />
        </div>
        <Select value={filterPoste} onValueChange={setFilterPoste}>
          <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="All Postes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Postes</SelectItem>
            {POSTES.map(p => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="All Categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Cat. Tréso</SelectItem>
            {CATEGORIES_TRESO.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterMapped} onValueChange={(v) => setFilterMapped(v as any)}>
          <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="mapped">Mapped</SelectItem>
            <SelectItem value="unmapped">Unmapped</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 bg-accent/50 rounded-lg px-3 py-2 mb-3">
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
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={selected.size === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs">Description</TableHead>
                <TableHead className="text-xs">Amount</TableHead>
                <TableHead className="text-xs">Source</TableHead>
                <TableHead className="text-xs min-w-[160px]">Poste</TableHead>
                <TableHead className="text-xs min-w-[160px]">Cat. Tréso</TableHead>
                <TableHead className="text-xs min-w-[160px]">Cat. P&L</TableHead>
                <TableHead className="text-xs">TVA</TableHead>
                <TableHead className="text-xs">Entity</TableHead>
                <TableHead className="text-xs w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((tx) => {
                const isEditing = editingId === tx.id;
                const isMissing = !tx.poste || tx.poste === 'Autres charges';
                return (
                  <TableRow
                    key={tx.id}
                    className={isMissing ? 'bg-warning/5' : ''}
                  >
                    <TableCell>
                      <Checkbox checked={selected.has(tx.id)} onCheckedChange={() => toggleSelect(tx.id)} />
                    </TableCell>
                    <TableCell className="text-xs mono">
                      {isEditing ? (
                        <Input value={editForm.date || ''} onChange={(e) => setEditForm(f => ({ ...f, date: e.target.value }))} className="h-7 text-xs w-[100px]" />
                      ) : tx.date}
                    </TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">
                      {isEditing ? (
                        <Input value={editForm.description || ''} onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))} className="h-7 text-xs" />
                      ) : tx.description}
                    </TableCell>
                    <TableCell className={`text-xs mono font-medium ${tx.amount >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {isEditing ? (
                        <Input type="number" value={editForm.amount ?? ''} onChange={(e) => setEditForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} className="h-7 text-xs w-[100px]" />
                      ) : tx.amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {isEditing ? (
                        <Input value={editForm.sourceAccount || ''} onChange={(e) => setEditForm(f => ({ ...f, sourceAccount: e.target.value }))} className="h-7 text-xs w-[100px]" />
                      ) : tx.sourceAccount}
                    </TableCell>
                    <TableCell>
                      <ComboSelect value={tx.poste} options={POSTES} onChange={(v) => handleFieldChange(tx.id, 'poste', v)} placeholder="Select Poste" />
                    </TableCell>
                    <TableCell>
                      <ComboSelect value={tx.categorieTreso} options={CATEGORIES_TRESO} onChange={(v) => handleFieldChange(tx.id, 'categorieTreso', v)} placeholder="Cat. Tréso" />
                    </TableCell>
                    <TableCell>
                      <ComboSelect value={tx.categoriePnL} options={CATEGORIES_PNL} onChange={(v) => handleFieldChange(tx.id, 'categoriePnL', v)} placeholder="Cat. P&L" />
                    </TableCell>
                    <TableCell className="text-xs mono">
                      {isEditing ? (
                        <Input type="number" value={editForm.tva ?? ''} onChange={(e) => setEditForm(f => ({ ...f, tva: parseFloat(e.target.value) || 0 }))} className="h-7 text-xs w-[60px]" />
                      ) : tx.tva ? `${tx.tva}%` : '-'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {isEditing ? (
                        <Input value={editForm.entity || ''} onChange={(e) => setEditForm(f => ({ ...f, entity: e.target.value }))} className="h-7 text-xs w-[80px]" />
                      ) : tx.entity || '-'}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={saveEdit}>Save</Button>
                          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingId(null)}>✕</Button>
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
                  <TableCell colSpan={11} className="text-center text-sm text-muted-foreground py-8">
                    No transactions match your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
