import { create } from 'zustand';
import type { Project, UploadedFile, AccountMapping, JournalEntry } from '@/types/finance';

interface ProjectStore {
  projects: Project[];
  currentProjectId: string | null;
  files: Record<string, UploadedFile[]>;
  mappings: Record<string, AccountMapping[]>;
  entries: Record<string, JournalEntry[]>;
  
  setCurrentProject: (id: string | null) => void;
  addProject: (project: Project) => void;
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

  getCurrentProject: () => Project | undefined;
  getProjectFiles: (projectId: string) => UploadedFile[];
  getProjectMappings: (projectId: string) => AccountMapping[];
  getProjectEntries: (projectId: string) => JournalEntry[];
}

const DEMO_PROJECT_ID = 'demo-1';

const demoProject: Project = {
  id: DEMO_PROJECT_ID,
  name: 'FY 2024 Audit',
  company: 'Acme Corp',
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
  currency: 'EUR',
  fiscalYearEnd: '2024-03-31',
  createdAt: '2024-02-01',
  updatedAt: '2024-03-18',
  status: 'active',
  filesCount: 2,
  entriesCount: 24,
  unmappedAccounts: 0,
};

const demoFiles: UploadedFile[] = [
  { id: 'f1', name: 'general_ledger_2024.xlsx', type: 'xlsx', size: 245000, uploadedAt: '2024-01-15', status: 'validated', entriesExtracted: 32 },
  { id: 'f2', name: 'bank_statement_jan.pdf', type: 'pdf', size: 128000, uploadedAt: '2024-02-01', status: 'processed', entriesExtracted: 12 },
  { id: 'f3', name: 'invoices_q1.csv', type: 'csv', size: 56000, uploadedAt: '2024-02-15', status: 'processed', entriesExtracted: 4 },
  { id: 'f4', name: 'expenses_feb.pdf', type: 'pdf', size: 89000, uploadedAt: '2024-03-01', status: 'raw', entriesExtracted: 0 },
];

const demoMappings: AccountMapping[] = [
  { id: 'm1', accountCode: '1000', accountName: 'Cash & Equivalents', suggestedCategory: 'Current Assets', confirmedCategory: 'Current Assets', type: 'asset', isMapped: true },
  { id: 'm2', accountCode: '1100', accountName: 'Accounts Receivable', suggestedCategory: 'Current Assets', confirmedCategory: 'Current Assets', type: 'asset', isMapped: true },
  { id: 'm3', accountCode: '1500', accountName: 'Fixed Assets', suggestedCategory: 'Non-Current Assets', confirmedCategory: 'Non-Current Assets', type: 'asset', isMapped: true },
  { id: 'm4', accountCode: '2000', accountName: 'Accounts Payable', suggestedCategory: 'Current Liabilities', confirmedCategory: 'Current Liabilities', type: 'liability', isMapped: true },
  { id: 'm5', accountCode: '2500', accountName: 'Long-term Debt', suggestedCategory: 'Non-Current Liabilities', confirmedCategory: '', type: 'liability', isMapped: false },
  { id: 'm6', accountCode: '3000', accountName: 'Share Capital', suggestedCategory: 'Equity', confirmedCategory: 'Equity', type: 'equity', isMapped: true },
  { id: 'm7', accountCode: '4000', accountName: 'Sales Revenue', suggestedCategory: 'Operating Revenue', confirmedCategory: 'Operating Revenue', type: 'revenue', isMapped: true },
  { id: 'm8', accountCode: '4100', accountName: 'Service Revenue', suggestedCategory: 'Operating Revenue', confirmedCategory: '', type: 'revenue', isMapped: false },
  { id: 'm9', accountCode: '5000', accountName: 'Cost of Goods Sold', suggestedCategory: 'Direct Costs', confirmedCategory: 'Direct Costs', type: 'expense', isMapped: true },
  { id: 'm10', accountCode: '6000', accountName: 'Salaries & Wages', suggestedCategory: 'Operating Expenses', confirmedCategory: 'Operating Expenses', type: 'expense', isMapped: true },
  { id: 'm11', accountCode: '6100', accountName: 'Office Rent', suggestedCategory: 'Operating Expenses', confirmedCategory: 'Operating Expenses', type: 'expense', isMapped: true },
  { id: 'm12', accountCode: '6200', accountName: 'Utilities', suggestedCategory: 'Operating Expenses', confirmedCategory: '', type: 'expense', isMapped: false },
  { id: 'm13', accountCode: '7000', accountName: 'Interest Expense', suggestedCategory: 'Financial Expenses', confirmedCategory: 'Financial Expenses', type: 'expense', isMapped: true },
];

const demoEntries: JournalEntry[] = [
  { id: 'e1', date: '2024-01-05', reference: 'JE-001', description: 'Initial cash deposit', accountCode: '1000', accountName: 'Cash & Equivalents', debit: 500000, credit: 0, isValidated: true, source: 'general_ledger_2024.xlsx' },
  { id: 'e2', date: '2024-01-05', reference: 'JE-001', description: 'Share capital contribution', accountCode: '3000', accountName: 'Share Capital', debit: 0, credit: 500000, isValidated: true, source: 'general_ledger_2024.xlsx' },
  { id: 'e3', date: '2024-01-15', reference: 'JE-002', description: 'Product sales - January', accountCode: '4000', accountName: 'Sales Revenue', debit: 0, credit: 85000, isValidated: true, source: 'general_ledger_2024.xlsx' },
  { id: 'e4', date: '2024-01-15', reference: 'JE-002', description: 'Accounts receivable - Jan sales', accountCode: '1100', accountName: 'Accounts Receivable', debit: 85000, credit: 0, isValidated: true, source: 'general_ledger_2024.xlsx' },
  { id: 'e5', date: '2024-01-31', reference: 'JE-003', description: 'January salaries', accountCode: '6000', accountName: 'Salaries & Wages', debit: 42000, credit: 0, isValidated: true, source: 'general_ledger_2024.xlsx' },
  { id: 'e6', date: '2024-01-31', reference: 'JE-003', description: 'Cash payment - salaries', accountCode: '1000', accountName: 'Cash & Equivalents', debit: 0, credit: 42000, isValidated: true, source: 'general_ledger_2024.xlsx' },
  { id: 'e7', date: '2024-02-01', reference: 'JE-004', description: 'Office rent - February', accountCode: '6100', accountName: 'Office Rent', debit: 8500, credit: 0, isValidated: false, source: 'bank_statement_jan.pdf' },
  { id: 'e8', date: '2024-02-01', reference: 'JE-004', description: 'Cash payment - rent', accountCode: '1000', accountName: 'Cash & Equivalents', debit: 0, credit: 8500, isValidated: false, source: 'bank_statement_jan.pdf' },
  { id: 'e9', date: '2024-02-10', reference: 'JE-005', description: 'COGS - January', accountCode: '5000', accountName: 'Cost of Goods Sold', debit: 34000, credit: 0, isValidated: true, source: 'general_ledger_2024.xlsx' },
  { id: 'e10', date: '2024-02-10', reference: 'JE-005', description: 'Accounts payable - COGS', accountCode: '2000', accountName: 'Accounts Payable', debit: 0, credit: 34000, isValidated: true, source: 'general_ledger_2024.xlsx' },
  { id: 'e11', date: '2024-02-15', reference: 'JE-006', description: 'Product sales - February', accountCode: '4000', accountName: 'Sales Revenue', debit: 0, credit: 92000, isValidated: true, source: 'general_ledger_2024.xlsx' },
  { id: 'e12', date: '2024-02-15', reference: 'JE-006', description: 'Cash received - Feb sales', accountCode: '1000', accountName: 'Cash & Equivalents', debit: 92000, credit: 0, isValidated: true, source: 'general_ledger_2024.xlsx' },
  { id: 'e13', date: '2024-02-28', reference: 'JE-007', description: 'February salaries', accountCode: '6000', accountName: 'Salaries & Wages', debit: 43500, credit: 0, isValidated: false, source: 'general_ledger_2024.xlsx' },
  { id: 'e14', date: '2024-02-28', reference: 'JE-007', description: 'Cash payment - salaries', accountCode: '1000', accountName: 'Cash & Equivalents', debit: 0, credit: 43500, isValidated: false, source: 'general_ledger_2024.xlsx' },
  { id: 'e15', date: '2024-03-01', reference: 'JE-008', description: 'Service revenue - consulting', accountCode: '4100', accountName: 'Service Revenue', debit: 0, credit: 15000, isValidated: true, source: 'invoices_q1.csv' },
  { id: 'e16', date: '2024-03-01', reference: 'JE-008', description: 'Accounts receivable - consulting', accountCode: '1100', accountName: 'Accounts Receivable', debit: 15000, credit: 0, isValidated: true, source: 'invoices_q1.csv' },
  { id: 'e17', date: '2024-03-05', reference: 'JE-009', description: 'Utility bills - Q1', accountCode: '6200', accountName: 'Utilities', debit: 3200, credit: 0, isValidated: false, source: 'bank_statement_jan.pdf' },
  { id: 'e18', date: '2024-03-05', reference: 'JE-009', description: 'Cash payment - utilities', accountCode: '1000', accountName: 'Cash & Equivalents', debit: 0, credit: 3200, isValidated: false, source: 'bank_statement_jan.pdf' },
  { id: 'e19', date: '2024-03-10', reference: 'JE-010', description: 'Interest on loan', accountCode: '7000', accountName: 'Interest Expense', debit: 2800, credit: 0, isValidated: true, source: 'general_ledger_2024.xlsx' },
  { id: 'e20', date: '2024-03-10', reference: 'JE-010', description: 'Cash payment - interest', accountCode: '1000', accountName: 'Cash & Equivalents', debit: 0, credit: 2800, isValidated: true, source: 'general_ledger_2024.xlsx' },
  { id: 'e21', date: '2024-03-15', reference: 'JE-011', description: 'Product sales - March', accountCode: '4000', accountName: 'Sales Revenue', debit: 0, credit: 105000, isValidated: true, source: 'general_ledger_2024.xlsx' },
  { id: 'e22', date: '2024-03-15', reference: 'JE-011', description: 'Cash received - Mar sales', accountCode: '1000', accountName: 'Cash & Equivalents', debit: 105000, credit: 0, isValidated: true, source: 'general_ledger_2024.xlsx' },
  { id: 'e23', date: '2024-03-20', reference: 'JE-012', description: 'Equipment purchase', accountCode: '1500', accountName: 'Fixed Assets', debit: 75000, credit: 0, isValidated: true, source: 'general_ledger_2024.xlsx' },
  { id: 'e24', date: '2024-03-20', reference: 'JE-012', description: 'Long-term financing', accountCode: '2500', accountName: 'Long-term Debt', debit: 0, credit: 75000, isValidated: true, source: 'general_ledger_2024.xlsx' },
];

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [demoProject, demoProject2],
  currentProjectId: null,
  files: { [DEMO_PROJECT_ID]: demoFiles, 'demo-2': [] },
  mappings: { [DEMO_PROJECT_ID]: demoMappings, 'demo-2': [] },
  entries: { [DEMO_PROJECT_ID]: demoEntries, 'demo-2': [] },

  setCurrentProject: (id) => set({ currentProjectId: id }),

  addProject: (project) => set((s) => ({
    projects: [...s.projects, project],
    files: { ...s.files, [project.id]: [] },
    mappings: { ...s.mappings, [project.id]: [] },
    entries: { ...s.entries, [project.id]: [] },
  })),

  deleteProject: (id) => set((s) => ({
    projects: s.projects.filter((p) => p.id !== id),
    currentProjectId: s.currentProjectId === id ? null : s.currentProjectId,
  })),

  addFile: (projectId, file) => set((s) => ({
    files: { ...s.files, [projectId]: [...(s.files[projectId] || []), file] },
  })),

  updateFileStatus: (projectId, fileId, status) => set((s) => ({
    files: {
      ...s.files,
      [projectId]: (s.files[projectId] || []).map((f) =>
        f.id === fileId ? { ...f, status } : f
      ),
    },
  })),

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

  getCurrentProject: () => {
    const s = get();
    return s.projects.find((p) => p.id === s.currentProjectId);
  },

  getProjectFiles: (projectId) => get().files[projectId] || [],
  getProjectMappings: (projectId) => get().mappings[projectId] || [],
  getProjectEntries: (projectId) => get().entries[projectId] || [],
}));
