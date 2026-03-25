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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertCircle, Columns } from 'lucide-react';
import type { PreviewData, ColumnMapping, ColumnRole } from '@/lib/fileParser';
import { COLUMN_ROLE_LABELS } from '@/lib/fileParser';

interface ColumnMappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: PreviewData;
  onConfirm: (mapping: ColumnMapping) => void;
}

const SKIP_VALUE = '__skip__';

const REQUIRED_ROLES: ColumnRole[] = ['date', 'account_code'];
const FINANCIAL_ROLES: ColumnRole[] = ['debit', 'credit', 'amount'];
const OPTIONAL_ROLES: ColumnRole[] = ['account_name', 'description', 'reference'];
const ALL_ROLES: ColumnRole[] = [...REQUIRED_ROLES, ...FINANCIAL_ROLES, ...OPTIONAL_ROLES];

export function ColumnMappingDialog({ open, onOpenChange, preview, onConfirm }: ColumnMappingDialogProps) {
  const [mapping, setMapping] = useState<ColumnMapping>(preview.suggestedMapping);

  const setRole = (role: ColumnRole, value: string) => {
    setMapping(prev => ({ ...prev, [role]: value === SKIP_VALUE ? null : value }));
  };

  const hasFinancialColumn = !!(mapping.debit || mapping.credit || mapping.amount);
  const isValid = mapping.date && hasFinancialColumn;

  const assignedColumns = useMemo(() => {
    const set = new Set<string>();
    Object.values(mapping).forEach(v => { if (v) set.add(v); });
    return set;
  }, [mapping]);

  const getAvailableHeaders = (currentRole: ColumnRole) => {
    const currentVal = mapping[currentRole];
    return preview.headers.filter(h => h === currentVal || !assignedColumns.has(h));
  };

  const confidencePercent = Math.round(preview.confidence * 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Columns className="h-5 w-5 text-primary" />
            Column Mapping — {preview.fileName}
          </DialogTitle>
          <DialogDescription>
            Map each column to its role. We auto-detected what we could — please verify and adjust.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant={confidencePercent < 60 ? 'destructive' : 'secondary'} className="text-xs">
            Detection confidence: {confidencePercent}%
          </Badge>
        </div>

        {/* Mapping controls */}
        <div className="grid grid-cols-2 gap-3 py-2">
          {ALL_ROLES.map(role => {
            const isMapped = !!mapping[role];
            const isRequired = REQUIRED_ROLES.includes(role) || (!mapping.amount && FINANCIAL_ROLES.slice(0, 2).includes(role));
            return (
              <div key={role} className="flex items-center gap-2">
                <div className="w-32 shrink-0 flex items-center gap-1.5">
                  {isMapped ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                  ) : isRequired ? (
                    <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                  ) : (
                    <div className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="text-xs font-medium truncate">{COLUMN_ROLE_LABELS[role]}</span>
                  {isRequired && <Badge variant="outline" className="text-[10px] px-1 py-0">req</Badge>}
                </div>
                <Select value={mapping[role] || SKIP_VALUE} onValueChange={(v) => setRole(role, v)}>
                  <SelectTrigger className="h-8 text-xs flex-1">
                    <SelectValue placeholder="Skip" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SKIP_VALUE} className="text-xs text-muted-foreground">— Skip —</SelectItem>
                    {getAvailableHeaders(role).map(h => (
                      <SelectItem key={h} value={h} className="text-xs">{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>

        {!hasFinancialColumn && (
          <p className="text-xs text-destructive">Map at least Debit/Credit or Amount column.</p>
        )}

        {/* Preview table */}
        <div className="text-xs font-medium text-muted-foreground mt-1">Preview (first {preview.rows.length} rows)</div>
        <ScrollArea className="flex-1 min-h-0 max-h-[300px] border border-border rounded-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  {preview.headers.map(h => {
                    const role = (Object.entries(mapping) as [ColumnRole, string | null][]).find(([, v]) => v === h)?.[0];
                    return (
                      <th key={h} className="px-2 py-1.5 text-left font-medium whitespace-nowrap border-b border-border">
                        <div>{h}</div>
                        {role && (
                          <Badge variant="secondary" className="text-[9px] px-1 py-0 mt-0.5">
                            {COLUMN_ROLE_LABELS[role]}
                          </Badge>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                    {preview.headers.map(h => (
                      <td key={h} className="px-2 py-1 whitespace-nowrap text-muted-foreground max-w-[200px] truncate">
                        {String(row[h] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ScrollArea>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onConfirm(mapping)} disabled={!isValid}>
            Confirm & Process
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
