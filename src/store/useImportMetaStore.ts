import { create } from 'zustand';

export interface ImportMeta {
  id: string;
  projectId: string;
  fileName: string;
  importDate: string;
  importType: 'template' | 'ai';
  qualityScore: number;
  issuesDetected: number;
  issuesFixed: number;
  rowsImported: number;
}

interface ImportMetaStore {
  imports: Record<string, ImportMeta[]>; // keyed by projectId
  addImport: (meta: ImportMeta) => void;
  getImports: (projectId: string) => ImportMeta[];
  getReliabilityScore: (projectId: string) => { score: number; lastImportDate: string | null };
}

const EMPTY_IMPORTS: ImportMeta[] = [];

export const useImportMetaStore = create<ImportMetaStore>((set, get) => ({
  imports: {},

  addImport: (meta) => set((s) => ({
    imports: {
      ...s.imports,
      [meta.projectId]: [...(s.imports[meta.projectId] || []), meta],
    },
  })),

  getImports: (projectId) => get().imports[projectId] || EMPTY_IMPORTS,

  getReliabilityScore: (projectId) => {
    const metas = get().imports[projectId] || [];
    if (metas.length === 0) return { score: 0, lastImportDate: null };

    // Weighted average: recent imports count more
    const totalWeight = metas.reduce((sum, _, i) => sum + (i + 1), 0);
    const weightedScore = metas.reduce((sum, m, i) => sum + m.qualityScore * (i + 1), 0);
    const score = Math.round(weightedScore / totalWeight);
    const lastImportDate = metas[metas.length - 1].importDate;

    return { score, lastImportDate };
  },
}));
