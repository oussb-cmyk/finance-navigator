import { useState, useMemo, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CheckCircle2, AlertTriangle, XCircle, Wand2, ShieldCheck, BarChart3, Info,
} from 'lucide-react';
import type { ImportRow } from '@/lib/dataQuality';
import {
  analyzeQuality, autoFixRows, getQualityColor, getQualityBg, getRowIssueTypes,
} from '@/lib/dataQuality';
import type { DataQualityResult } from '@/lib/dataQuality';

interface ImportPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: ImportRow[];
  fileName: string;
  mode: 'template' | 'ai';
  onConfirm: (rows: ImportRow[]) => void;
}

const MAX_PREVIEW = 50;

export function ImportPreviewDialog({
  open, onOpenChange, rows: initialRows, fileName, mode, onConfirm,
}: ImportPreviewDialogProps) {
  const [rows, setRows] = useState<ImportRow[]>(initialRows);
  const [autoFixApplied, setAutoFixApplied] = useState(false);

  const quality: DataQualityResult = useMemo(() => analyzeQuality(rows), [rows]);

  const previewRows = useMemo(() => rows.slice(0, MAX_PREVIEW), [rows]);

  const handleAutoFix = useCallback(() => {
    const { fixed, fixCount } = autoFixRows(rows);
    setRows(fixed);
    setAutoFixApplied(true);
    // Toast is handled by parent or inline message
    void fixCount; // used implicitly via re-render
  }, [rows]);

  const canConfirm = mode === 'ai' || quality.level !== 'low';
  const isTemplateBlocked = mode === 'template' && quality.issues.length > 0;

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

  const QualityIcon = quality.level === 'high' ? CheckCircle2 : quality.level === 'medium' ? AlertTriangle : XCircle;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Import Preview — {fileName}
          </DialogTitle>
          <DialogDescription>
            Review your data before importing. {mode === 'template' ? 'Template mode — strict validation.' : 'AI parsing — review recommended.'}
          </DialogDescription>
        </DialogHeader>

        {/* Quality Score + Issue Summary */}
        <div className="flex flex-wrap items-center gap-3">
          <div className={`flex items-center gap-2 border rounded-lg px-3 py-2 ${getQualityBg(quality.level)}`}>
            <BarChart3 className={`h-4 w-4 ${getQualityColor(quality.level)}`} />
            <span className={`text-sm font-bold ${getQualityColor(quality.level)}`}>{quality.score}%</span>
            <span className="text-xs text-muted-foreground">Data Quality</span>
          </div>

          <Badge variant="outline" className="text-xs gap-1">
            <QualityIcon className={`h-3 w-3 ${getQualityColor(quality.level)}`} />
            {quality.cleanRows}/{quality.totalRows} clean rows
          </Badge>

          {quality.issues.length > 0 && (
            <Badge variant="outline" className="text-xs gap-1 text-warning border-warning/30">
              <AlertTriangle className="h-3 w-3" />
              {quality.issues.length} issue{quality.issues.length !== 1 ? 's' : ''} detected
            </Badge>
          )}

          {quality.level === 'high' && (
            <Badge className="bg-success/10 text-success border-success/20 text-xs gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Ready to import
            </Badge>
          )}
        </div>

        {/* Issue Detection Panel */}
        {quality.summary.length > 0 && (
          <div className="border border-border rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              {quality.issues.length} issue{quality.issues.length !== 1 ? 's' : ''} detected in your dataset
            </p>
            <div className="flex flex-wrap gap-2">
              {quality.summary.map((s) => (
                <span key={s.type} className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded-md text-muted-foreground">
                  <span className="font-medium text-foreground">{s.count}</span> {s.label}
                </span>
              ))}
            </div>

            {/* Auto-fix button (AI mode or medium quality) */}
            {mode === 'ai' && !autoFixApplied && (
              <Button variant="outline" size="sm" className="mt-1" onClick={handleAutoFix}>
                <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                Auto Fix Issues
              </Button>
            )}
            {autoFixApplied && (
              <p className="text-xs text-success flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Auto-fix applied — quality recalculated
              </p>
            )}
          </div>
        )}

        {/* Template block alert */}
        {isTemplateBlocked && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Template import blocked: fix all errors in your file and re-upload.
            </AlertDescription>
          </Alert>
        )}

        {/* Preview Table */}
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
                  const hasIssue = issueTypes.size > 0;
                  return (
                    <tr key={i} className={`border-b border-border/50 ${hasIssue ? 'bg-destructive/[0.03]' : 'hover:bg-muted/30'}`}>
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
                        {hasIssue
                          ? <AlertTriangle className="h-3.5 w-3.5 text-warning mx-auto" />
                          : <CheckCircle2 className="h-3.5 w-3.5 text-success mx-auto" />
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ScrollArea>

        {rows.length > MAX_PREVIEW && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Info className="h-3 w-3" />
            Showing first {MAX_PREVIEW} of {rows.length} rows
          </p>
        )}

        <DialogFooter className="pt-2 flex-wrap gap-2">
          <div className="text-xs text-muted-foreground flex-1">
            {quality.totalRows} rows · {quality.cleanRows} clean · {quality.issues.length} issues
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => onConfirm(rows)}
            disabled={isTemplateBlocked || rows.length === 0}
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            Confirm Import ({rows.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
