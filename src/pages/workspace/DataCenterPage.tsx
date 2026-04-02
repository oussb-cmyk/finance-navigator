import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Upload, FileText, FileSpreadsheet, File, Trash2, RefreshCw, Loader2, AlertTriangle, Download, ShieldCheck, Sparkles, CheckCircle2, XCircle } from 'lucide-react';
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
import type { ImportRow } from '@/lib/dataQuality';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
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

  const [dragOver, setDragOver] = useState(false);
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

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Data Center</h1>
        <p className="page-subtitle">Upload financial files — use our template for best results, or let AI parse any format</p>
      </div>

      {/* ─── Dual Import Mode Cards ─────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Mode 1: Template (recommended) */}
        <div className="relative bg-card border-2 border-primary/30 rounded-xl p-6 flex flex-col">
          <span className="absolute -top-2.5 left-4 bg-primary text-primary-foreground text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full">
            Recommended
          </span>
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-foreground">Upload Your Data (Recommended)</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-1 flex-1">
            Use our template for accurate and reliable data import
          </p>
          <p className="text-[10px] text-primary font-medium mb-3">✓ This method guarantees 100% accurate import — no AI, no guessing</p>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="h-3.5 w-3.5 mr-1" />
                Download Template
              </Button>
              <Button size="sm" onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.xlsx,.xls,.csv';
                input.onchange = (e) => {
                  const f = (e.target as HTMLInputElement).files;
                  if (f) handleTemplateUpload(f);
                };
                input.click();
              }}>
                Upload Data
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">Make sure your file follows the template format</p>
          </div>
        </div>

        {/* Mode 2: Any file (AI) */}
        <div className="bg-card border border-border rounded-xl p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-5 w-5 text-warning" />
            <h3 className="font-semibold text-foreground">Upload Any File</h3>
            <span className="text-[10px] font-medium uppercase tracking-wider text-warning bg-warning/10 px-1.5 py-0.5 rounded">Beta</span>
          </div>
          <p className="text-xs text-muted-foreground mb-4 flex-1">
            Upload Excel or CSV in any format. AI will auto-detect structure, but results may require manual review.
          </p>
          <Button variant="outline" size="sm" className="self-start" onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.multiple = true;
            input.accept = '.xlsx,.xls,.csv';
            input.onchange = (e) => {
              const f = (e.target as HTMLInputElement).files;
              if (f) handleFiles(f);
            };
            input.click();
          }}>
            Browse Files
          </Button>
        </div>
      </div>

      {/* ─── Drag & Drop Zone ───────────────────────────────────── */}
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center mb-6 transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-border'}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm font-medium text-foreground mb-1">Drag & drop files here</p>
        <p className="text-xs text-muted-foreground">
          Excel (.xlsx, .xls) and CSV — template files are imported directly, other formats use AI parsing
        </p>
        <p className="text-xs text-primary mt-2 font-medium">
          💡 Tip: Use our template for best results
        </p>
      </div>

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

      {/* Tabular mode: Column mapping dialog */}
      {pendingFile && dialogMode === 'tabular' && (
        <ColumnMappingDialog open onOpenChange={(open) => { if (!open) closePending(); }}
          preview={pendingFile.preview} onConfirm={handleMappingConfirm} />
      )}

      {/* Hierarchical mode */}
      {pendingFile && dialogMode === 'hierarchical' && pendingFile.preview.hierarchicalResult && (
        <HierarchicalPreviewDialog open onOpenChange={(open) => { if (!open) closePending(); }}
          result={pendingFile.preview.hierarchicalResult} fileName={pendingFile.preview.fileName}
          onConfirm={handleHierarchicalConfirm} onFallbackToMapping={handleFallbackToMapping} />
      )}

      {/* Report-style file warning dialog */}
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

      {/* Review & Validation dialog (AI scoring) */}
      {reviewRows && (
        <ReviewValidationDialog open onOpenChange={(open) => { if (!open) setReviewRows(null); }}
          scoredRows={reviewRows} fileName={reviewFileName} onConfirm={finalizeFromReview} />
      )}

      {/* ★ Mandatory Import Preview Dialog */}
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

      {/* Template validation errors dialog */}
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
