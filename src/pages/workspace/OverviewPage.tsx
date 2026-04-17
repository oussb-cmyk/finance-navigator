import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useProjectStore } from '@/store/useProjectStore';
import { useProjectFiles, useProjectEntries, useProjectMappings } from '@/hooks/useStableStoreSelectors';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { KPICard } from '@/components/shared/KPICard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { FileText, BookOpen, GitBranch, CheckCircle, DollarSign, TrendingUp, BarChart3, AlertTriangle, Sparkles, Save, Pencil } from 'lucide-react';

export default function OverviewPage() {
  const { projectId } = useParams();
  const pid = projectId || '';
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  const updateProject = useProjectStore((s) => s.updateProject);
  const files = useProjectFiles(pid);
  const entries = useProjectEntries(pid);
  const mappings = useProjectMappings(pid);

  const [editing, setEditing] = useState(false);
  const [activity, setActivity] = useState('');
  const [activityDescription, setActivityDescription] = useState('');

  useEffect(() => {
    if (project) {
      setActivity(project.activity || '');
      setActivityDescription(project.activityDescription || '');
    }
  }, [project?.id, project?.activity, project?.activityDescription]);

  if (!project) return <div className="text-muted-foreground">Project not found</div>;
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

      {/* AI Context — editable */}
      <div className="bg-card border border-border rounded-xl p-5 mb-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">AI Context</span>
            <span className="text-xs text-muted-foreground">Used to categorize transactions</span>
          </div>
          {!editing ? (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => {
                setActivity(project.activity || '');
                setActivityDescription(project.activityDescription || '');
                setEditing(false);
              }}>Cancel</Button>
              <Button size="sm" onClick={() => {
                if (!activity.trim()) { toast.error('Business Activity is required'); return; }
                updateProject(project.id, { activity: activity.trim(), activityDescription: activityDescription.trim() });
                setEditing(false);
                toast.success('AI context updated');
              }}>
                <Save className="h-3.5 w-3.5 mr-1.5" />Save
              </Button>
            </div>
          )}
        </div>

        {!editing ? (
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Business Activity</p>
              <p className="text-sm">{project.activity || <span className="italic text-muted-foreground">Not set</span>}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Activity Description</p>
              <p className="text-sm whitespace-pre-wrap">
                {project.activityDescription
                  ? project.activityDescription
                  : <span className="italic text-muted-foreground">Add a richer description (revenue streams, suppliers, recurring expenses…) for smarter AI categorization.</span>}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Business Activity *</Label>
              <Input
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
                placeholder="e.g. Live music venue, SaaS, Restaurant"
              />
            </div>
            <div>
              <Label className="text-xs">Activity Description</Label>
              <Textarea
                value={activityDescription}
                onChange={(e) => setActivityDescription(e.target.value)}
                rows={5}
                placeholder="e.g. Independent live music venue with bar service. Revenue from ticket sales (TICKETNET, SeeTickets) and bar. Main expenses: artist fees, SACEM, URSSAF, rent."
              />
              <p className="text-xs text-muted-foreground mt-1">The richer this description, the better the AI categorizes ambiguous bank descriptions.</p>
            </div>
          </div>
        )}
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
