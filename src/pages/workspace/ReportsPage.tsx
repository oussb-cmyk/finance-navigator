import { useParams } from 'react-router-dom';
import { useProjectStore } from '@/store/useProjectStore';
import { FileText, CheckCircle, AlertTriangle, Clock } from 'lucide-react';

export default function ReportsPage() {
  const { projectId } = useParams();
  const pid = projectId || '';
  const entries = useProjectStore((s) => s.entries[pid] ?? []);
  const files = useProjectStore((s) => s.files[pid] ?? []);
  const mappings = useProjectStore((s) => s.mappings[pid] ?? []);

  const validated = entries.filter(e => e.isValidated).length;
  const unmapped = mappings.filter(m => !m.isMapped).length;
  const rawFiles = files.filter(f => f.status === 'raw').length;

  const reports = [
    {
      title: 'Data Quality Report',
      items: [
        { label: 'Total files uploaded', value: files.length, icon: <FileText className="h-4 w-4 text-info" /> },
        { label: 'Files pending processing', value: rawFiles, icon: rawFiles > 0 ? <AlertTriangle className="h-4 w-4 text-warning" /> : <CheckCircle className="h-4 w-4 text-success" /> },
        { label: 'Journal entries', value: entries.length, icon: <FileText className="h-4 w-4 text-info" /> },
        { label: 'Validated entries', value: `${validated} / ${entries.length}`, icon: validated === entries.length ? <CheckCircle className="h-4 w-4 text-success" /> : <Clock className="h-4 w-4 text-warning" /> },
        { label: 'Unmapped accounts', value: unmapped, icon: unmapped === 0 ? <CheckCircle className="h-4 w-4 text-success" /> : <AlertTriangle className="h-4 w-4 text-warning" /> },
      ],
    },
    {
      title: 'Balance Check',
      items: [
        { label: 'Total debits', value: `$${entries.reduce((s, e) => s + e.debit, 0).toLocaleString()}`, icon: <FileText className="h-4 w-4 text-info" /> },
        { label: 'Total credits', value: `$${entries.reduce((s, e) => s + e.credit, 0).toLocaleString()}`, icon: <FileText className="h-4 w-4 text-info" /> },
        {
          label: 'Difference',
          value: `$${Math.abs(entries.reduce((s, e) => s + e.debit, 0) - entries.reduce((s, e) => s + e.credit, 0)).toLocaleString()}`,
          icon: entries.reduce((s, e) => s + e.debit, 0) === entries.reduce((s, e) => s + e.credit, 0) ? <CheckCircle className="h-4 w-4 text-success" /> : <AlertTriangle className="h-4 w-4 text-destructive" />,
        },
      ],
    },
    {
      title: 'Completeness Summary',
      items: [
        { label: 'Mapping completion', value: `${mappings.length > 0 ? Math.round(((mappings.length - unmapped) / mappings.length) * 100) : 0}%`, icon: <CheckCircle className="h-4 w-4 text-success" /> },
        { label: 'Validation completion', value: `${entries.length > 0 ? Math.round((validated / entries.length) * 100) : 0}%`, icon: <CheckCircle className="h-4 w-4 text-success" /> },
        { label: 'Unique accounts', value: new Set(entries.map(e => e.accountCode)).size, icon: <FileText className="h-4 w-4 text-info" /> },
        { label: 'Date range', value: entries.length > 0 ? `${entries[0].date} – ${entries[entries.length - 1].date}` : 'N/A', icon: <Clock className="h-4 w-4 text-muted-foreground" /> },
      ],
    },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Reports</h1>
        <p className="page-subtitle">Data quality and completeness reports</p>
      </div>

      <div className="grid gap-6">
        {reports.map((r) => (
          <div key={r.title} className="bg-card border border-border rounded-xl">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-sm">{r.title}</h3>
            </div>
            <div className="divide-y divide-border/50">
              {r.items.map((item, i) => (
                <div key={i} className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {item.icon}
                    <span className="text-sm text-foreground">{item.label}</span>
                  </div>
                  <span className="text-sm font-medium mono">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
