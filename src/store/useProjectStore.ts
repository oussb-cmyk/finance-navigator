import { create } from 'zustand';
import type { Project, UploadedFile, AccountMapping, JournalEntry } from '@/types/finance';

// Stable empty arrays to prevent infinite re-renders from Zustand selectors
const EMPTY_FILES: UploadedFile[] = [];
const EMPTY_MAPPINGS: AccountMapping[] = [];
const EMPTY_ENTRIES: JournalEntry[] = [];

interface ProjectStore {
  projects: Project[];
  currentProjectId: string | null;
  files: Record<string, UploadedFile[]>;
  mappings: Record<string, AccountMapping[]>;
  entries: Record<string, JournalEntry[]>;
  
  setCurrentProject: (id: string | null) => void;
  addProject: (project: Project) => void;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  addFile: (projectId: string, file: UploadedFile) => void;
  updateFileStatus: (projectId: string, fileId: string, status: UploadedFile['status'], entriesExtracted?: number) => void;
  updateMapping: (projectId: string, mappingId: string, category: string) => void;
  addEntry: (projectId: string, entry: JournalEntry) => void;
  deleteEntry: (projectId: string, entryId: string) => void;
  setProjectEntries: (projectId: string, entries: JournalEntry[]) => void;
  addProjectEntries: (projectId: string, entries: JournalEntry[]) => void;
  setProjectMappings: (projectId: string, mappings: AccountMapping[]) => void;
  mergeProjectMappings: (projectId: string, mappings: AccountMapping[]) => void;
  deleteFile: (projectId: string, fileId: string) => void;
  toggleEntryValidation: (projectId: string, entryId: string) => void;
  validateAllEntries: (projectId: string) => void;

  // Stable selectors
  getFiles: (projectId: string) => UploadedFile[];
  getMappings: (projectId: string) => AccountMapping[];
  getEntries: (projectId: string) => JournalEntry[];
}

const DEMO_PROJECT_ID = 'demo-1';

const demoProject: Project = {
  id: DEMO_PROJECT_ID,
  name: 'FY 2024 Audit',
  company: 'Acme Corp',
  activity: 'SaaS',
  currency: 'USD',
  fiscalYearEnd: '2024-12-31',
  createdAt: '2024-01-15',
  updatedAt: '2024-03-20',
  status: 'active',
  filesCount: 4,
  entriesCount: 48,
  unmappedAccounts: 3,
};

const demoProject2: Project = {
  id: 'demo-2',
  name: 'Q1 2024 Review',
  company: 'Globex Inc',
  activity: 'Consulting',
  currency: 'EUR',
  fiscalYearEnd: '2024-03-31',
  createdAt: '2024-02-01',
  updatedAt: '2024-03-18',
  status: 'active',
  filesCount: 2,
  entriesCount: 24,
  unmappedAccounts: 0,
};

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [demoProject, demoProject2],
  currentProjectId: null,
  files: { [DEMO_PROJECT_ID]: [], 'demo-2': [] },
  mappings: { [DEMO_PROJECT_ID]: [], 'demo-2': [] },
  entries: { [DEMO_PROJECT_ID]: [], 'demo-2': [] },

  setCurrentProject: (id) => {
    if (get().currentProjectId !== id) {
      set({ currentProjectId: id });
    }
  },

  addProject: (project) => set((s) => ({
    projects: [...s.projects, project],
    files: { ...s.files, [project.id]: [] },
    mappings: { ...s.mappings, [project.id]: [] },
    entries: { ...s.entries, [project.id]: [] },
  })),

  updateProject: (id, patch) => set((s) => ({
    projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString().slice(0, 10) } : p)),
  })),

  deleteProject: (id) => set((s) => ({
    projects: s.projects.filter((p) => p.id !== id),
    currentProjectId: s.currentProjectId === id ? null : s.currentProjectId,
  })),

  addFile: (projectId, file) => set((s) => ({
    files: { ...s.files, [projectId]: [...(s.files[projectId] || []), file] },
  })),

  updateFileStatus: (projectId, fileId, status, entriesExtracted) => set((s) => ({
    files: {
      ...s.files,
      [projectId]: (s.files[projectId] || []).map((f) =>
        f.id === fileId ? { ...f, status, ...(entriesExtracted !== undefined ? { entriesExtracted } : {}) } : f
      ),
    },
  })),

  deleteFile: (projectId, fileId) => set((s) => ({
    files: {
      ...s.files,
      [projectId]: (s.files[projectId] || []).filter((f) => f.id !== fileId),
    },
  })),

  setProjectEntries: (projectId, entries) => set((s) => ({
    entries: { ...s.entries, [projectId]: entries },
  })),

  addProjectEntries: (projectId, entries) => set((s) => ({
    entries: { ...s.entries, [projectId]: [...(s.entries[projectId] || []), ...entries] },
  })),

  setProjectMappings: (projectId, mappings) => set((s) => ({
    mappings: { ...s.mappings, [projectId]: mappings },
  })),

  mergeProjectMappings: (projectId, newMappings) => set((s) => {
    const existing = s.mappings[projectId] || [];
    const existingCodes = new Set(existing.map(m => m.accountCode));
    const toAdd = newMappings.filter(m => !existingCodes.has(m.accountCode));
    return { mappings: { ...s.mappings, [projectId]: [...existing, ...toAdd] } };
  }),

  updateMapping: (projectId, mappingId, category) => set((s) => ({
    mappings: {
      ...s.mappings,
      [projectId]: (s.mappings[projectId] || []).map((m) =>
        m.id === mappingId ? { ...m, confirmedCategory: category, isMapped: true } : m
      ),
    },
  })),

  addEntry: (projectId, entry) => set((s) => ({
    entries: { ...s.entries, [projectId]: [...(s.entries[projectId] || []), entry] },
  })),

  deleteEntry: (projectId, entryId) => set((s) => ({
    entries: {
      ...s.entries,
      [projectId]: (s.entries[projectId] || []).filter((e) => e.id !== entryId),
    },
  })),

  toggleEntryValidation: (projectId, entryId) => set((s) => ({
    entries: {
      ...s.entries,
      [projectId]: (s.entries[projectId] || []).map((e) =>
        e.id === entryId ? { ...e, isValidated: !e.isValidated } : e
      ),
    },
  })),

  validateAllEntries: (projectId) => set((s) => ({
    entries: {
      ...s.entries,
      [projectId]: (s.entries[projectId] || []).map((e) => ({ ...e, isValidated: true })),
    },
  })),

  // Stable selectors that return the same reference for missing keys
  getFiles: (projectId) => get().files[projectId] || EMPTY_FILES,
  getMappings: (projectId) => get().mappings[projectId] || EMPTY_MAPPINGS,
  getEntries: (projectId) => get().entries[projectId] || EMPTY_ENTRIES,
}));
