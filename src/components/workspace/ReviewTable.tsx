import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertTriangle, CheckCircle2, ChevronUp, ChevronDown, Pencil, Check, X,
} from 'lucide-react';
import type { ImportRow, RowIssue, IssueType } from '@/lib/dataQuality';
import { analyzeQuality, getRowIssueTypes } from '@/lib/dataQuality';

const ISSUE_LABELS: Record<IssueType, string> = {
  invalid_date: 'Invalid date',
  suspicious_date: 'Suspicious date',
  missing_account: 'Missing account',
  non_numeric_amount: 'Invalid amount',
  zero_amounts: 'Zero amounts',
  duplicate: 'Duplicate',
  imbalance: 'Imbalance',
};

const ISSUE_VARIANT_CLASS: Record<IssueType, string> = {
  invalid_date: 'bg-destructive/15 text-destructive border-destructive/30',
  suspicious_date: 'bg-warning/15 text-warning border-warning/30',
  missing_account: 'bg-warning/15 text-warning border-warning/30',
  non_numeric_amount: 'bg-destructive/15 text-destructive border-destructive/30',
  zero_amounts: 'bg-warning/15 text-warning border-warning/30',
  duplicate: 'bg-info/15 text-info border-info/30',
  imbalance: 'bg-destructive/15 text-destructive border-destructive/30',
};

interface ReviewTableProps {
  rows: ImportRow[];
  onRowsChange: (rows: ImportRow[]) => void;
  issues: RowIssue[];
}

export function ReviewTable({ rows, onRowsChange, issues }: ReviewTableProps) {
  const [showOnlyIssues, setShowOnlyIssues] = useState(true);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<ImportRow | null>(null);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  // Indices of rows with issues
  const issueRowIndices = useMemo(() => {
    const set = new Set<number>();
    for (const iss of issues) {
      if (iss.rowIndex >= 0) set.add(iss.rowIndex);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [issues]);

  const issueCount = issueRowIndices.length;

  // Displayed rows
  const displayedRows = useMemo(() => {
    if (!showOnlyIssues) return rows.map((r, i) => ({ row: r, originalIdx: i }));
    return issueRowIndices.map(i => ({ row: rows[i], originalIdx: i }));
  }, [rows, showOnlyIssues, issueRowIndices]);

  // Navigation
  const [currentIssuePos, setCurrentIssuePos] = useState(0);

  const navigateToIssue = useCallback((direction: 'next' | 'prev') => {
    if (issueRowIndices.length === 0) return;
    let pos = currentIssuePos;
    if (direction === 'next') {
      pos = (pos + 1) % issueRowIndices.length;
    } else {
      pos = (pos - 1 + issueRowIndices.length) % issueRowIndices.length;
    }
    setCurrentIssuePos(pos);
    const targetIdx = issueRowIndices[pos];
    const el = rowRefs.current.get(targetIdx);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [issueRowIndices, currentIssuePos]);

  // Editing
  const startEdit = useCallback((idx: number, row: ImportRow) => {
    setEditingIdx(idx);
    setEditForm({ ...row });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingIdx(null);
    setEditForm(null);
  }, []);

  const saveEdit = useCallback(() => {
    if (editingIdx === null || !editForm) return;
    const updated = [...rows];
    updated[editingIdx] = {
      ...editForm,
      debit: typeof editForm.debit === 'string' ? parseFloat(editForm.debit as any) || 0 : editForm.debit,
      credit: typeof editForm.credit === 'string' ? parseFloat(editForm.credit as any) || 0 : editForm.credit,
    };
    onRowsChange(updated);
    setEditingIdx(null);
    setEditForm(null);
  }, [editingIdx, editForm, rows, onRowsChange]);

  // Handle enter/escape in edit mode
  const handleEditKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') cancelEdit();
  }, [saveEdit, cancelEdit]);

  const getCellHighlight = (rowIdx: number, field: 'date' | 'account' | 'amount'): string => {
    const types = getRowIssueTypes(rowIdx, issues);
    if (field === 'date' && (types.has('invalid_date') || types.has('suspicious_date')))
      return 'bg-destructive/10';
    if (field === 'account' && types.has('missing_account'))
      return 'bg-warning/10';
    if (field === 'amount' && (types.has('non_numeric_amount') || types.has('zero_amounts')))
      return 'bg-destructive/10';
    return '';
  };

  return (
    <div className="space-y-3">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Badge
            variant={issueCount > 0 ? 'destructive' : 'default'}
            className="text-xs font-bold"
          >
            {issueCount} issue{issueCount !== 1 ? 's' : ''} remaining
          </Badge>
          {issueCount > 0 && (
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => navigateToIssue('prev')}>
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground min-w-[60px] text-center">
                {issueRowIndices.length > 0 ? `${currentIssuePos + 1} / ${issueRowIndices.length}` : '—'}
              </span>
              <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => navigateToIssue('next')}>
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Show only issues</span>
          <Switch checked={showOnlyIssues} onCheckedChange={setShowOnlyIssues} />
        </div>
      </div>

      {/* Table */}
      <TooltipProvider delayDuration={200}>
        <ScrollArea className="max-h-[400px] border border-border rounded-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0 z-10">
                <tr>
                  <th className="px-2 py-2 text-left font-medium border-b border-border w-10">#</th>
                  <th className="px-2 py-2 text-left font-medium border-b border-border">Date</th>
                  <th className="px-2 py-2 text-left font-medium border-b border-border">Account</th>
                  <th className="px-2 py-2 text-left font-medium border-b border-border">Name</th>
                  <th className="px-2 py-2 text-left font-medium border-b border-border">Description</th>
                  <th className="px-2 py-2 text-right font-medium border-b border-border">Debit</th>
                  <th className="px-2 py-2 text-right font-medium border-b border-border">Credit</th>
                  <th className="px-2 py-2 text-center font-medium border-b border-border w-24">Issues</th>
                  <th className="px-2 py-2 text-center font-medium border-b border-border w-16">Edit</th>
                </tr>
              </thead>
              <tbody>
                {displayedRows.map(({ row, originalIdx }) => {
                  const rowIssueTypes = getRowIssueTypes(originalIdx, issues);
                  const hasIssue = rowIssueTypes.size > 0;
                  const isEditing = editingIdx === originalIdx;

                  return (
                    <tr
                      key={originalIdx}
                      ref={(el) => {
                        if (el) rowRefs.current.set(originalIdx, el);
                        else rowRefs.current.delete(originalIdx);
                      }}
                      className={`border-b border-border/50 transition-colors ${
                        hasIssue
                          ? 'bg-destructive/[0.04] hover:bg-destructive/[0.08]'
                          : 'hover:bg-muted/30'
                      }`}
                    >
                      <td className="px-2 py-1.5 text-muted-foreground mono">{originalIdx + 1}</td>

                      {/* Date */}
                      <td className={`px-2 py-1.5 mono whitespace-nowrap ${getCellHighlight(originalIdx, 'date')}`}>
                        {isEditing ? (
                          <Input
                            className="h-7 text-xs w-28"
                            value={editForm?.date ?? ''}
                            onChange={(e) => setEditForm(f => f ? { ...f, date: e.target.value } : f)}
                            onKeyDown={handleEditKey}
                            autoFocus
                          />
                        ) : row.date}
                      </td>

                      {/* Account */}
                      <td className={`px-2 py-1.5 mono ${getCellHighlight(originalIdx, 'account')}`}>
                        {isEditing ? (
                          <Input
                            className="h-7 text-xs w-24"
                            value={editForm?.accountCode ?? ''}
                            onChange={(e) => setEditForm(f => f ? { ...f, accountCode: e.target.value } : f)}
                            onKeyDown={handleEditKey}
                          />
                        ) : (row.accountCode || '—')}
                      </td>

                      {/* Name */}
                      <td className="px-2 py-1.5 truncate max-w-[120px]">
                        {isEditing ? (
                          <Input
                            className="h-7 text-xs w-28"
                            value={editForm?.accountName ?? ''}
                            onChange={(e) => setEditForm(f => f ? { ...f, accountName: e.target.value } : f)}
                            onKeyDown={handleEditKey}
                          />
                        ) : row.accountName}
                      </td>

                      {/* Description */}
                      <td className="px-2 py-1.5 truncate max-w-[160px] text-muted-foreground">
                        {isEditing ? (
                          <Input
                            className="h-7 text-xs w-36"
                            value={editForm?.description ?? ''}
                            onChange={(e) => setEditForm(f => f ? { ...f, description: e.target.value } : f)}
                            onKeyDown={handleEditKey}
                          />
                        ) : row.description}
                      </td>

                      {/* Debit */}
                      <td className={`px-2 py-1.5 text-right mono ${getCellHighlight(originalIdx, 'amount')}`}>
                        {isEditing ? (
                          <Input
                            type="number"
                            step="0.01"
                            className="h-7 text-xs w-24 text-right"
                            value={editForm?.debit ?? 0}
                            onChange={(e) => setEditForm(f => f ? { ...f, debit: parseFloat(e.target.value) || 0 } : f)}
                            onKeyDown={handleEditKey}
                          />
                        ) : (row.debit > 0 ? row.debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '')}
                      </td>

                      {/* Credit */}
                      <td className={`px-2 py-1.5 text-right mono ${getCellHighlight(originalIdx, 'amount')}`}>
                        {isEditing ? (
                          <Input
                            type="number"
                            step="0.01"
                            className="h-7 text-xs w-24 text-right"
                            value={editForm?.credit ?? 0}
                            onChange={(e) => setEditForm(f => f ? { ...f, credit: parseFloat(e.target.value) || 0 } : f)}
                            onKeyDown={handleEditKey}
                          />
                        ) : (row.credit > 0 ? row.credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '')}
                      </td>

                      {/* Issue badges */}
                      <td className="px-2 py-1.5">
                        <div className="flex flex-wrap gap-1 justify-center">
                          {Array.from(rowIssueTypes).map(type => (
                            <Tooltip key={type}>
                              <TooltipTrigger asChild>
                                <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${ISSUE_VARIANT_CLASS[type]}`}>
                                  {ISSUE_LABELS[type]}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="text-xs max-w-[200px]">
                                {ISSUE_LABELS[type]}
                              </TooltipContent>
                            </Tooltip>
                          ))}
                          {!hasIssue && <CheckCircle2 className="h-3.5 w-3.5 text-success mx-auto" />}
                        </div>
                      </td>

                      {/* Edit actions */}
                      <td className="px-2 py-1.5 text-center">
                        {isEditing ? (
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-success" onClick={saveEdit}>
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground" onClick={cancelEdit}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                            onClick={() => startEdit(originalIdx, row)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {displayedRows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                      {showOnlyIssues ? 'No issues found — all rows are clean!' : 'No rows to display.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </ScrollArea>
      </TooltipProvider>
    </div>
  );
}
