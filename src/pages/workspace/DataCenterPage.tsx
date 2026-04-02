import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Upload, FileText, FileSpreadsheet, File, Trash2, RefreshCw, Loader2, AlertTriangle, Download, ShieldCheck, Sparkles, CheckCircle2, XCircle, BookOpen, CreditCard, HelpCircle, Plus, ArrowLeft } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useProjectStore } from '@/store/useProjectStore';
import { useLearningStore, generateFileFingerprint } from '@/store/useLearningStore';
import type { CorrectionRecord } from '@/store/useLearningStore';
import { useProjectFiles } from '@/hooks/useStableStoreSelectors';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { previewFile, parseFileWithMapping, hierarchicalToParseResult } from '@/lib/fileParser';
import type { PreviewData, ColumnMapping, HierarchicalTransaction, DetectedAccount } from '@/lib/fileParser';
import { computeRowConfidence } from '@/lib/confidenceScoring';
import type { ScoredRow } from '@/lib/confidenceScoring';
import { downloadTemplate, detectTemplateMatch, validateAndParseTemplate } from '@/lib/templateUtils';
import type { TemplateRowError, TemplateValidationResult } from '@/lib/templateUtils';
import { ColumnMappingDialog } from '@/components/workspace/ColumnMappingDialog';
import { HierarchicalPreviewDialog } from '@/components/workspace/HierarchicalPreviewDialog';
import { ReviewValidationDialog } from '@/components/workspace/ReviewValidationDialog';
import { ImportPreviewDialog } from '@/components/workspace/ImportPreviewDialog';
import { TransactionPreviewDialog } from '@/components/workspace/TransactionPreviewDialog';
import type { ImportRow } from '@/lib/dataQuality';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import type { UploadedFile } from '@/types/finance';
import { useImportMetaStore } from '@/store/useImportMetaStore';
import { useTransactionStore } from '@/store/useTransactionStore';
import { detectTransactionColumns, autoCategorize } from '@/lib/transactionCategorization';
import type { Transaction } from '@/types/transaction';

interface PendingFile {
  fileId: string;
  rawFile: globalThis.File;
  preview: PreviewData;
}

export default function DataCenterPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const pid = projectId || '';
  const files = useProjectFiles(pid);
  const addFile = useProjectStore((s) => s.addFile);
  const updateFileStatus = useProjectStore((s) => s.updateFileStatus);
  const deleteFile = useProjectStore((s) => s.deleteFile);
  const addProjectEntries = useProjectStore((s) => s.addProjectEntries);
  const mergeProjectMappings = useProjectStore((s) => s.mergeProjectMappings);

  const learnAccountPatterns = useLearningStore((s) => s.learnAccountPatterns);
  const recordBatchCorrections = useLearningStore((s) => s.recordBatchCorrections);
  const saveFileFingerprint = useLearningStore((s) => s.saveFileFingerprint);
  const getAccountConfidenceBoost = useLearningStore((s) => s.getAccountConfidenceBoost);
  const addImportMeta = useImportMetaStore((s) => s.addImport);
  const addTransactions = useTransactionStore((s) => s.addTransactions);

  const [dragOver, setDragOver] = useState(false);
  const [importMode, setImportMode] = useState<'gl' | 'tx' | null>(null);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [rawFiles, setRawFiles] = useState<Map<string, globalThis.File>>(new Map());

  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
  const [dialogMode, setDialogMode] = useState<'tabular' | 'hierarchical' | 'report' | null>(null);

  // Review dialog state (AI path)
  const [reviewRows, setReviewRows] = useState<ScoredRow[] | null>(null);
  const [reviewFileName, setReviewFileName] = useState('');
  const [reviewFileId, setReviewFileId] = useState('');

  // Import Preview dialog state (mandatory preview step)
  const [previewData, setPreviewData] = useState<{ rows: ImportRow[]; fileName: string; fileId: string; mode: 'template' | 'ai' } | null>(null);

  // Transaction preview dialog state
  const [txPreview, setTxPreview] = useState<{
    rawRows: Record<string, unknown>[];
    headers: string[];
    fileName: string;
    fileId: string;
    detectedColumns: { dateCol: string; descCol: string; amountCol: string; sourceCol: string; entityCol: string; tvaCol: string };
  } | null>(null);

  // Template validation error state
  const [templateErrors, setTemplateErrors] = useState<TemplateRowError[]>([]);
  const [templateErrorDialogOpen, setTemplateErrorDialogOpen] = useState(false);
  const [templateValidationResult, setTemplateValidationResult] = useState<TemplateValidationResult | null>(null);
  const [templateErrorFileName, setTemplateErrorFileName] = useState('');

  // ─── Commit rows to store (shared by both paths) ───────────────

  const commitImport = useCallback((rows: ImportRow[], fileId: string, fileName: string, mode: 'template' | 'ai') => {
    if (!projectId || rows.length === 0) return;

    const entries = rows.map((r, idx) => ({
      id: `e-${Date.now()}-${idx}`,
      date: r.date,
      reference: `JE-${String(idx + 1).padStart(3, '0')}`,
      description: r.description,
      accountCode: r.accountCode,
      accountName: r.accountName,
      debit: r.debit,
      credit: r.credit,
      isValidated: true,
      source: fileName,
    }));

    const accountMap = new Map<string, string>();
    for (const r of rows) {
      if (r.accountCode && r.accountCode !== '' && r.accountCode !== 'UNKNOWN') {
        accountMap.set(r.accountCode, r.accountName);
      }
    }

    const mappings = Array.from(accountMap.entries()).map(([code, name], idx) => ({
      id: `m-${Date.now()}-${idx}`,
      accountCode: code,
      accountName: name,
      suggestedCategory: '',
      confirmedCategory: '',
      type: 'asset' as const,
      isMapped: false,
    }));

    updateFileStatus(projectId, fileId, 'processed', entries.length);
    addProjectEntries(projectId, entries);
    mergeProjectMappings(projectId, mappings);
    learnAccountPatterns(projectId, Array.from(accountMap.entries()).map(([code, name]) => ({ code, name })));

    const label = mode === 'template' ? 'Imported using template (100% accurate)' : 'AI parsing applied — please review';
    toast.success(`✅ ${label} — ${entries.length} entries imported`, { duration: 5000 });
  }, [projectId, updateFileStatus, addProjectEntries, mergeProjectMappings, learnAccountPatterns]);

  // ─── Template import (strict deterministic path) ───────────────

  const handleTemplateImport = useCallback(async (file: globalThis.File, fileId: string) => {
    if (!projectId) return;

    setProcessingIds(prev => new Set(prev).add(fileId));
    updateFileStatus(projectId, fileId, 'processing');

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      const headers = Object.keys(rows[0] || {});

      const { isTemplate, mappedColumns } = detectTemplateMatch(headers);
      if (!isTemplate) {
        updateFileStatus(projectId, fileId, 'error');
        toast.error('Template structure mismatch. Expected columns: Date, Account Number, Account Name, Description, Debit, Credit.');
        return;
      }

      const result = validateAndParseTemplate(rows, mappedColumns);

      // Build import rows from all parsed entries (valid or not)
      const importRows: ImportRow[] = result.entries.map(e => ({
        date: e.date,
        accountCode: e.accountCode,
        accountName: e.accountName,
        description: e.description,
        debit: e.debit,
        credit: e.credit,
      }));

      if (importRows.length === 0) {
        updateFileStatus(projectId, fileId, 'error');
        toast.error('No entries found in template file.');
        return;
      }

      // Always open preview — no hard block
      setPreviewData({ rows: importRows, fileName: file.name, fileId, mode: 'template' });
    } catch (err) {
      updateFileStatus(projectId, fileId, 'error');
      toast.error(`Template import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(fileId);
        return next;
      });
    }
  }, [projectId, updateFileStatus]);

  // ─── Template-only upload ─────────────────────────────────────

  const handleTemplateUpload = useCallback(async (fileList: FileList) => {
    if (!projectId) return;

    for (const f of Array.from(fileList)) {
      const ext = f.name.split('.').pop()?.toLowerCase();
      const type = ext === 'pdf' ? 'pdf' : ext === 'csv' ? 'csv' : 'xlsx';
      const fileId = `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newFile: UploadedFile = {
        id: fileId, name: f.name, type, size: f.size,
        uploadedAt: new Date().toISOString().slice(0, 10),
        status: 'raw', entriesExtracted: 0,
      };
      addFile(projectId, newFile);
      setRawFiles(prev => new Map(prev).set(fileId, f));

      try {
        const buffer = await f.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const firstRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
        const headers = Object.keys(firstRows[0] || {});
        const { isTemplate } = detectTemplateMatch(headers);

        if (!isTemplate) {
          updateFileStatus(projectId, fileId, 'error');
          toast.error(`"${f.name}" does not match template format. Please use the template or upload via "Upload Any File".`, { duration: 7000 });
          continue;
        }

        await handleTemplateImport(f, fileId);
      } catch (err) {
        updateFileStatus(projectId, fileId, 'error');
        toast.error(`Failed to read ${f.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
  }, [projectId, addFile, updateFileStatus, handleTemplateImport]);

  // ─── AI parsing path ──────────────────────────────────────────

  const handleFiles = useCallback(async (fileList: FileList) => {
    if (!projectId) return;

    for (const f of Array.from(fileList)) {
      const ext = f.name.split('.').pop()?.toLowerCase();
      const type = ext === 'pdf' ? 'pdf' : ext === 'csv' ? 'csv' : 'xlsx';
      const fileId = `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newFile: UploadedFile = {
        id: fileId, name: f.name, type, size: f.size,
        uploadedAt: new Date().toISOString().slice(0, 10),
        status: 'raw', entriesExtracted: 0,
      };
      addFile(projectId, newFile);
      setRawFiles(prev => new Map(prev).set(fileId, f));

      if (type === 'xlsx' || type === 'csv') {
        try {
          const preview = await previewFile(f);

          // ── Transaction file detection ──────────────────────
          if (preview.headers.length > 0 && detectTransactionColumns(preview.headers)) {
            updateFileStatus(projectId, fileId, 'processing');
            const buffer = await f.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
            const headers = Object.keys(rawRows[0] || {});

            const findCol = (pats: RegExp[]) => headers.find(h => pats.some(p => p.test(h))) || '';
            const detectedColumns = {
              dateCol: findCol([/date/i]),
              descCol: findCol([/description|libell[eé]|label|memo/i]),
              amountCol: findCol([/amount|montant|total/i]),
              sourceCol: findCol([/account|compte|source/i]),
              entityCol: findCol([/entity|entit[eé]/i]),
              tvaCol: findCol([/tva|vat/i]),
            };

            // Open preview dialog instead of silent import
            setTxPreview({ rawRows, headers, fileName: f.name, fileId, detectedColumns });
            continue;
          }

          if (preview.structureType === 'report' && preview.headers.length === 0) {
            updateFileStatus(projectId, fileId, 'error');
            setPendingFile({ fileId, rawFile: f, preview });
            setDialogMode('report');
            continue;
          }

          if (preview.headers.length === 0) {
            updateFileStatus(projectId, fileId, 'error');
            toast.error(`No data found in ${f.name}`);
            continue;
          }

          const fpType = preview.structureType === 'report' ? 'tabular' as const : preview.structureType;
          const fpId = generateFileFingerprint(preview.headers, fpType);
          saveFileFingerprint(projectId, {
            id: fpId, structureType: fpType === 'hierarchical' ? 'hierarchical' : 'tabular',
            columnMapping: fpType === 'tabular' ? preview.suggestedMapping as unknown as Record<string, string | null> : undefined,
            matchCount: 1, lastUsed: Date.now(),
          });

          if (preview.structureType === 'report' && preview.reportInfo) {
            toast.info(`Report-style layout detected in ${f.name}. Data table was auto-extracted.`, { duration: 5000 });
          }

          if (preview.confidence < 0.7 && preview.structureType !== 'report') {
            toast.warning(`Low detection confidence for ${f.name}. Consider using the Excel template for reliable import.`, { duration: 7000 });
          }

          toast.info(`AI parsing applied to "${f.name}" — please review the results`, { duration: 5000 });

          setPendingFile({ fileId, rawFile: f, preview });
          setDialogMode(preview.structureType === 'report' ? 'tabular' : preview.structureType);
        } catch (err) {
          updateFileStatus(projectId, fileId, 'error');
          toast.error(`Failed to read ${f.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }
    }
  }, [projectId, addFile, updateFileStatus, saveFileFingerprint]);

  /** Open import preview for AI-parsed rows */
  const openImportPreview = (
    entries: { date: string; accountCode: string; accountName: string; description: string; debit: number; credit: number }[],
    fileId: string,
    fileName: string,
  ) => {
    const importRows: ImportRow[] = entries.map(e => ({
      date: e.date, accountCode: e.accountCode, accountName: e.accountName,
      description: e.description, debit: e.debit, credit: e.credit,
    }));
    setPreviewData({ rows: importRows, fileName, fileId, mode: 'ai' });
  };

  /** Score rows and open review dialog (kept for backward compat with existing AI flow) */
  const openReviewDialog = (
    entries: { date: string; accountCode: string; accountName: string; description: string; debit: number; credit: number }[],
    fileId: string,
    fileName: string,
  ) => {
    const scored: ScoredRow[] = entries.map((e, idx) => {
      const boost = pid ? getAccountConfidenceBoost(pid, e.accountCode) : 0;
      const confidence = computeRowConfidence(e, boost);
      return {
        rowIndex: idx, date: e.date, accountCode: e.accountCode, accountName: e.accountName,
        description: e.description, debit: e.debit, credit: e.credit,
        confidence, isValidated: confidence.level === 'high', isEdited: false,
      };
    });

    const allHigh = scored.every(r => r.confidence.level === 'high');
    if (allHigh && scored.length > 0) {
      // Still show preview before import
      openImportPreview(entries, fileId, fileName);
      return;
    }

    setReviewRows(scored);
    setReviewFileName(fileName);
    setReviewFileId(fileId);
  };

  /** Finalize import from ReviewValidationDialog (legacy AI scored flow) */
  const finalizeFromReview = (acceptedRows: ScoredRow[], corrections: CorrectionRecord[]) => {
    if (!projectId) return;
    const importRows: ImportRow[] = acceptedRows.map(r => ({
      date: r.date, accountCode: r.accountCode, accountName: r.accountName,
      description: r.description, debit: r.debit, credit: r.credit,
    }));
    // Open mandatory preview
    setPreviewData({ rows: importRows, fileName: reviewFileName, fileId: reviewFileId, mode: 'ai' });
    setReviewRows(null);

    if (corrections.length > 0) {
      recordBatchCorrections(projectId, corrections);
    }
  };

  /** Handle confirmed import from ImportPreviewDialog */
  const handlePreviewConfirm = (rows: ImportRow[], meta: { qualityScore: number; issuesDetected: number; issuesFixed: number }) => {
    if (!previewData || !projectId) return;
    commitImport(rows, previewData.fileId, previewData.fileName, previewData.mode);
    addImportMeta({
      id: `imp-${Date.now()}`,
      projectId,
      fileName: previewData.fileName,
      importDate: new Date().toISOString().slice(0, 10),
      importType: previewData.mode,
      qualityScore: meta.qualityScore,
      issuesDetected: meta.issuesDetected,
      issuesFixed: meta.issuesFixed,
      rowsImported: rows.length,
    });
    setPreviewData(null);
  };

  const handleMappingConfirm = async (mapping: ColumnMapping) => {
    if (!projectId || !pendingFile) return;
    const { fileId, rawFile } = pendingFile;
    closePending();

    setProcessingIds(prev => new Set(prev).add(fileId));
    updateFileStatus(projectId, fileId, 'processing');

    try {
      const result = await parseFileWithMapping(rawFile, mapping);
      if (result.entries.length === 0) {
        updateFileStatus(projectId, fileId, 'error');
        toast.error(`No valid entries found in ${rawFile.name}.`);
      } else {
        openReviewDialog(result.entries, fileId, rawFile.name);
      }
    } catch (err) {
      updateFileStatus(projectId, fileId, 'error');
      toast.error(`Failed to parse ${rawFile.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setProcessingIds(prev => { const next = new Set(prev); next.delete(fileId); return next; });
    }
  };

  const handleHierarchicalConfirm = (transactions: HierarchicalTransaction[], accounts: DetectedAccount[]) => {
    if (!projectId || !pendingFile) return;
    const { fileId, rawFile } = pendingFile;
    closePending();
    const result = hierarchicalToParseResult(transactions, accounts, rawFile.name);
    if (result.entries.length === 0) {
      updateFileStatus(projectId, fileId, 'error');
      toast.error(`No entries to import from ${rawFile.name}.`);
    } else {
      openReviewDialog(result.entries, fileId, rawFile.name);
    }
  };

  const handleFallbackToMapping = () => { setDialogMode('tabular'); };
  const closePending = () => { setPendingFile(null); setDialogMode(null); };

  // ─── Transaction preview confirm handler ───────────────────────
  const handleTxPreviewConfirm = useCallback((txs: Transaction[]) => {
    if (!projectId || !txPreview) return;
    addTransactions(projectId, txs);
    updateFileStatus(projectId, txPreview.fileId, 'processed', txs.length);
    toast.success(`${txs.length} transactions imported from "${txPreview.fileName}"`, { duration: 5000 });
    setTxPreview(null);
    navigate(`/project/${projectId}/transactions`);
  }, [projectId, txPreview, addTransactions, updateFileStatus, navigate]);

  // ─── Transaction template download ────────────────────────────
  const downloadTransactionTemplate = useCallback(() => {
    const wb = XLSX.utils.book_new();
    const data = [
      ['Date', 'Description', 'Amount', 'Source Account', 'Entity', 'TVA'],
      ['2024-01-15', 'URSSAF - Cotisations', '-3500', 'Banque Principale', 'Société A', '0'],
      ['2024-01-20', 'Facture client #1234', '12000', 'Banque Principale', 'Société A', '20'],
      ['2024-02-01', 'Loyer bureaux', '-2500', 'Banque Principale', 'Société A', '20'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 14 }, { wch: 30 }, { wch: 12 }, { wch: 20 }, { wch: 15 }, { wch: 6 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
    XLSX.writeFile(wb, 'transaction_template.xlsx');
    toast.success('Transaction template downloaded');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleReprocess = async (fileId: string) => {
    if (!projectId) return;
    const raw = rawFiles.get(fileId);
    if (!raw) { toast.error('Original file not available. Please re-upload.'); return; }
    try {
      const preview = await previewFile(raw);
      if (preview.structureType === 'report' && preview.headers.length === 0) {
        setPendingFile({ fileId, rawFile: raw, preview }); setDialogMode('report'); return;
      }
      if (preview.headers.length === 0) { toast.error('No data found in file.'); return; }
      setPendingFile({ fileId, rawFile: raw, preview });
      setDialogMode(preview.structureType === 'report' ? 'tabular' : preview.structureType);
    } catch { toast.error('Failed to read file.'); }
  };

  const handleDelete = (fileId: string) => {
    if (!projectId) return;
    deleteFile(projectId, fileId);
    setRawFiles(prev => { const next = new Map(prev); next.delete(fileId); return next; });
  };

  const fileIcon = (type: string) => {
    if (type === 'pdf') return <FileText className="h-4 w-4 text-destructive" />;
    if (type === 'xlsx') return <FileSpreadsheet className="h-4 w-4 text-success" />;
    return <File className="h-4 w-4 text-info" />;
  };

  const [importMenuOpen, setImportMenuOpen] = useState(false);

  // Mode selection only — no file picker
  const handleSelectGL = () => {
    setImportMenuOpen(false);
    setImportMode('gl');
  };

  const handleSelectTransactions = () => {
    setImportMenuOpen(false);
    setImportMode('tx');
  };

  const handleSelectAutoDetect = () => {
    setImportMenuOpen(false);
    // Auto-detect opens file picker immediately since it needs the file to determine mode
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = true; input.accept = '.xlsx,.xls,.csv';
    input.onchange = (e) => { const f = (e.target as HTMLInputElement).files; if (f) handleFiles(f); };
    input.click();
  };

  // Explicit upload triggers — only called when user clicks "Upload" button
  const triggerGLUpload = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = true; input.accept = '.xlsx,.xls,.csv';
    input.onchange = (e) => { const f = (e.target as HTMLInputElement).files; if (f) handleTemplateUpload(f); };
    input.click();
  };

  const triggerTxUpload = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = true; input.accept = '.xlsx,.xls,.csv';
    input.onchange = (e) => { const f = (e.target as HTMLInputElement).files; if (f) handleFiles(f); };
    input.click();
  };

  // Handle sidebar import triggers via query param — only set mode
  useEffect(() => {
    const importFlow = searchParams.get('import');
    if (!importFlow) return;
    setSearchParams({}, { replace: true });
    if (importFlow === 'gl') setImportMode('gl');
    else if (importFlow === 'tx') setImportMode('tx');
    else if (importFlow === 'auto') handleSelectAutoDetect();
  }, [searchParams]);

  // Filter files by mode
  const glFiles = files.filter(f => {
    // Files uploaded via GL template path are considered GL
    // For simplicity, all files show in their respective mode
    return true;
  });

  const modeTitle = importMode === 'gl' ? 'Import General Ledger' : importMode === 'tx' ? 'Import Transactions' : 'Data Center';
  const modeSubtitle = importMode === 'gl'
    ? 'Upload structured accounting data with debit/credit entries'
    : importMode === 'tx'
    ? 'Upload bank or operational data to categorize and enrich'
    : 'Import, manage, and prepare your financial data';

  return (
    <div>
      {/* ─── Header ───────────────────────────────────────────────── */}
      <div className="page-header flex items-center justify-between">
        <div className="flex items-center gap-3">
          {importMode && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setImportMode(null)}
              className="gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="page-title">{modeTitle}</h1>
              {importMode && (
                <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full leading-none ${
                  importMode === 'gl'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-info/10 text-info'
                }`}>
                  {importMode === 'gl' ? 'General Ledger' : 'Transactions'}
                </span>
              )}
            </div>
            <p className="page-subtitle">{modeSubtitle}</p>
          </div>
        </div>

        {/* Import button — only show when mode is selected or no mode */}
        {importMode ? (
          <div className="flex items-center gap-2">
            {importMode === 'gl' && (
              <>
                <Button variant="outline" size="sm" onClick={downloadTemplate}>
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Download GL Template
                </Button>
                <Button size="sm" className="gap-1.5" onClick={triggerGLUpload}>
                  <Plus className="h-3.5 w-3.5" />
                  Upload GL File
                </Button>
              </>
            )}
            {importMode === 'tx' && (
              <>
                <Button variant="outline" size="sm" onClick={downloadTransactionTemplate}>
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Download TX Template
                </Button>
                <Button size="sm" className="gap-1.5" onClick={triggerTxUpload}>
                  <Plus className="h-3.5 w-3.5" />
                  Upload Transactions
                </Button>
              </>
            )}
          </div>
        ) : (
          <Popover open={importMenuOpen} onOpenChange={setImportMenuOpen}>
            <PopoverTrigger asChild>
              <Button size="lg" className="gap-2">
                <Plus className="h-4 w-4" />
                Import Data
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={8} className="w-[380px] rounded-xl p-0 border-border shadow-lg">
              <div className="px-4 pt-4 pb-2">
                <p className="text-sm font-semibold text-foreground">Import your data</p>
                <p className="text-xs text-muted-foreground mt-0.5">Choose the format that matches your file</p>
              </div>
              <div className="px-2 pb-2 space-y-0.5">
                <button
                  onClick={triggerGLUpload}
                  className="w-full flex items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-accent/50 group"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 group-hover:bg-primary/15 transition-colors">
                    <BookOpen className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">General Ledger (GL)</span>
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded-full leading-none">Recommended</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      Structured accounting data with debit/credit — Sage, Pennylane exports
                    </p>
                  </div>
                </button>
                <button
                  onClick={triggerTxUpload}
                  className="w-full flex items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-accent/50 group"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-info/10 group-hover:bg-info/15 transition-colors">
                    <CreditCard className="h-4 w-4 text-info" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground">Transactions</span>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      Bank or operational data (CSV, Qonto, Excel) — auto-categorize into Poste, P&L, Treasury
                    </p>
                  </div>
                </button>
                <div className="border-t border-border mx-1 my-1" />
                <button
                  onClick={handleSelectAutoDetect}
                  className="w-full flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent/50 group"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted group-hover:bg-muted/80 transition-colors">
                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground">Not sure? Auto-detect</span>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      Upload your file and we'll determine the format automatically
                    </p>
                  </div>
                </button>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* ─── Mode Selection (when no mode) ───────────────────────── */}
      {!importMode && files.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <button
            onClick={() => { setImportMode('gl'); }}
            className="group flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6 text-left transition-all hover:border-primary/40 hover:shadow-md"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 group-hover:bg-primary/15 transition-colors">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">General Ledger (GL)</p>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                Import structured accounting data with debit/credit entries from Sage, Pennylane, or similar tools.
              </p>
            </div>
            <span className="text-[9px] font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full">Recommended</span>
          </button>

          <button
            onClick={() => { setImportMode('tx'); }}
            className="group flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6 text-left transition-all hover:border-info/40 hover:shadow-md"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-info/10 group-hover:bg-info/15 transition-colors">
              <CreditCard className="h-5 w-5 text-info" />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">Transactions</p>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                Import bank or operational data (CSV, Qonto, Excel) and categorize into Poste, P&L, and Treasury.
              </p>
            </div>
          </button>
        </div>
      )}

      {/* ─── GL Mode: Empty State ────────────────────────────────── */}
      {importMode === 'gl' && files.length === 0 && (
        <div
          className={`border-2 border-dashed rounded-xl p-12 text-center mb-6 transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-border'}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) handleTemplateUpload(e.dataTransfer.files); }}
        >
          <BookOpen className="h-10 w-10 text-primary/60 mx-auto mb-3" />
          <p className="text-base font-semibold text-foreground mb-1">Upload your General Ledger</p>
          <p className="text-sm text-muted-foreground mb-4">
            Drag & drop your GL export here, or use the buttons above
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="h-3.5 w-3.5 mr-1" />
              Download GL Template
            </Button>
            <Button size="sm" onClick={triggerGLUpload}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Upload GL File
            </Button>
          </div>
        </div>
      )}

      {/* ─── TX Mode: Empty State ────────────────────────────────── */}
      {importMode === 'tx' && files.length === 0 && (
        <div
          className={`border-2 border-dashed rounded-xl p-12 text-center mb-6 transition-colors ${dragOver ? 'border-info bg-info/5' : 'border-border'}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); }}
        >
          <CreditCard className="h-10 w-10 text-info/60 mx-auto mb-3" />
          <p className="text-base font-semibold text-foreground mb-1">Upload your Transactions</p>
          <p className="text-sm text-muted-foreground mb-4">
            Drag & drop bank exports, CSV, or Excel files here
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" size="sm" onClick={downloadTransactionTemplate}>
              <Download className="h-3.5 w-3.5 mr-1" />
              Download TX Template
            </Button>
            <Button size="sm" onClick={triggerTxUpload}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Upload Transactions
            </Button>
          </div>
        </div>
      )}

      {/* ─── No mode selected but has files ──────────────────────── */}
      {!importMode && files.length > 0 && (
        <div
          className={`border-2 border-dashed rounded-xl p-6 text-center mb-6 transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-border'}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-1" />
          <p className="text-xs text-muted-foreground">
            Drag & drop additional files here — we'll auto-detect the format
          </p>
        </div>
      )}

      {/* ─── Drag Zone (when mode is set and files exist) ────────── */}
      {importMode && files.length > 0 && (
        <div
          className={`border-2 border-dashed rounded-xl p-6 text-center mb-6 transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-border'}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault(); setDragOver(false);
            if (e.dataTransfer.files.length) {
              if (importMode === 'gl') handleTemplateUpload(e.dataTransfer.files);
              else handleFiles(e.dataTransfer.files);
            }
          }}
        >
          <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-1" />
          <p className="text-xs text-muted-foreground">
            Drag & drop additional {importMode === 'gl' ? 'GL' : 'transaction'} files here
          </p>
        </div>
      )}

      {/* ─── File Table ─────────────────────────────────────────── */}
      {files.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Type</th>
                <th>Size</th>
                <th>Uploaded</th>
                <th>Status</th>
                <th>Entries</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id}>
                  <td className="flex items-center gap-2 font-medium">{fileIcon(f.type)}{f.name}</td>
                  <td className="uppercase text-xs text-muted-foreground">{f.type}</td>
                  <td className="text-muted-foreground mono text-xs">{(f.size / 1024).toFixed(0)} KB</td>
                  <td className="text-muted-foreground text-xs">{f.uploadedAt}</td>
                  <td>
                    {processingIds.has(f.id) ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Processing…
                      </span>
                    ) : (
                      <StatusBadge status={f.status} />
                    )}
                  </td>
                  <td className="mono">{f.entriesExtracted}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      {(f.status === 'raw' || f.status === 'error') && (f.type === 'xlsx' || f.type === 'csv') && (
                        <Button variant="ghost" size="sm" onClick={() => handleReprocess(f.id)} disabled={processingIds.has(f.id)}>
                          <RefreshCw className="h-3 w-3 mr-1" />Process
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(f.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* GL Dialogs */}
      {pendingFile && dialogMode === 'tabular' && (
        <ColumnMappingDialog open onOpenChange={(open) => { if (!open) closePending(); }}
          preview={pendingFile.preview} onConfirm={handleMappingConfirm} />
      )}

      {pendingFile && dialogMode === 'hierarchical' && pendingFile.preview.hierarchicalResult && (
        <HierarchicalPreviewDialog open onOpenChange={(open) => { if (!open) closePending(); }}
          result={pendingFile.preview.hierarchicalResult} fileName={pendingFile.preview.fileName}
          onConfirm={handleHierarchicalConfirm} onFallbackToMapping={handleFallbackToMapping} />
      )}

      {pendingFile && dialogMode === 'report' && (
        <Dialog open onOpenChange={(open) => { if (!open) closePending(); }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning" />
                Report-Style File Detected
              </DialogTitle>
              <DialogDescription>
                This file appears to be a formatted report, not a data export.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Unable to extract structured data</AlertTitle>
                <AlertDescription>
                  The file contains visual formatting (titles, merged cells, inconsistent columns) that prevents reliable data extraction.
                </AlertDescription>
              </Alert>
              {pendingFile.preview.reportInfo && pendingFile.preview.reportInfo.reasons.length > 0 && (
                <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
                  <p className="font-medium text-muted-foreground">Detection details:</p>
                  <ul className="list-disc list-inside text-muted-foreground">
                    {pendingFile.preview.reportInfo.reasons.map((r, i) => (<li key={i}>{r}</li>))}
                  </ul>
                </div>
              )}
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-sm">
                <p className="font-medium text-foreground mb-1 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Use our Excel template
                </p>
                <p className="text-muted-foreground mb-2">
                  Download the structured template, paste your data, and re-upload for a reliable import.
                </p>
                <Button variant="outline" size="sm" onClick={downloadTemplate}>
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Download Template
                </Button>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => {
                if (pendingFile.preview.headers.length > 0) { setDialogMode('tabular'); }
                else { closePending(); toast.error('No columns could be detected. Please upload a structured export.'); }
              }}>
                Try Manual Mapping
              </Button>
              <Button variant="default" onClick={closePending}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {reviewRows && (
        <ReviewValidationDialog open onOpenChange={(open) => { if (!open) setReviewRows(null); }}
          scoredRows={reviewRows} fileName={reviewFileName} onConfirm={finalizeFromReview} />
      )}

      {previewData && (
        <ImportPreviewDialog
          open
          onOpenChange={(open) => { if (!open) setPreviewData(null); }}
          rows={previewData.rows}
          fileName={previewData.fileName}
          mode={previewData.mode}
          onConfirm={handlePreviewConfirm}
        />
      )}

      {txPreview && (
        <TransactionPreviewDialog
          open
          onOpenChange={(open) => { if (!open) setTxPreview(null); }}
          rawRows={txPreview.rawRows}
          headers={txPreview.headers}
          fileName={txPreview.fileName}
          detectedColumns={txPreview.detectedColumns}
          learnedPatterns={useTransactionStore.getState().getLearnedPatterns(pid)}
          onConfirm={handleTxPreviewConfirm}
        />
      )}

      {templateErrorDialogOpen && templateErrors.length > 0 && (
        <Dialog open onOpenChange={(open) => { if (!open) { setTemplateErrorDialogOpen(false); setTemplateErrors([]); setTemplateValidationResult(null); } }}>
          <DialogContent className="sm:max-w-lg max-h-[80vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-destructive" />
                Import Blocked — {templateErrors.length} Error{templateErrors.length > 1 ? 's' : ''} Found
              </DialogTitle>
              <DialogDescription>
                Fix the following errors in <span className="font-medium">{templateErrorFileName}</span> and re-upload.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {templateValidationResult && (
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{templateValidationResult.totalRows} data row{templateValidationResult.totalRows !== 1 ? 's' : ''} scanned</span>
                  <span className="text-destructive font-medium">{templateErrors.length} error{templateErrors.length > 1 ? 's' : ''}</span>
                  {templateValidationResult.skippedEmpty > 0 && (
                    <span>{templateValidationResult.skippedEmpty} empty row{templateValidationResult.skippedEmpty !== 1 ? 's' : ''} skipped</span>
                  )}
                </div>
              )}
              <div className="max-h-60 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                {templateErrors.map((err, i) => (
                  <div key={i} className="flex items-start gap-2 px-3 py-2 text-sm">
                    <span className="text-destructive font-mono text-xs shrink-0 mt-0.5">Row {err.row}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground text-xs font-medium shrink-0">{err.field}</span>
                    <span className="text-foreground text-xs">{err.message}</span>
                  </div>
                ))}
              </div>
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>How to fix</AlertTitle>
                <AlertDescription className="text-xs">
                  Open your file, correct the highlighted rows, and re-upload. All dates must be valid (YYYY-MM-DD or DD/MM/YYYY), amounts must be numeric, and every row needs an account number with at least one non-zero debit or credit.
                </AlertDescription>
              </Alert>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="h-3.5 w-3.5 mr-1" />
                Download Template
              </Button>
              <Button variant="default" onClick={() => { setTemplateErrorDialogOpen(false); setTemplateErrors([]); setTemplateValidationResult(null); }}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
