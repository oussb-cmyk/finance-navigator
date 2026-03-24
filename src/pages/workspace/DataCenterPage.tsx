import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Upload, FileText, FileSpreadsheet, File, Trash2, RefreshCw } from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import type { UploadedFile } from '@/types/finance';

export default function DataCenterPage() {
  const { projectId } = useParams();
  const files = useProjectStore((s) => s.getProjectFiles(projectId || ''));
  const addFile = useProjectStore((s) => s.addFile);
  const updateFileStatus = useProjectStore((s) => s.updateFileStatus);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback((fileList: FileList) => {
    if (!projectId) return;
    Array.from(fileList).forEach((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase();
      const type = ext === 'pdf' ? 'pdf' : ext === 'csv' ? 'csv' : 'xlsx';
      const newFile: UploadedFile = {
        id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: f.name,
        type,
        size: f.size,
        uploadedAt: new Date().toISOString().slice(0, 10),
        status: 'raw',
        entriesExtracted: 0,
      };
      addFile(projectId, newFile);
    });
  }, [projectId, addFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const processFile = (fileId: string) => {
    if (!projectId) return;
    updateFileStatus(projectId, fileId, 'processing');
    setTimeout(() => updateFileStatus(projectId, fileId, 'processed'), 1500);
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
        <p className="page-subtitle">Upload and manage financial data files</p>
      </div>

      <div
        className={`border-2 border-dashed rounded-xl p-12 text-center mb-6 transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-border'}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm font-medium text-foreground mb-1">Drag & drop files here</p>
        <p className="text-xs text-muted-foreground mb-4">PDF, Excel, CSV files supported</p>
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
                  <td><StatusBadge status={f.status} /></td>
                  <td className="mono">{f.entriesExtracted}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      {f.status === 'raw' && (
                        <Button variant="ghost" size="sm" onClick={() => processFile(f.id)}>
                          <RefreshCw className="h-3 w-3 mr-1" />Process
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
