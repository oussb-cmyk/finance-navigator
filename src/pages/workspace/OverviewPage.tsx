import { useParams } from 'react-router-dom';
import { useProjectStore } from '@/store/useProjectStore';
import { useProjectFiles, useProjectEntries, useProjectMappings } from '@/hooks/useStableStoreSelectors';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { KPICard } from '@/components/shared/KPICard';
import { FileText, BookOpen, GitBranch, CheckCircle, DollarSign, TrendingUp, BarChart3, AlertTriangle } from 'lucide-react';

export default function OverviewPage() {
  const { projectId } = useParams();
  const pid = projectId || '';
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  const files = useProjectFiles(pid);
  const entries = useProjectEntries(pid);
  const mappings = useProjectMappings(pid);

  if (!project) return <div className="text-muted-foreground">Project not found</div>;

  const totalRevenue = entries.filter(e => e.accountCode.startsWith('4')).reduce((s, e) => s + e.credit, 0);
  const totalExpenses = entries.filter(e => ['5', '6', '7'].some(c => e.accountCode.startsWith(c))).reduce((s, e) => s + e.debit, 0);
  const validatedCount = entries.filter(e => e.isValidated).length;
  const unmappedCount = mappings.filter(m => !m.isMapped).length;

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center gap-3">
          <h1 className="page-title">{project.name}</h1>
          <StatusBadge status={project.status} />
        </div>
        <p className="page-subtitle">{project.company} · {project.currency} · Fiscal year ending {project.fiscalYearEnd}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KPICard label="Revenue" value={totalRevenue} previousValue={totalRevenue * 0.88} format="currency" icon={<DollarSign className="h-4 w-4" />} />
        <KPICard label="Expenses" value={totalExpenses} previousValue={totalExpenses * 0.92} format="currency" icon={<TrendingUp className="h-4 w-4" />} />
        <KPICard label="Net Income" value={totalRevenue - totalExpenses} previousValue={(totalRevenue * 0.88) - (totalExpenses * 0.92)} format="currency" icon={<BarChart3 className="h-4 w-4" />} />
        <KPICard label="Gross Margin" value={totalRevenue > 0 ? ((totalRevenue - totalExpenses) / totalRevenue) * 100 : 0} previousValue={45.2} format="percentage" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Files</span>
          </div>
          <p className="text-2xl font-bold mono">{files.length}</p>
          <div className="flex gap-2 mt-2 flex-wrap">
            {['raw', 'processed', 'validated'].map(s => {
              const c = files.filter(f => f.status === s).length;
              return c > 0 ? <StatusBadge key={s} status={s} className="text-[10px]" /> : null;
            })}
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Journal Entries</span>
          </div>
          <p className="text-2xl font-bold mono">{entries.length}</p>
          <p className="text-xs text-muted-foreground mt-2">
            <CheckCircle className="h-3 w-3 inline mr-1 text-success" />{validatedCount} validated
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <GitBranch className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Account Mappings</span>
          </div>
          <p className="text-2xl font-bold mono">{mappings.length}</p>
          {unmappedCount > 0 && (
            <p className="text-xs text-warning mt-2">
              <AlertTriangle className="h-3 w-3 inline mr-1" />{unmappedCount} unmapped
            </p>
          )}
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Validation</span>
          </div>
          <p className="text-2xl font-bold mono">{entries.length > 0 ? Math.round((validatedCount / entries.length) * 100) : 0}%</p>
          <p className="text-xs text-muted-foreground mt-2">{entries.length - validatedCount} entries pending</p>
        </div>
      </div>
    </div>
  );
}
