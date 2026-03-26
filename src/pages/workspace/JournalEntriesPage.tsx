import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useProjectStore } from '@/store/useProjectStore';
import { useProjectEntries } from '@/hooks/useStableStoreSelectors';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, CheckCircle, Shield } from 'lucide-react';
import type { JournalEntry } from '@/types/finance';

export default function JournalEntriesPage() {
  const { projectId } = useParams();
  const pid = projectId || '';
  const entries = useProjectEntries(pid);
  const { addEntry, deleteEntry, toggleEntryValidation, validateAllEntries } = useProjectStore();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: '', reference: '', description: '', accountCode: '', accountName: '', debit: '', credit: '' });

  const validated = entries.filter(e => e.isValidated).length;
  const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0);

  const handleAdd = () => {
    if (!projectId || !form.date || !form.description) return;
    const entry: JournalEntry = {
      id: `e-${Date.now()}`,
      date: form.date,
      reference: form.reference || `JE-${entries.length + 1}`,
      description: form.description,
      accountCode: form.accountCode,
      accountName: form.accountName,
      debit: parseFloat(form.debit) || 0,
      credit: parseFloat(form.credit) || 0,
      isValidated: false,
      source: 'Manual Entry',
      journalType: 'general',
    };
    addEntry(projectId, entry);
    setForm({ date: '', reference: '', description: '', accountCode: '', accountName: '', debit: '', credit: '' });
    setShowForm(false);
  };

  return (
    <div>
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">Journal Entries</h1>
          <p className="page-subtitle">{entries.length} entries · {validated} validated · Balance: ${(totalDebit - totalCredit).toLocaleString()}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => projectId && validateAllEntries(projectId)}>
            <Shield className="h-3 w-3 mr-1" />Validate All
          </Button>
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-3 w-3 mr-1" />Add Entry
          </Button>
        </div>
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-xl p-4 mb-6 grid grid-cols-7 gap-3">
          <Input placeholder="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <Input placeholder="Reference" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          <Input placeholder="Description" className="col-span-2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Input placeholder="Account Code" value={form.accountCode} onChange={(e) => setForm({ ...form, accountCode: e.target.value })} />
          <Input placeholder="Debit" type="number" value={form.debit} onChange={(e) => setForm({ ...form, debit: e.target.value })} />
          <div className="flex gap-2">
            <Input placeholder="Credit" type="number" value={form.credit} onChange={(e) => setForm({ ...form, credit: e.target.value })} />
            <Button onClick={handleAdd} size="sm">Add</Button>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-8">✓</th>
              <th>Date</th>
              <th>Ref</th>
              <th>Description</th>
              <th>Account</th>
              <th className="text-right">Debit</th>
              <th className="text-right">Credit</th>
              <th>Source</th>
              <th>Status</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td>
                  <Checkbox checked={e.isValidated} onCheckedChange={() => projectId && toggleEntryValidation(projectId, e.id)} />
                </td>
                <td className="text-xs mono">{e.date}</td>
                <td className="text-xs mono text-muted-foreground">{e.reference}</td>
                <td className="text-sm">{e.description}</td>
                <td>
                  <span className="mono text-xs">{e.accountCode}</span>
                  <span className="text-xs text-muted-foreground ml-1">{e.accountName}</span>
                </td>
                <td className="text-right mono text-sm">{e.debit > 0 ? `$${e.debit.toLocaleString()}` : ''}</td>
                <td className="text-right mono text-sm">{e.credit > 0 ? `$${e.credit.toLocaleString()}` : ''}</td>
                <td className="text-xs text-muted-foreground truncate max-w-[120px]">{e.source}</td>
                <td><StatusBadge status={e.isValidated ? 'validated' : 'draft'} /></td>
                <td>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => projectId && deleteEntry(projectId, e.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/30 font-semibold">
              <td colSpan={5} className="px-4 py-3 text-sm">Totals</td>
              <td className="px-4 py-3 text-right mono text-sm">${totalDebit.toLocaleString()}</td>
              <td className="px-4 py-3 text-right mono text-sm">${totalCredit.toLocaleString()}</td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
