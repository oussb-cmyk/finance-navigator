import { useState, useMemo, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  CheckCircle2, AlertTriangle, XCircle, Wand2, ShieldCheck, BarChart3, Info,
  Copy, Trash2, Eye, ArrowLeft,
} from 'lucide-react';
import type { ImportRow } from '@/lib/dataQuality';
import {
  analyzeQuality, autoFixRows, getQualityColor, getQualityBg, getRowIssueTypes,
  removeDuplicates,
} from '@/lib/dataQuality';
import type { DataQualityResult, IssueType } from '@/lib/dataQuality';
import { ReviewTable } from './ReviewTable';

interface ImportPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: ImportRow[];
  fileName: string;
  mode: 'template' | 'ai';
  onConfirm: (rows: ImportRow[], meta: { qualityScore: number; issuesDetected: number; issuesFixed: number }) => void;
}

const MAX_PREVIEW = 50;

const ISSUE_TOOLTIPS: Record<IssueType, string> = {
  invalid_date: 'This date could not be parsed — check format',
  suspicious_date: 'Year looks unusual (before 1990 or after 2060)',
  missing_account: 'Account code is missing or unknown',
  non_numeric_amount: 'Amount contains non-numeric characters',
  zero_amounts: 'Both debit and credit are zero',
  duplicate: 'This row appears to be a duplicate',
  imbalance: 'Total debits and credits do not balance',
};

const ISSUE_IMPACT: Record<IssueType, string> = {
  invalid_date: 'Reporting periods may be incorrect',
  suspicious_date: 'Financial statements may reference wrong periods',
  missing_account: 'Transactions may not be classified correctly',
  non_numeric_amount: 'Amounts may be recorded as zero or incorrect',
  zero_amounts: 'Entry may be incomplete or invalid',
  duplicate: 'May overstate revenue or expenses',
  imbalance: 'Trial balance will not reconcile',
};

export function ImportPreviewDialog({
  open, onOpenChange, rows: initialRows, fileName, mode, onConfirm,
}: ImportPreviewDialogProps) {
  const [rows, setRows] = useState<ImportRow[]>(initialRows);
  const [autoFixApplied, setAutoFixApplied] = useState(false);
  const [strictMode, setStrictMode] = useState(false);
  const [showConfirmWarning, setShowConfirmWarning] = useState(false);
  const [totalFixCount, setTotalFixCount] = useState(0);
  const [viewMode, setViewMode] = useState<'preview' | 'review'>('preview');

  const quality: DataQualityResult = useMemo(() => analyzeQuality(rows), [rows]);
  const initialQuality: DataQualityResult = useMemo(() => analyzeQuality(initialRows), [initialRows]);

  const previewRows = useMemo(() => rows.slice(0, MAX_PREVIEW), [rows]);

  const duplicateCount = useMemo(
    () => quality.summary.find(s => s.type === 'duplicate')?.count ?? 0,
    [quality.summary],
  );

  const handleAutoFix = useCallback(() => {
    const { fixed, fixCount } = autoFixRows(rows);
    setRows(fixed);
    setAutoFixApplied(true);
    setTotalFixCount(prev => prev + fixCount);
  }, [rows]);

  const handleRemoveDuplicates = useCallback(() => {
    const { deduped, removedCount } = removeDuplicates(rows);
    setRows(deduped);
    setTotalFixCount(prev => prev + removedCount);
  }, [rows]);

  const handleReviewRowsChange = useCallback((updatedRows: ImportRow[]) => {
    setRows(updatedRows);
    setTotalFixCount(prev => prev + 1);
  }, []);

  const issueCount = quality.issues.length;
  const hasIssues = issueCount > 0;
  const isBlocked = strictMode && hasIssues;
  const issueLevel: 'none' | 'warn' | 'critical' = issueCount === 0 ? 'none' : issueCount <= 10 ? 'warn' : 'critical';
  const issueBorderColor = issueLevel === 'critical' ? 'border-destructive/40' : 'border-warning/40';
  const issueBgColor = issueLevel === 'critical' ? 'bg-destructive/10' : 'bg-warning/10';
  const issueTextColor = issueLevel === 'critical' ? 'text-destructive' : 'text-warning';

  const handleImportClick = useCallback(() => {
    if (hasIssues) {
      setShowConfirmWarning(true);
    } else {
      onConfirm(rows, {
        qualityScore: quality.score,
        issuesDetected: initialQuality.issues.length,
        issuesFixed: totalFixCount,
      });
    }
  }, [hasIssues, rows, quality.score, initialQuality.issues.length, totalFixCount, onConfirm]);

  const handleConfirmWithIssues = useCallback(() => {
    setShowConfirmWarning(false);
    onConfirm(rows, {
      qualityScore: quality.score,
      issuesDetected: initialQuality.issues.length,
      issuesFixed: totalFixCount,
    });
  }, [rows, quality.score, initialQuality.issues.length, totalFixCount, onConfirm]);

  const getRowTooltip = (rowIdx: number): string | null => {
    const types = getRowIssueTypes(rowIdx, quality.issues);
    if (types.size === 0) return null;
    return Array.from(types).map(t => ISSUE_TOOLTIPS[t]).join('\n');
  };

  const getCellClass = (rowIdx: number, field: 'date' | 'account' | 'amount'): string => {
    const issueTypes = getRowIssueTypes(rowIdx, quality.issues);
    if (field === 'date' && (issueTypes.has('invalid_date') || issueTypes.has('suspicious_date'))) {
      return 'bg-destructive/10 text-destructive';
    }
    if (field === 'account' && issueTypes.has('missing_account')) {
      return 'bg-warning/10 text-warning';
    }
    if (field === 'amount' && (issueTypes.has('non_numeric_amount') || issueTypes.has('zero_amounts'))) {
      return 'bg-destructive/10 text-destructive';
    }
    return '';
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewMode === 'review' && (
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 mr-1" onClick={() => setViewMode('preview')}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <ShieldCheck className="h-5 w-5 text-primary" />
              {viewMode === 'preview' ? `Import Preview — ${fileName}` : `Review & Fix — ${fileName}`}
            </DialogTitle>
            <DialogDescription>
              {viewMode === 'preview'
                ? (mode === 'template'
                    ? 'Template import — assisted validation enabled.'
                    : 'AI parsing — review recommended.')
                : 'Fix issues inline — changes are validated in real time.'}
            </DialogDescription>
          </DialogHeader>

          {/* Quality Score + Issue Status — always visible */}
          <div className="flex flex-wrap items-center gap-3">
            {hasIssues ? (
              <div className={`flex items-center gap-2 border rounded-lg px-3 py-2 ${issueBgColor} ${issueBorderColor}`}>
                <AlertTriangle className={`h-4 w-4 ${issueTextColor}`} />
                <span className={`text-sm font-bold ${issueTextColor}`}>{issueCount} issue{issueCount !== 1 ? 's' : ''}</span>
                <span className={`text-xs font-medium ${issueTextColor}`}>— action needed</span>
              </div>
            ) : (
              <div className={`flex items-center gap-2 border rounded-lg px-3 py-2 ${getQualityBg(quality.level)}`}>
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span className="text-sm font-bold text-success">No issues</span>
                <span className="text-xs text-success/80">Ready to import</span>
              </div>
            )}

            <Badge variant="outline" className="text-xs gap-1">
              <BarChart3 className={`h-3 w-3 ${getQualityColor(quality.level)}`} />
              {quality.score}% quality · {quality.cleanRows}/{quality.totalRows} clean
            </Badge>

            {viewMode === 'preview' && (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Strict mode</span>
                <Switch checked={strictMode} onCheckedChange={setStrictMode} />
              </div>
            )}
          </div>

          {/* ─── PREVIEW MODE ─── */}
          {viewMode === 'preview' && (
            <>
              {/* Issue Summary Panel */}
              {hasIssues && (
                <div className={`border ${issueBorderColor} ${issueBgColor} rounded-lg p-3 space-y-3`}>
                  <p className={`text-sm font-bold ${issueTextColor} flex items-center gap-2`}>
                    <AlertTriangle className="h-4 w-4" />
                    {issueCount} issue{issueCount !== 1 ? 's' : ''} detected — these may affect financial accuracy
                  </p>

                  <div className="space-y-1.5">
                    {quality.summary.map((s) => (
                      <div key={s.type} className="flex flex-col gap-0.5 bg-muted/50 rounded-md px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground">{s.count}</span>
                          <span className="text-xs text-muted-foreground">{s.label}</span>
                        </div>
                        <span className="text-xs text-muted-foreground/80 italic pl-4">
                          ⚠ {ISSUE_IMPACT[s.type]}
                        </span>
                      </div>
                    ))}
                  </div>

                  {duplicateCount > 0 && (
                    <div className="flex items-center gap-2 bg-muted/50 rounded-md px-3 py-2">
                      <Copy className="h-3.5 w-3.5 text-warning" />
                      <span className="text-xs text-foreground font-medium">{duplicateCount} duplicate entries</span>
                      <div className="ml-auto flex gap-1.5">
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleRemoveDuplicates}>
                          <Trash2 className="h-3 w-3 mr-1" />
                          Remove duplicates
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setViewMode('review')}>
                      <Eye className="h-3.5 w-3.5 mr-1.5" />
                      Review & Fix
                    </Button>
                    {!autoFixApplied && (
                      <Button variant="outline" size="sm" onClick={handleAutoFix}>
                        <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                        Fix Automatically
                      </Button>
                    )}
                    {!strictMode && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground text-xs"
                        onClick={handleImportClick}
                        disabled={rows.length === 0}
                      >
                        Import Anyway
                      </Button>
                    )}
                  </div>

                  {autoFixApplied && (
                    <p className="text-xs text-success flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Auto-fix applied — quality recalculated
                    </p>
                  )}
                </div>
              )}

              {isBlocked && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Strict mode is ON — resolve all issues before importing, or turn off strict mode.
                  </AlertDescription>
                </Alert>
              )}

              {/* Preview Table */}
              <TooltipProvider delayDuration={200}>
                <ScrollArea className="flex-1 min-h-0 max-h-[380px] border border-border rounded-lg">
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
                          <th className="px-2 py-2 text-center font-medium border-b border-border w-16">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((r, i) => {
                          const issueTypes = getRowIssueTypes(i, quality.issues);
                          const hasRowIssue = issueTypes.size > 0;
                          const tooltip = getRowTooltip(i);

                          const rowContent = (
                            <tr key={i} className={`border-b border-border/50 ${hasRowIssue ? 'bg-destructive/[0.03]' : 'hover:bg-muted/30'}`}>
                              <td className="px-2 py-1.5 text-muted-foreground mono">{i + 1}</td>
                              <td className={`px-2 py-1.5 mono whitespace-nowrap ${getCellClass(i, 'date')}`}>{r.date}</td>
                              <td className={`px-2 py-1.5 mono font-medium ${getCellClass(i, 'account')}`}>{r.accountCode || '—'}</td>
                              <td className="px-2 py-1.5 truncate max-w-[140px]">{r.accountName}</td>
                              <td className="px-2 py-1.5 truncate max-w-[180px] text-muted-foreground">{r.description}</td>
                              <td className={`px-2 py-1.5 text-right mono ${getCellClass(i, 'amount')}`}>
                                {r.debit > 0 ? r.debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}
                              </td>
                              <td className={`px-2 py-1.5 text-right mono ${getCellClass(i, 'amount')}`}>
                                {r.credit > 0 ? r.credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                {hasRowIssue
                                  ? <AlertTriangle className="h-3.5 w-3.5 text-warning mx-auto" />
                                  : <CheckCircle2 className="h-3.5 w-3.5 text-success mx-auto" />
                                }
                              </td>
                            </tr>
                          );

                          if (tooltip) {
                            return (
                              <Tooltip key={i}>
                                <TooltipTrigger asChild>{rowContent}</TooltipTrigger>
                                <TooltipContent side="left" className="max-w-[240px] whitespace-pre-line text-xs">
                                  {tooltip}
                                </TooltipContent>
                              </Tooltip>
                            );
                          }
                          return rowContent;
                        })}
                      </tbody>
                    </table>
                  </div>
                </ScrollArea>
              </TooltipProvider>

              {rows.length > MAX_PREVIEW && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Showing first {MAX_PREVIEW} of {rows.length} rows
                </p>
              )}
            </>
          )}

          {/* ─── REVIEW MODE ─── */}
          {viewMode === 'review' && (
            <ReviewTable
              rows={rows}
              onRowsChange={handleReviewRowsChange}
              issues={quality.issues}
            />
          )}

          <DialogFooter className="pt-2 flex-wrap gap-2">
            <div className="text-xs text-muted-foreground flex-1">
              {quality.totalRows} rows · {quality.cleanRows} clean · {quality.issues.length} issues
            </div>
            {viewMode === 'review' && hasIssues && (
              <>
                {!autoFixApplied && (
                  <Button variant="outline" size="sm" onClick={handleAutoFix}>
                    <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                    Fix All Automatically
                  </Button>
                )}
              </>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              onClick={handleImportClick}
              disabled={isBlocked || rows.length === 0}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              Confirm Import ({rows.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Final Confirmation Warning */}
      <AlertDialog open={showConfirmWarning} onOpenChange={setShowConfirmWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Import with unresolved issues?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span className="block">
                You are about to import data with <strong className="text-foreground">{issueCount} issue{issueCount !== 1 ? 's' : ''}</strong>. These may affect financial accuracy.
              </span>
              <span className="block text-xs space-y-1">
                {quality.summary.map((s) => (
                  <span key={s.type} className="flex items-start gap-1.5">
                    <AlertTriangle className="h-3 w-3 text-warning mt-0.5 shrink-0" />
                    <span><strong>{s.count} {s.label}</strong> — {ISSUE_IMPACT[s.type]}</span>
                  </span>
                ))}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmWithIssues} className="bg-warning text-warning-foreground hover:bg-warning/90">
              Import Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
