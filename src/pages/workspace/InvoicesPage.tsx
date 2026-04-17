import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useProjectStore } from '@/store/useProjectStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { Upload, Loader2, FileText, AlertTriangle, CheckCircle2, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { InvoiceRow } from '@/types/invoice';
import { InvoiceEditDialog } from '@/components/workspace/InvoiceEditDialog';

const ACCEPTED = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];

function StatusBadge({ status, needsReview }: { status: InvoiceRow['status']; needsReview?: boolean | null }) {
  if (status === 'processing') {
    return <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Processing</Badge>;
  }
  if (status === 'ocr_failed' || status === 'ai_failed' || status === 'error') {
    return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Error</Badge>;
  }
  if (status === 'validated') {
    return <Badge className="gap-1 bg-success text-success-foreground"><CheckCircle2 className="h-3 w-3" />Validated</Badge>;
  }
  return (
    <Badge variant={needsReview ? 'outline' : 'secondary'} className={needsReview ? 'border-warning text-warning' : ''}>
      To Review
    </Badge>
  );
}

export default function InvoicesPage() {
  const { projectId } = useParams();
  const pid = projectId || '';
  const project = useProjectStore((s) => s.projects.find((p) => p.id === pid));

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selected, setSelected] = useState<InvoiceRow | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('project_id', pid)
      .order('created_at', { ascending: false });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setInvoices((data ?? []) as InvoiceRow[]);
  }, [pid]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`invoices-${pid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices', filter: `project_id=eq.${pid}` }, () => {
        fetchInvoices();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [pid, fetchInvoices]);

  const processInvoice = async (invoiceId: string) => {
    const { error } = await supabase.functions.invoke('process-invoice', {
      body: {
        invoice_id: invoiceId,
        company_name: project?.company,
        activity: project?.activity,
        activity_description: project?.activityDescription,
      },
    });
    if (error) {
      toast.error(`AI processing failed: ${error.message}`);
    }
  };

  const handleFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Please sign in again');
      return;
    }

    setUploading(true);
    for (const file of arr) {
      if (!ACCEPTED.includes(file.type)) {
        toast.error(`${file.name}: unsupported type (${file.type})`);
        continue;
      }
      try {
        const ext = file.name.split('.').pop();
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

        const { error: upErr } = await supabase.storage.from('invoices').upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
        if (upErr) throw upErr;

        const { data: inserted, error: insErr } = await supabase
          .from('invoices')
          .insert({
            user_id: user.id,
            project_id: pid,
            file_path: path,
            file_name: file.name,
            file_type: file.type,
            file_size: file.size,
            status: 'processing',
            processing_step: 'Queued for OCR…',
          })
          .select()
          .single();
        if (insErr) throw insErr;

        toast.success(`Uploaded ${file.name}`);
        // Fire-and-forget AI processing
        processInvoice(inserted.id);
      } catch (e: any) {
        toast.error(`${file.name}: ${e.message}`);
      }
    }
    setUploading(false);
    fetchInvoices();
  };

  const handleDelete = async (inv: InvoiceRow) => {
    if (!confirm(`Delete invoice ${inv.file_name}?`)) return;
    await supabase.storage.from('invoices').remove([inv.file_path]);
    const { error } = await supabase.from('invoices').delete().eq('id', inv.id);
    if (error) toast.error(error.message);
    else {
      toast.success('Deleted');
      fetchInvoices();
    }
  };

  const handleReprocess = async (inv: InvoiceRow) => {
    await supabase.from('invoices').update({ status: 'processing', processing_step: 'Re-running…', error_message: null }).eq('id', inv.id);
    processInvoice(inv.id);
  };

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="page-subtitle">Upload supplier invoices — OCR + AI accounting in one click</p>
        </div>
        <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
          Upload Invoice
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {/* Drag-drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors mb-6 ${
          dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-accent/30'
        }`}
      >
        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm font-medium">Drop PDF, JPG or PNG here, or click to browse</p>
        <p className="text-xs text-muted-foreground mt-1">Files are processed automatically with OCR + AI accounting</p>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Amount TTC</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={8} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            )}
            {!loading && invoices.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                No invoices yet. Upload one to get started.
              </TableCell></TableRow>
            )}
            {invoices.map((inv) => (
              <TableRow key={inv.id} className="cursor-pointer hover:bg-accent/40" onClick={() => setSelected(inv)}>
                <TableCell className="font-medium max-w-xs truncate">{inv.file_name}</TableCell>
                <TableCell>{inv.supplier ?? <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell>{inv.invoice_date ?? <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-right mono">
                  {inv.amount_ttc != null ? `${inv.amount_ttc.toFixed(2)} ${inv.currency ?? ''}` : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="mono text-xs">{inv.account_code ?? <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell>
                  {inv.confidence != null ? (
                    <Badge variant="outline" className={inv.confidence >= 70 ? 'border-success text-success' : 'border-warning text-warning'}>
                      {inv.confidence}%
                    </Badge>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell><StatusBadge status={inv.status} needsReview={inv.needs_review} /></TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  {(inv.status === 'ocr_failed' || inv.status === 'ai_failed' || inv.status === 'error') && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleReprocess(inv)} title="Retry">
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(inv)} title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {selected && (
        <InvoiceEditDialog
          invoice={selected}
          open={!!selected}
          onOpenChange={(o) => !o && setSelected(null)}
          onSaved={() => { fetchInvoices(); }}
        />
      )}
    </div>
  );
}
