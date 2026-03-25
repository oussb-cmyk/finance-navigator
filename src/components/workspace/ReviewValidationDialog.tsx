import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Pencil,
  Check,
  X,
  Shield,
  Brain,
} from 'lucide-react';
import type { ScoredRow } from '@/lib/confidenceScoring';
import {
  getConfidenceColor,
  getConfidenceBgColor,
  getConfidenceLabel,
} from '@/lib/confidenceScoring';
import type { CorrectionRecord } from '@/store/useLearningStore';

interface ReviewValidationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scoredRows: ScoredRow[];
  fileName: string;
  onConfirm: (
    acceptedRows: ScoredRow[],
    corrections: CorrectionRecord[],
  ) => void;
}

export function ReviewValidationDialog({
  open,
  onOpenChange,
  scoredRows,
  fileName,
  onConfirm,
}: ReviewValidationDialogProps) {
  const [rows, setRows] = useState<ScoredRow[]>(() => scoredRows);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    date: '',
    accountCode: '',
    accountName: '',
    description: '',
    debit: '',
    credit: '',
  });

  const corrections: CorrectionRecord[] = useMemo(() => {
    return rows
      .filter(r => r.isEdited)
      .map(r => {
        const orig = scoredRows.find(o => o.rowIndex === r.rowIndex);
        return {
          original: {
            date: orig?.date,
            accountCode: orig?.accountCode,
            accountName: orig?.accountName,
            description: orig?.description,
            debit: orig?.debit,
            credit: orig?.credit,
          },
          corrected: {
            date: r.date,
            accountCode: r.accountCode,
            accountName: r.accountName,
            description: r.description,
            debit: r.debit,
            credit: r.credit,
          },
          timestamp: Date.now(),
        };
      });
  }, [rows, scoredRows]);

  const highRows = useMemo(() => rows.filter(r => r.confidence.level === 'high'), [rows]);
  const mediumRows = useMemo(() => rows.filter(r => r.confidence.level === 'medium'), [rows]);
  const lowRows = useMemo(() => rows.filter(r => r.confidence.level === 'low'), [rows]);

  const validatedCount = useMemo(() => rows.filter(r => r.isValidated || r.confidence.level === 'high').length, [rows]);

  const startEdit = (idx: number) => {
    const r = rows[idx];
    setEditingIdx(idx);
    setEditForm({
      date: r.date,
      accountCode: r.accountCode,
      accountName: r.accountName,
      description: r.description,
      debit: String(r.debit || ''),
      credit: String(r.credit || ''),
    });
  };

  const saveEdit = () => {
    if (editingIdx === null) return;
    setRows(prev => prev.map((r, i) => {
      if (i !== editingIdx) return r;
      return {
        ...r,
        date: editForm.date,
        accountCode: editForm.accountCode,
        accountName: editForm.accountName,
        description: editForm.description,
        debit: parseFloat(editForm.debit) || 0,
        credit: parseFloat(editForm.credit) || 0,
        isEdited: true,
        isValidated: true,
        confidence: { ...r.confidence, level: 'high' as const, score: 100, reasons: ['Manually corrected'] },
      };
    }));
    setEditingIdx(null);
  };

  const toggleValidation = (idx: number) => {
    setRows(prev => prev.map((r, i) =>
      i === idx ? { ...r, isValidated: !r.isValidated } : r
    ));
  };

  const removeRow = (idx: number) => {
    setRows(prev => prev.filter((_, i) => i !== idx));
  };

  const handleConfirm = () => {
    const accepted = rows.filter(r => r.isValidated || r.confidence.level === 'high');
    onConfirm(accepted, corrections);
  };

  const renderRow = (r: ScoredRow, idx: number) => {
    const globalIdx = rows.indexOf(r);
    const isEditing = editingIdx === globalIdx;
    const confColor = getConfidenceColor(r.confidence.level);
    const confBg = getConfidenceBgColor(r.confidence.level);

    if (isEditing) {
      return (
        <tr key={r.rowIndex} className="bg-primary/5 border-b border-border/50">
          <td className="px-2 py-1.5">
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={saveEdit}>
                <Check className="h-3 w-3 text-success" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditingIdx(null)}>
                <X className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          </td>
          <td className="px-2 py-1">
            <Input value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
              className="h-7 text-xs w-24" />
          </td>
          <td className="px-2 py-1">
            <Input value={editForm.accountCode} onChange={e => setEditForm(f => ({ ...f, accountCode: e.target.value }))}
              className="h-7 text-xs w-20" />
          </td>
          <td className="px-2 py-1">
            <Input value={editForm.accountName} onChange={e => setEditForm(f => ({ ...f, accountName: e.target.value }))}
              className="h-7 text-xs w-32" />
          </td>
          <td className="px-2 py-1">
            <Input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
              className="h-7 text-xs w-36" />
          </td>
          <td className="px-2 py-1">
            <Input value={editForm.debit} onChange={e => setEditForm(f => ({ ...f, debit: e.target.value }))}
              className="h-7 text-xs w-20 text-right" type="number" />
          </td>
          <td className="px-2 py-1">
            <Input value={editForm.credit} onChange={e => setEditForm(f => ({ ...f, credit: e.target.value }))}
              className="h-7 text-xs w-20 text-right" type="number" />
          </td>
          <td />
        </tr>
      );
    }

    return (
      <tr key={r.rowIndex} className={`border-b border-border/50 hover:bg-muted/30 ${confBg}`}>
        <td className="px-2 py-1">
          <div className="flex gap-0.5">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleValidation(globalIdx)}>
              {r.isValidated
                ? <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                : <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground" />
              }
            </Button>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => startEdit(globalIdx)}>
              <Pencil className="h-3 w-3 text-muted-foreground" />
            </Button>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeRow(globalIdx)}>
              <X className="h-3 w-3 text-destructive/70" />
            </Button>
          </div>
        </td>
        <td className="px-2 py-1 whitespace-nowrap mono text-xs text-muted-foreground">{r.date}</td>
        <td className="px-2 py-1 whitespace-nowrap mono text-xs font-medium">{r.accountCode}</td>
        <td className="px-2 py-1 text-xs truncate max-w-[140px]">{r.accountName}</td>
        <td className="px-2 py-1 text-xs truncate max-w-[160px] text-muted-foreground">{r.description}</td>
        <td className="px-2 py-1 text-right mono text-xs">
          {r.debit > 0 ? r.debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}
        </td>
        <td className="px-2 py-1 text-right mono text-xs">
          {r.credit > 0 ? r.credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}
        </td>
        <td className="px-2 py-1 text-center">
          <span className={`text-[10px] font-medium ${confColor}`} title={r.confidence.reasons.join(', ')}>
            {r.confidence.score}%
          </span>
        </td>
      </tr>
    );
  };

  const renderTable = (subset: ScoredRow[]) => (
    <ScrollArea className="max-h-[350px] border border-border rounded-lg">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 sticky top-0 z-10">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium border-b border-border w-20">Actions</th>
              <th className="px-2 py-1.5 text-left font-medium border-b border-border">Date</th>
              <th className="px-2 py-1.5 text-left font-medium border-b border-border">Account</th>
              <th className="px-2 py-1.5 text-left font-medium border-b border-border">Name</th>
              <th className="px-2 py-1.5 text-left font-medium border-b border-border">Description</th>
              <th className="px-2 py-1.5 text-right font-medium border-b border-border">Debit</th>
              <th className="px-2 py-1.5 text-right font-medium border-b border-border">Credit</th>
              <th className="px-2 py-1.5 text-center font-medium border-b border-border w-12">Score</th>
            </tr>
          </thead>
          <tbody>
            {subset.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No rows in this category</td></tr>
            ) : (
              subset.map((r, i) => renderRow(r, i))
            )}
          </tbody>
        </table>
      </div>
    </ScrollArea>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Review & Validate — {fileName}
          </DialogTitle>
          <DialogDescription>
            Rows are scored by confidence. Edit or validate items below before importing.
          </DialogDescription>
        </DialogHeader>

        {/* Summary stats */}
        <div className="flex items-center gap-3 flex-wrap">
          <Badge className="bg-success/10 text-success border-success/20 text-xs">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {highRows.length} auto-validated
          </Badge>
          <Badge className="bg-warning/10 text-warning border-warning/20 text-xs">
            <AlertTriangle className="h-3 w-3 mr-1" />
            {mediumRows.length} need review
          </Badge>
          <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-xs">
            <XCircle className="h-3 w-3 mr-1" />
            {lowRows.length} rejected
          </Badge>
          {corrections.length > 0 && (
            <Badge variant="outline" className="text-xs">
              <Brain className="h-3 w-3 mr-1" />
              {corrections.length} corrections to learn
            </Badge>
          )}
        </div>

        <Tabs defaultValue="review" className="flex-1 min-h-0 flex flex-col">
          <TabsList className="w-fit">
            <TabsTrigger value="review">
              Needs Review ({mediumRows.length})
            </TabsTrigger>
            <TabsTrigger value="validated">
              Auto-Validated ({highRows.length})
            </TabsTrigger>
            <TabsTrigger value="rejected">
              Rejected ({lowRows.length})
            </TabsTrigger>
            <TabsTrigger value="all">
              All ({rows.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="review" className="flex-1 min-h-0">
            {renderTable(mediumRows)}
          </TabsContent>
          <TabsContent value="validated" className="flex-1 min-h-0">
            {renderTable(highRows)}
          </TabsContent>
          <TabsContent value="rejected" className="flex-1 min-h-0">
            {renderTable(lowRows)}
          </TabsContent>
          <TabsContent value="all" className="flex-1 min-h-0">
            {renderTable(rows)}
          </TabsContent>
        </Tabs>

        <DialogFooter className="pt-2 flex-wrap gap-2">
          <div className="text-xs text-muted-foreground">
            {validatedCount} of {rows.length} rows will be imported
          </div>
          <div className="flex-1" />
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={validatedCount === 0}>
            Confirm & Import ({validatedCount})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
