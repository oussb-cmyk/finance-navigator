import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, AlertTriangle, ExternalLink } from 'lucide-react';
import type { InvoiceRow } from '@/types/invoice';

interface Props {
  invoice: InvoiceRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function InvoiceEditDialog({ invoice, open, onOpenChange, onSaved }: Props) {
  const [form, setForm] = useState<Partial<InvoiceRow>>({});
  const [saving, setSaving] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  useEffect(() => {
    setForm({
      supplier: invoice.supplier,
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      due_date: invoice.due_date,
      amount_ht: invoice.amount_ht,
      amount_ttc: invoice.amount_ttc,
      vat_amount: invoice.vat_amount,
      currency: invoice.currency,
      account_code: invoice.account_code,
      poste: invoice.poste,
      categorie_treso: invoice.categorie_treso,
      categorie_pnl: invoice.categorie_pnl,
    });
  }, [invoice]);

  // Generate a signed URL for the file preview
  useEffect(() => {
    let active = true;
    supabase.storage.from('invoices').createSignedUrl(invoice.file_path, 600).then(({ data }) => {
      if (active && data?.signedUrl) setFileUrl(data.signedUrl);
    });
    return () => { active = false; };
  }, [invoice.file_path]);

  const set = (k: keyof InvoiceRow, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('invoices')
      .update({
        supplier: form.supplier,
        invoice_number: form.invoice_number,
        invoice_date: form.invoice_date,
        due_date: form.due_date,
        amount_ht: form.amount_ht,
        amount_ttc: form.amount_ttc,
        vat_amount: form.vat_amount,
        currency: form.currency,
        account_code: form.account_code,
        poste: form.poste,
        categorie_treso: form.categorie_treso,
        categorie_pnl: form.categorie_pnl,
      })
      .eq('id', invoice.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Saved');
    onSaved();
  };

  const lowConf = (invoice.confidence ?? 0) < 70;
  const fieldClass = lowConf ? 'border-warning' : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="truncate">{invoice.file_name}</span>
            {invoice.confidence != null && (
              <Badge variant="outline" className={lowConf ? 'border-warning text-warning' : 'border-success text-success'}>
                AI Confidence {invoice.confidence}%
              </Badge>
            )}
            {invoice.needs_review && (
              <Badge variant="outline" className="border-warning text-warning gap-1">
                <AlertTriangle className="h-3 w-3" />Needs review
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {invoice.error_message && (
          <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive">
            {invoice.error_message}
          </div>
        )}

        {fileUrl && (
          <a href={fileUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
            <ExternalLink className="h-3 w-3" />Open original file
          </a>
        )}

        <div className="grid grid-cols-2 gap-4 mt-2">
          <div className="col-span-2">
            <Label>Supplier</Label>
            <Input className={fieldClass} value={form.supplier ?? ''} onChange={(e) => set('supplier', e.target.value)} />
          </div>
          <div>
            <Label>Invoice #</Label>
            <Input className={fieldClass} value={form.invoice_number ?? ''} onChange={(e) => set('invoice_number', e.target.value)} />
          </div>
          <div>
            <Label>Currency</Label>
            <Input value={form.currency ?? ''} onChange={(e) => set('currency', e.target.value)} />
          </div>
          <div>
            <Label>Invoice Date</Label>
            <Input type="date" value={form.invoice_date ?? ''} onChange={(e) => set('invoice_date', e.target.value || null)} />
          </div>
          <div>
            <Label>Due Date</Label>
            <Input type="date" value={form.due_date ?? ''} onChange={(e) => set('due_date', e.target.value || null)} />
          </div>
          <div>
            <Label>Amount HT</Label>
            <Input type="number" step="0.01" className={fieldClass}
              value={form.amount_ht ?? ''}
              onChange={(e) => set('amount_ht', e.target.value === '' ? null : parseFloat(e.target.value))} />
          </div>
          <div>
            <Label>VAT</Label>
            <Input type="number" step="0.01" className={fieldClass}
              value={form.vat_amount ?? ''}
              onChange={(e) => set('vat_amount', e.target.value === '' ? null : parseFloat(e.target.value))} />
          </div>
          <div className="col-span-2">
            <Label>Amount TTC</Label>
            <Input type="number" step="0.01" className={fieldClass}
              value={form.amount_ttc ?? ''}
              onChange={(e) => set('amount_ttc', e.target.value === '' ? null : parseFloat(e.target.value))} />
          </div>

          <div className="col-span-2 pt-2 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">AI Accounting</p>
          </div>
          <div>
            <Label>Account Code</Label>
            <Input className={fieldClass} value={form.account_code ?? ''} onChange={(e) => set('account_code', e.target.value)} placeholder="e.g. 6257" />
          </div>
          <div>
            <Label>Poste</Label>
            <Input className={fieldClass} value={form.poste ?? ''} onChange={(e) => set('poste', e.target.value)} />
          </div>
          <div>
            <Label>Catégorie Tréso</Label>
            <Input className={fieldClass} value={form.categorie_treso ?? ''} onChange={(e) => set('categorie_treso', e.target.value)} />
          </div>
          <div>
            <Label>Catégorie P&L</Label>
            <Input className={fieldClass} value={form.categorie_pnl ?? ''} onChange={(e) => set('categorie_pnl', e.target.value)} />
          </div>
        </div>

        <div className="flex justify-between pt-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save
            </Button>
            <Button variant="default" disabled title="Available in step 2: generates a balanced journal entry">
              Validate →
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
