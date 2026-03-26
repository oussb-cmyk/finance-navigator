export interface Project {
  id: string;
  name: string;
  company: string;
  currency: string;
  fiscalYearEnd: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'archived';
  filesCount: number;
  entriesCount: number;
  unmappedAccounts: number;
}

export interface UploadedFile {
  id: string;
  name: string;
  type: 'pdf' | 'xlsx' | 'csv';
  size: number;
  uploadedAt: string;
  status: 'raw' | 'processing' | 'processed' | 'validated' | 'error';
  entriesExtracted: number;
}

export interface AccountMapping {
  id: string;
  accountCode: string;
  accountName: string;
  suggestedCategory: string;
  confirmedCategory: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  isMapped: boolean;
}

export type JournalType = 'sales' | 'purchases' | 'bank' | 'cash' | 'payroll' | 'tax' | 'general';

export const JOURNAL_TYPES: { value: JournalType; label: string }[] = [
  { value: 'sales', label: 'Sales' },
  { value: 'purchases', label: 'Purchases' },
  { value: 'bank', label: 'Bank' },
  { value: 'cash', label: 'Cash' },
  { value: 'payroll', label: 'Payroll' },
  { value: 'tax', label: 'Tax' },
  { value: 'general', label: 'General' },
];

export interface JournalEntry {
  id: string;
  date: string;
  reference: string;
  description: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  isValidated: boolean;
  source: string;
  journalType?: JournalType;
}

export interface FinancialStatement {
  type: 'pnl' | 'balance_sheet' | 'general_ledger';
  period: string;
  lastComputed: string;
  sections: StatementSection[];
}

export interface StatementSection {
  title: string;
  items: StatementItem[];
  total: number;
}

export interface StatementItem {
  label: string;
  amount: number;
  accountCode?: string;
}

export interface KPI {
  label: string;
  value: number;
  previousValue: number;
  format: 'currency' | 'percentage' | 'number';
  trend: 'up' | 'down' | 'flat';
}

export type FileStatus = UploadedFile['status'];
export type AccountType = AccountMapping['type'];
