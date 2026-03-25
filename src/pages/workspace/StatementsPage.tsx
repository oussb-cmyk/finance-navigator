import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useProjectEntries } from '@/hooks/useStableStoreSelectors';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw } from 'lucide-react';

function useFinancials(projectId: string) {
  const entries = useProjectEntries(projectId);

  const sumByPrefix = (prefixes: string[], field: 'debit' | 'credit') =>
    entries.filter(e => prefixes.some(p => e.accountCode.startsWith(p))).reduce((s, e) => s + e[field], 0);

  const revenue = sumByPrefix(['4'], 'credit');
  const cogs = sumByPrefix(['5'], 'debit');
  const opex = sumByPrefix(['6'], 'debit');
  const finex = sumByPrefix(['7'], 'debit');
  const grossProfit = revenue - cogs;
  const operatingIncome = grossProfit - opex;
  const netIncome = operatingIncome - finex;

  const cash = sumByPrefix(['1000'], 'debit') - sumByPrefix(['1000'], 'credit');
  const ar = sumByPrefix(['11'], 'debit') - sumByPrefix(['11'], 'credit');
  const fixedAssets = sumByPrefix(['15'], 'debit');
  const ap = sumByPrefix(['20'], 'credit');
  const ltd = sumByPrefix(['25'], 'credit');
  const equity = sumByPrefix(['30'], 'credit') + netIncome;

  return {
    pnl: [
      { section: 'Revenue', items: [{ label: 'Sales Revenue', amount: sumByPrefix(['4000'], 'credit') }, { label: 'Service Revenue', amount: sumByPrefix(['41'], 'credit') }], total: revenue },
      { section: 'Cost of Goods Sold', items: [{ label: 'COGS', amount: cogs }], total: -cogs },
      { section: 'Gross Profit', items: [], total: grossProfit },
      { section: 'Operating Expenses', items: [{ label: 'Salaries & Wages', amount: sumByPrefix(['6000'], 'debit') }, { label: 'Office Rent', amount: sumByPrefix(['61'], 'debit') }, { label: 'Utilities', amount: sumByPrefix(['62'], 'debit') }], total: -opex },
      { section: 'Operating Income', items: [], total: operatingIncome },
      { section: 'Financial Expenses', items: [{ label: 'Interest Expense', amount: finex }], total: -finex },
      { section: 'Net Income', items: [], total: netIncome },
    ],
    bs: [
      { section: 'Current Assets', items: [{ label: 'Cash & Equivalents', amount: cash }, { label: 'Accounts Receivable', amount: ar }], total: cash + ar },
      { section: 'Non-Current Assets', items: [{ label: 'Fixed Assets', amount: fixedAssets }], total: fixedAssets },
      { section: 'Total Assets', items: [], total: cash + ar + fixedAssets },
      { section: 'Current Liabilities', items: [{ label: 'Accounts Payable', amount: ap }], total: ap },
      { section: 'Non-Current Liabilities', items: [{ label: 'Long-term Debt', amount: ltd }], total: ltd },
      { section: 'Equity', items: [{ label: 'Share Capital + Retained', amount: equity }], total: equity },
      { section: 'Total Liabilities & Equity', items: [], total: ap + ltd + equity },
    ],
    entries,
  };
}

export default function StatementsPage() {
  const { projectId } = useParams();
  const [lastComputed, setLastComputed] = useState(new Date().toLocaleString());
  const data = useFinancials(projectId || '');

  const recompute = () => setLastComputed(new Date().toLocaleString());

  const renderStatement = (sections: typeof data.pnl) => (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <table className="data-table">
        <thead>
          <tr>
            <th className="w-[60%]">Account</th>
            <th className="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((s, i) => (
            <>
              {s.items.length > 0 && (
                <>
                  <tr key={`h-${i}`}>
                    <td colSpan={2} className="font-semibold text-sm bg-muted/30 text-foreground">{s.section}</td>
                  </tr>
                  {s.items.map((item, j) => (
                    <tr key={`${i}-${j}`}>
                      <td className="pl-8 text-sm text-muted-foreground">{item.label}</td>
                      <td className="text-right mono text-sm">${item.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                </>
              )}
              <tr key={`t-${i}`} className={s.items.length === 0 ? 'bg-muted/20' : ''}>
                <td className={`font-semibold text-sm ${s.items.length === 0 ? 'text-foreground' : 'pl-4'}`}>
                  {s.items.length === 0 ? s.section : `Total ${s.section}`}
                </td>
                <td className="text-right mono text-sm font-semibold">${s.total.toLocaleString()}</td>
              </tr>
            </>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderLedger = () => (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Ref</th>
            <th>Account</th>
            <th>Description</th>
            <th className="text-right">Debit</th>
            <th className="text-right">Credit</th>
            <th className="text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {data.entries.reduce<{ entries: (typeof data.entries[0] & { balance: number })[] }>((acc, e) => {
            const bal = (acc.entries.length > 0 ? acc.entries[acc.entries.length - 1].balance : 0) + e.debit - e.credit;
            acc.entries.push({ ...e, balance: bal });
            return acc;
          }, { entries: [] }).entries.map((e) => (
            <tr key={e.id}>
              <td className="mono text-xs">{e.date}</td>
              <td className="mono text-xs text-muted-foreground">{e.reference}</td>
              <td className="text-xs"><span className="mono">{e.accountCode}</span> {e.accountName}</td>
              <td className="text-sm">{e.description}</td>
              <td className="text-right mono text-sm">{e.debit > 0 ? `$${e.debit.toLocaleString()}` : ''}</td>
              <td className="text-right mono text-sm">{e.credit > 0 ? `$${e.credit.toLocaleString()}` : ''}</td>
              <td className="text-right mono text-sm font-medium">${e.balance.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">Financial Statements</h1>
          <p className="page-subtitle">Last computed: {lastComputed}</p>
        </div>
        <Button variant="outline" size="sm" onClick={recompute}>
          <RefreshCw className="h-3 w-3 mr-1" />Recompute
        </Button>
      </div>

      <Tabs defaultValue="pnl">
        <TabsList>
          <TabsTrigger value="pnl">Profit & Loss</TabsTrigger>
          <TabsTrigger value="bs">Balance Sheet</TabsTrigger>
          <TabsTrigger value="gl">General Ledger</TabsTrigger>
        </TabsList>
        <TabsContent value="pnl" className="mt-4">{renderStatement(data.pnl)}</TabsContent>
        <TabsContent value="bs" className="mt-4">{renderStatement(data.bs)}</TabsContent>
        <TabsContent value="gl" className="mt-4">{renderLedger()}</TabsContent>
      </Tabs>
    </div>
  );
}
