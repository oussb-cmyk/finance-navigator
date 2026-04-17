-- 1. Invoices table
CREATE TABLE public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,

  -- File
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER,

  -- Status
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'ocr_failed', 'ai_failed', 'to_review', 'validated', 'error')),
  processing_step TEXT,
  error_message TEXT,

  -- OCR fields
  supplier TEXT,
  invoice_number TEXT,
  invoice_date DATE,
  due_date DATE,
  amount_ht NUMERIC(15, 2),
  amount_ttc NUMERIC(15, 2),
  vat_amount NUMERIC(15, 2),
  currency TEXT DEFAULT 'EUR',
  raw_text TEXT,

  -- AI fields
  account_code TEXT,
  poste TEXT,
  categorie_treso TEXT,
  categorie_pnl TEXT,
  ai_entry JSONB,
  confidence INTEGER,
  needs_review BOOLEAN DEFAULT false,
  ai_raw_response JSONB,

  -- Validation
  validated_at TIMESTAMPTZ,
  journal_entry_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoices_user_project ON public.invoices(user_id, project_id);
CREATE INDEX idx_invoices_status ON public.invoices(status);

-- 2. RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own invoices"
  ON public.invoices FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own invoices"
  ON public.invoices FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own invoices"
  ON public.invoices FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own invoices"
  ON public.invoices FOR DELETE
  USING (auth.uid() = user_id);

-- 3. updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', false)
ON CONFLICT (id) DO NOTHING;

-- 5. Storage policies — files are stored under {user_id}/{invoice_id}.{ext}
CREATE POLICY "Users can view their own invoice files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'invoices' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload their own invoice files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'invoices' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own invoice files"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'invoices' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own invoice files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'invoices' AND auth.uid()::text = (storage.foldername(name))[1]);
