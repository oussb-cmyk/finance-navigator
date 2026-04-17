import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Building2, Calendar, FileText, AlertTriangle, Trash2, LogIn, LogOut, User } from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';
import { useAuth } from '@/hooks/useAuth';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export default function HomePage() {
  const { projects, addProject, deleteProject } = useProjectStore();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', company: '', activity: '', activityDescription: '', currency: 'USD' });

  const handleCreate = () => {
    if (!form.name || !form.company || !form.activity) return;
    const id = `proj-${Date.now()}`;
    addProject({
      id,
      name: form.name,
      company: form.company,
      activity: form.activity,
      activityDescription: form.activityDescription,
      currency: form.currency,
      fiscalYearEnd: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString().slice(0, 10),
      status: 'active',
      filesCount: 0,
      entriesCount: 0,
      unmappedAccounts: 0,
    });
    setForm({ name: '', company: '', activity: '', activityDescription: '', currency: 'USD' });
    setOpen(false);
    navigate(`/project/${id}/overview`);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-sm font-bold text-primary-foreground">FH</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Finance Hub</h1>
              <p className="text-xs text-muted-foreground">Financial Data Processing Platform</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground hidden sm:inline-flex items-center gap-1.5">
                  <User className="h-3 w-3" />{user.email}
                </span>
                <Button variant="ghost" size="sm" onClick={signOut} title="Sign out">
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => navigate('/auth')}>
                <LogIn className="h-4 w-4 mr-2" />Sign In
              </Button>
            )}
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />New Project</Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Project</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <Label>Project Name</Label>
                  <Input placeholder="e.g. FY 2024 Audit" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <Label>Company</Label>
                  <Input placeholder="e.g. Acme Corp" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
                </div>
                <div>
                  <Label>Business Activity <span className="text-destructive">*</span></Label>
                  <Input placeholder="e.g. Restaurant, SaaS, Real Estate, E-commerce, Consulting" value={form.activity} onChange={(e) => setForm({ ...form, activity: e.target.value })} />
                  <p className="text-xs text-muted-foreground mt-1">Used for AI-powered transaction categorization</p>
                </div>
                <div>
                  <Label>Activity Description <span className="text-muted-foreground text-xs font-normal">(optional, recommended)</span></Label>
                  <Textarea
                    placeholder="e.g. Independent live music venue with bar service. Revenue from ticket sales (TICKETNET, SeeTickets) and bar. Main expenses: artist fees, SACEM, URSSAF, rent."
                    value={form.activityDescription}
                    onChange={(e) => setForm({ ...form, activityDescription: e.target.value })}
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Richer context = smarter AI categorization (revenue streams, suppliers, recurring expenses…)</p>
                </div>
                <div>
                  <Label>Currency</Label>
                  <Input placeholder="USD" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
                </div>
                <Button onClick={handleCreate} className="w-full" disabled={!form.name || !form.company || !form.activity}>Create Project</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid gap-4">
          {projects.map((p) => (
            <div
              key={p.id}
              className="bg-card border border-border rounded-xl p-5 hover:shadow-md transition-all cursor-pointer group"
              onClick={() => navigate(`/project/${p.id}/overview`)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="h-11 w-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">{p.name}</h3>
                    <p className="text-sm text-muted-foreground">{p.company} · {p.currency}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{p.filesCount} files</span>
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{p.updatedAt}</span>
                      {p.unmappedAccounts > 0 && (
                        <span className="flex items-center gap-1 text-warning"><AlertTriangle className="h-3 w-3" />{p.unmappedAccounts} unmapped</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={p.status} />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                    onClick={(e) => { e.stopPropagation(); deleteProject(p.id); }}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {projects.length === 0 && (
            <div className="text-center py-20">
              <Building2 className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
              <p className="text-muted-foreground">No projects yet. Create one to get started.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
