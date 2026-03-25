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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, AlertTriangle, Layers, Trash2, Info } from 'lucide-react';
import type { HierarchicalParseResult, HierarchicalTransaction, DetectedAccount } from '@/lib/fileParser';

interface HierarchicalPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: HierarchicalParseResult;
  fileName: string;
  onConfirm: (transactions: HierarchicalTransaction[], accounts: DetectedAccount[]) => void;
  onFallbackToMapping: () => void;
}

export function HierarchicalPreviewDialog({
  open,
  onOpenChange,
  result,
  fileName,
  onConfirm,
  onFallbackToMapping,
}: HierarchicalPreviewDialogProps) {
  const [removedRows, setRemovedRows] = useState<Set<number>>(new Set());

  const activeTransactions = useMemo(
    () => result.transactions.filter(tx => !removedRows.has(tx.rowIndex)),
    [result.transactions, removedRows]
  );

  const activeAccounts = useMemo(() => {
    const usedCodes = new Set(activeTransactions.map(tx => tx.accountCode));
    return result.accounts.filter(a => usedCodes.has(a.code));
  }, [result.accounts, activeTransactions]);

  const totalDebit = useMemo(() => activeTransactions.reduce((s, tx) => s + tx.debit, 0), [activeTransactions]);
  const totalCredit = useMemo(() => activeTransactions.reduce((s, tx) => s + tx.credit, 0), [activeTransactions]);

  const toggleRow = (rowIndex: number) => {
    setRemovedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  };

  const hasData = result.transactions.length > 0 && result.accounts.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Hierarchical Ledger — {fileName}
          </DialogTitle>
          <DialogDescription>
            We detected a non-tabular structure. Review the extracted accounts and transactions below.
          </DialogDescription>
        </DialogHeader>

        {/* Stats */}
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant="secondary" className="text-xs">
            {result.accounts.length} accounts detected
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {activeTransactions.length} transactions
          </Badge>
          {result.unparsedRowCount > 0 && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              {result.unparsedRowCount} rows skipped
            </Badge>
          )}
        </div>

        {!hasData && (
          <Alert variant="destructive" className="py-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Could not reliably detect the file structure. Use manual column mapping instead.
            </AlertDescription>
          </Alert>
        )}

        {hasData && (
          <Alert className="py-2">
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Remove incorrect rows by clicking the delete icon. You can also switch to manual column mapping if needed.
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="transactions" className="flex-1 min-h-0 flex flex-col">
          <TabsList className="w-fit">
            <TabsTrigger value="transactions">Transactions ({activeTransactions.length})</TabsTrigger>
            <TabsTrigger value="accounts">Accounts ({activeAccounts.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="transactions" className="flex-1 min-h-0">
            <ScrollArea className="h-full max-h-[400px] border border-border rounded-lg">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium border-b border-border w-8"></th>
                      <th className="px-2 py-1.5 text-left font-medium border-b border-border">Date</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b border-border">Account</th>
                      <th className="px-2 py-1.5 text-left font-medium border-b border-border">Description</th>
                      <th className="px-2 py-1.5 text-right font-medium border-b border-border">Debit</th>
                      <th className="px-2 py-1.5 text-right font-medium border-b border-border">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.transactions.map((tx) => {
                      const removed = removedRows.has(tx.rowIndex);
                      return (
                        <tr
                          key={tx.rowIndex}
                          className={`border-b border-border/50 ${removed ? 'opacity-30 line-through' : 'hover:bg-muted/30'}`}
                        >
                          <td className="px-2 py-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0"
                              onClick={() => toggleRow(tx.rowIndex)}
                            >
                              <Trash2 className={`h-3 w-3 ${removed ? 'text-muted-foreground' : 'text-destructive'}`} />
                            </Button>
                          </td>
                          <td className="px-2 py-1 whitespace-nowrap text-muted-foreground mono">{tx.date}</td>
                          <td className="px-2 py-1 whitespace-nowrap">
                            <span className="mono text-muted-foreground">{tx.accountCode}</span>
                            <span className="ml-1.5 text-foreground">{tx.accountName}</span>
                          </td>
                          <td className="px-2 py-1 max-w-[200px] truncate text-muted-foreground">{tx.description}</td>
                          <td className="px-2 py-1 text-right mono">
                            {tx.debit > 0 ? tx.debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}
                          </td>
                          <td className="px-2 py-1 text-right mono">
                            {tx.credit > 0 ? tx.credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}
                          </td>
                        </tr>
                      );
                    })}
                    {result.transactions.length > 0 && (
                      <tr className="bg-muted/30 font-medium">
                        <td colSpan={4} className="px-2 py-1.5 text-right text-xs">Total</td>
                        <td className="px-2 py-1.5 text-right mono text-xs">
                          {totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-2 py-1.5 text-right mono text-xs">
                          {totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="accounts" className="flex-1 min-h-0">
            <ScrollArea className="h-full max-h-[400px] border border-border rounded-lg">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium border-b border-border">Code</th>
                      <th className="px-3 py-1.5 text-left font-medium border-b border-border">Account Name</th>
                      <th className="px-3 py-1.5 text-right font-medium border-b border-border">Transactions</th>
                      <th className="px-3 py-1.5 text-center font-medium border-b border-border">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.accounts.map((acct) => {
                      const isActive = activeAccounts.some(a => a.code === acct.code);
                      const txCount = activeTransactions.filter(t => t.accountCode === acct.code).length;
                      return (
                        <tr key={acct.code} className={`border-b border-border/50 ${!isActive ? 'opacity-40' : 'hover:bg-muted/30'}`}>
                          <td className="px-3 py-1.5 mono font-medium">{acct.code}</td>
                          <td className="px-3 py-1.5">{acct.name}</td>
                          <td className="px-3 py-1.5 text-right mono text-muted-foreground">{txCount}</td>
                          <td className="px-3 py-1.5 text-center">
                            {isActive ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-success inline-block" />
                            ) : (
                              <span className="text-muted-foreground text-[10px]">no transactions</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <DialogFooter className="pt-2 flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onFallbackToMapping}>
            Switch to Column Mapping
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => onConfirm(activeTransactions, activeAccounts)}
            disabled={activeTransactions.length === 0}
          >
            Confirm & Import ({activeTransactions.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
