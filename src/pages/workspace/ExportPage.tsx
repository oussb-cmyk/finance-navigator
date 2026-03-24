import { useParams } from 'react-router-dom';
import { useProjectStore } from '@/store/useProjectStore';
import { Button } from '@/components/ui/button';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';

export default function ExportPage() {
  const { projectId } = useParams();
  const entries = useProjectStore((s) => s.getProjectEntries(projectId || ''));
  const project = useProjectStore((s) => s.projects.find(p => p.id === projectId));

  const exportCSV = (type: string) => {
    let csv = '';
    if (type === 'journal') {
      csv = 'Date,Reference,Description,Account Code,Account Name,Debit,Credit,Validated\n';
      entries.forEach(e => {
        csv += `${e.date},${e.reference},"${e.description}",${e.accountCode},"${e.accountName}",${e.debit},${e.credit},${e.isValidated}\n`;
      });
    } else if (type === 'pnl') {
      const sumByPrefix = (prefixes: string[], field: 'debit' | 'credit') =>
        entries.filter(e => prefixes.some(p => e.accountCode.startsWith(p))).reduce((s, e) => s + e[field], 0);
      const revenue = sumByPrefix(['4'], 'credit');
      const cogs = sumByPrefix(['5'], 'debit');
      const opex = sumByPrefix(['6'], 'debit');
      const finex = sumByPrefix(['7'], 'debit');
      csv = 'Item,Amount\n';
      csv += `Revenue,${revenue}\nCOGS,${cogs}\nGross Profit,${revenue - cogs}\n`;
      csv += `Operating Expenses,${opex}\nOperating Income,${revenue - cogs - opex}\n`;
      csv += `Financial Expenses,${finex}\nNet Income,${revenue - cogs - opex - finex}\n`;
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project?.company || 'export'}_${type}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exports = [
    { title: 'Journal Entries', desc: 'Export all journal entries with validation status', icon: <FileSpreadsheet className="h-5 w-5 text-success" />, action: () => exportCSV('journal') },
    { title: 'Profit & Loss Statement', desc: 'Export P&L as CSV', icon: <FileText className="h-5 w-5 text-info" />, action: () => exportCSV('pnl') },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Export</h1>
        <p className="page-subtitle">Download financial data and reports</p>
      </div>

      <div className="grid gap-4">
        {exports.map((ex) => (
          <div key={ex.title} className="bg-card border border-border rounded-xl p-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">{ex.icon}</div>
              <div>
                <h3 className="font-medium text-sm">{ex.title}</h3>
                <p className="text-xs text-muted-foreground">{ex.desc}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={ex.action}>
              <Download className="h-3 w-3 mr-1" />Export CSV
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
