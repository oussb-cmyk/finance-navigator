import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Upload, FileText, FileSpreadsheet, File, Trash2, RefreshCw, Loader2 } from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { previewFile, parseFileWithMapping } from '@/lib/fileParser';
import type { PreviewData, ColumnMapping } from '@/lib/fileParser';
import { ColumnMappingDialog } from '@/components/workspace/ColumnMappingDialog';
import { toast } from 'sonner';
import type { UploadedFile } from '@/types/finance';

interface PendingFile {
  fileId: string;
  rawFile: globalThis.File;
  preview: PreviewData;
}

export default function DataCenterPage() {
  const { projectId } = useParams();
  const files = useProjectStore((s) => s.getProjectFiles(projectId || ''));
  const addFile = useProjectStore((s) => s.addFile);
  const updateFileStatus = useProjectStore((s) => s.updateFileStatus);
  const deleteFile = useProjectStore((s) => s.deleteFile);
  const addProjectEntries = useProjectStore((s) => s.addProjectEntries);
  const mergeProjectMappings = useProjectStore((s) => s.mergeProjectMappings);
  const [dragOver, setDragOver] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [rawFiles, setRawFiles] = useState<Map<string, globalThis.File>>(new Map());
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);

  const handleFiles = useCallback(async (fileList: FileList) => {
    if (!projectId) return;

    for (const f of Array.from(fileList)) {
      const ext = f.name.split('.').pop()?.toLowerCase();
      const type = ext === 'pdf' ? 'pdf' : ext === 'csv' ? 'csv' : 'xlsx';
      const fileId = `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newFile: UploadedFile = {
        id: fileId,
        name: f.name,
        type,
        size: f.size,
        uploadedAt: new Date().toISOString().slice(0, 10),
        status: 'raw',
        entriesExtracted: 0,
      };
      addFile(projectId, newFile);
      setRawFiles(prev => new Map(prev).set(fileId, f));

      if (type === 'xlsx' || type === 'csv') {
        try {
          const preview = await previewFile(f);
          if (preview.headers.length === 0) {
            updateFileStatus(projectId, fileId, 'error');
            toast.error(`No data found in ${f.name}`);
            continue;
          }
          setPendingFile({ fileId, rawFile: f, preview });
        } catch (err) {
          updateFileStatus(projectId, fileId, 'error');
          toast.error(`Failed to read ${f.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }
    }
  }, [projectId, addFile, updateFileStatus]);

  const handleMappingConfirm = async (mapping: ColumnMapping) => {
    if (!projectId || !pendingFile) return;
    const { fileId, rawFile } = pendingFile;
    setPendingFile(null);

    setProcessingIds(prev => new Set(prev).add(fileId));
    updateFileStatus(projectId, fileId, 'processing');

    try {
      const result = await parseFileWithMapping(rawFile, mapping);
      if (result.entries.length === 0) {
        updateFileStatus(projectId, fileId, 'error');
        toast.error(`No valid entries found in ${rawFile.name}. Check your column mapping.`);
      } else {
        updateFileStatus(projectId, fileId, 'processed', result.entriesExtracted);
        addProjectEntries(projectId, result.entries);
        mergeProjectMappings(projectId, result.mappings);
        toast.success(`Extracted ${result.entriesExtracted} entries and ${result.mappings.length} accounts from ${rawFile.name}`);
      }
    } catch (err) {
      updateFileStatus(projectId, fileId, 'error');
      toast.error(`Failed to parse ${rawFile.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(fileId);
        return next;
      });
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleReprocess = async (fileId: string) => {
    if (!projectId) return;
    const raw = rawFiles.get(fileId);
    if (!raw) {
      toast.error('Original file not available. Please re-upload.');
      return;
    }
    try {
      const preview = await previewFile(raw);
      if (preview.headers.length === 0) {
        toast.error('No data found in file.');
        return;
      }
      setPendingFile({ fileId, rawFile: raw, preview });
    } catch {
      toast.error('Failed to read file.');
    }
  };

  const handleDelete = (fileId: string) => {
    if (!projectId) return;
    deleteFile(projectId, fileId);
    setRawFiles(prev => {
      const next = new Map(prev);
      next.delete(fileId);
      return next;
    });
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
        <p className="page-subtitle">Upload financial files — you'll map columns before processing</p>
      </div>

      <div
        className={`border-2 border-dashed rounded-xl p-12 text-center mb-6 transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-border'}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm font-medium text-foreground mb-1">Drag & drop files here</p>
        <p className="text-xs text-muted-foreground mb-4">Excel (.xlsx, .xls) and CSV — you'll confirm column mapping before import</p>
        <Button variant="outline" size="sm" onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.multiple = true;
          input.accept = '.pdf,.xlsx,.xls,.csv';
          input.onchange = (e) => {
            const f = (e.target as HTMLInputElement).files;
            if (f) handleFiles(f);
          };
          input.click();
        }}>
          Browse Files
        </Button>
      </div>

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

      {pendingFile && (
        <ColumnMappingDialog
          open={!!pendingFile}
          onOpenChange={(open) => { if (!open) setPendingFile(null); }}
          preview={pendingFile.preview}
          onConfirm={handleMappingConfirm}
        />
      )}
    </div>
  );
}
