import * as XLSX from 'xlsx';
import type { JournalEntry, AccountMapping } from '@/types/finance';

interface RawRow {
  [key: string]: unknown;
}

const COLUMN_PATTERNS: Record<string, RegExp[]> = {
  date: [/date/i, /dt/i, /period/i, /jour/i],
  account_code: [/account\s*code/i, /acct\s*code/i, /code/i, /account\s*#/i, /acct\s*#/i, /account\s*no/i, /numero/i],
  account_name: [/account\s*name/i, /acct\s*name/i, /account\s*desc/i, /account$/i, /libelle\s*compte/i, /nom/i],
  description: [/desc/i, /label/i, /memo/i, /narration/i, /libelle/i, /detail/i, /particulars/i],
  reference: [/ref/i, /journal/i, /voucher/i, /doc/i, /piece/i, /jv/i],
  debit: [/debit/i, /dr/i, /débit/i],
  credit: [/credit/i, /cr/i, /crédit/i],
  amount: [/amount/i, /montant/i, /value/i, /sum/i],
};

function detectColumn(headers: string[], patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = headers.find(h => pattern.test(h.trim()));
    if (match) return match;
  }
  return null;
}

function parseDate(val: unknown): string {
  if (!val) return new Date().toISOString().slice(0, 10);
  if (typeof val === 'number') {
    // Excel serial date
    const epoch = new Date(1899, 11, 30);
    epoch.setDate(epoch.getDate() + val);
    return epoch.toISOString().slice(0, 10);
  }
  const d = new Date(String(val));
  return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

function parseNumber(val: unknown): number {
  if (val == null || val === '') return 0;
  if (typeof val === 'number') return Math.abs(val);
  const cleaned = String(val).replace(/[^0-9.\-,]/g, '').replace(',', '.');
  return Math.abs(parseFloat(cleaned)) || 0;
}

export interface ParseResult {
  entries: JournalEntry[];
  mappings: AccountMapping[];
  entriesExtracted: number;
}

export async function parseFile(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: RawRow[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (!rows.length) return { entries: [], mappings: [], entriesExtracted: 0 };

  const headers = Object.keys(rows[0]);

  const dateCol = detectColumn(headers, COLUMN_PATTERNS.date);
  const codeCol = detectColumn(headers, COLUMN_PATTERNS.account_code);
  const nameCol = detectColumn(headers, COLUMN_PATTERNS.account_name);
  const descCol = detectColumn(headers, COLUMN_PATTERNS.description);
  const refCol = detectColumn(headers, COLUMN_PATTERNS.reference);
  const debitCol = detectColumn(headers, COLUMN_PATTERNS.debit);
  const creditCol = detectColumn(headers, COLUMN_PATTERNS.credit);
  const amountCol = detectColumn(headers, COLUMN_PATTERNS.amount);

  const entries: JournalEntry[] = [];
  const accountSet = new Map<string, string>();

  rows.forEach((row, idx) => {
    let debit = debitCol ? parseNumber(row[debitCol]) : 0;
    let credit = creditCol ? parseNumber(row[creditCol]) : 0;

    // If no separate debit/credit columns, use amount column
    if (!debitCol && !creditCol && amountCol) {
      const raw = row[amountCol];
      const num = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[^0-9.\-,]/g, '').replace(',', '.')) || 0;
      if (num >= 0) debit = num;
      else credit = Math.abs(num);
    }

    // Skip rows with no financial data
    if (debit === 0 && credit === 0) return;

    const accountCode = codeCol ? String(row[codeCol]).trim() : '';
    const accountName = nameCol ? String(row[nameCol]).trim() : (descCol ? String(row[descCol]).trim() : `Account ${idx + 1}`);

    if (accountCode) accountSet.set(accountCode, accountName);

    entries.push({
      id: `e-${Date.now()}-${idx}`,
      date: parseDate(row[dateCol ?? '']),
      reference: refCol ? String(row[refCol]).trim() : `JE-${String(idx + 1).padStart(3, '0')}`,
      description: descCol ? String(row[descCol]).trim() : accountName,
      accountCode,
      accountName,
      debit,
      credit,
      isValidated: false,
      source: file.name,
    });
  });

  // Generate mappings from unique accounts
  const mappings: AccountMapping[] = Array.from(accountSet.entries()).map(([code, name], idx) => {
    const type = guessAccountType(code, name);
    const category = guessCategoryFromType(type);
    return {
      id: `m-${Date.now()}-${idx}`,
      accountCode: code,
      accountName: name,
      suggestedCategory: category,
      confirmedCategory: '',
      type,
      isMapped: false,
    };
  });

  return { entries, mappings, entriesExtracted: entries.length };
}

function guessAccountType(code: string, name: string): AccountMapping['type'] {
  const n = name.toLowerCase();
  const c = parseInt(code);

  if (!isNaN(c)) {
    if (c >= 1000 && c < 2000) return 'asset';
    if (c >= 2000 && c < 3000) return 'liability';
    if (c >= 3000 && c < 4000) return 'equity';
    if (c >= 4000 && c < 5000) return 'revenue';
    if (c >= 5000) return 'expense';
  }

  if (/revenue|sales|income/i.test(n)) return 'revenue';
  if (/expense|cost|salary|rent|util/i.test(n)) return 'expense';
  if (/payable|debt|loan|liability/i.test(n)) return 'liability';
  if (/equity|capital|retained/i.test(n)) return 'equity';
  return 'asset';
}

function guessCategoryFromType(type: AccountMapping['type']): string {
  switch (type) {
    case 'asset': return 'Current Assets';
    case 'liability': return 'Current Liabilities';
    case 'equity': return 'Equity';
    case 'revenue': return 'Operating Revenue';
    case 'expense': return 'Operating Expenses';
  }
}
