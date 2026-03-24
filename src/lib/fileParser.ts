import * as XLSX from 'xlsx';
import type { JournalEntry, AccountMapping } from '@/types/finance';

interface RawRow {
  [key: string]: unknown;
}

// Expanded column patterns for French + English accounting
const COLUMN_PATTERNS: Record<string, RegExp[]> = {
  date: [
    /^date$/i, /^dt$/i, /^period$/i, /^jour$/i, /^date\s*(comptable|écriture|pièce|opération)/i,
    /^date\s*d[e']/i, /^posting\s*date/i, /^transaction\s*date/i, /^entry\s*date/i,
    /^value\s*date/i, /^date\s*valeur/i,
  ],
  account_code: [
    /^(n[°o]?\s*)?(de\s*)?(compte|account)/i, /^compte\s*(g[ée]n[ée]ral|général)?$/i,
    /^account\s*(code|number|no|num|#)?$/i, /^acct\s*(code|no|#)?$/i,
    /^code\s*(compte)?$/i, /^numéro/i, /^n[°o]\s*compte/i, /^general\s*account/i,
    /^gl\s*(code|account|#)/i, /^ledger\s*(code|account)/i, /^cpt/i,
  ],
  account_name: [
    /^(libellé|intitulé|nom)\s*(du\s*)?(compte)?/i, /^account\s*(name|desc|label|title)/i,
    /^acct\s*(name|desc)/i, /^account$/i, /^intitulé$/i, /^libellé\s*compte/i,
    /^description\s*(du\s*)?compte/i,
  ],
  description: [
    /^(libellé|label|desc|description|narration|memo|detail|particulars)/i,
    /^libellé\s*(écriture|opération|mouvement)?$/i, /^wording/i, /^text/i,
    /^remarque/i, /^observation/i, /^motif/i,
  ],
  reference: [
    /^(ref|référence|reference|journal|voucher|doc|pièce|jv|entry\s*#|n[°o]\s*(pièce|écriture))/i,
    /^piece\s*(comptable)?$/i, /^folio/i, /^journal\s*(code|ref|#)?$/i,
  ],
  debit: [/^d[ée]bit/i, /^dr$/i, /^montant\s*d[ée]bit/i, /^debit\s*amount/i],
  credit: [/^cr[ée]dit/i, /^cr$/i, /^montant\s*cr[ée]dit/i, /^credit\s*amount/i],
  amount: [/^(amount|montant|value|sum|solde|balance)/i],
};

export interface ColumnMapping {
  date: string | null;
  account_code: string | null;
  account_name: string | null;
  description: string | null;
  reference: string | null;
  debit: string | null;
  credit: string | null;
  amount: string | null;
}

export type ColumnRole = keyof ColumnMapping;

export const COLUMN_ROLE_LABELS: Record<ColumnRole, string> = {
  date: 'Date',
  account_code: 'Account Code',
  account_name: 'Account Name',
  description: 'Description',
  reference: 'Reference',
  debit: 'Debit',
  credit: 'Credit',
  amount: 'Amount',
};

function detectColumn(headers: string[], patterns: RegExp[], usedHeaders: Set<string>): string | null {
  for (const pattern of patterns) {
    const match = headers.find(h => !usedHeaders.has(h) && pattern.test(h.trim()));
    if (match) {
      usedHeaders.add(match);
      return match;
    }
  }
  return null;
}

export function autoDetectColumns(headers: string[]): ColumnMapping {
  const used = new Set<string>();
  return {
    date: detectColumn(headers, COLUMN_PATTERNS.date, used),
    account_code: detectColumn(headers, COLUMN_PATTERNS.account_code, used),
    account_name: detectColumn(headers, COLUMN_PATTERNS.account_name, used),
    description: detectColumn(headers, COLUMN_PATTERNS.description, used),
    reference: detectColumn(headers, COLUMN_PATTERNS.reference, used),
    debit: detectColumn(headers, COLUMN_PATTERNS.debit, used),
    credit: detectColumn(headers, COLUMN_PATTERNS.credit, used),
    amount: detectColumn(headers, COLUMN_PATTERNS.amount, used),
  };
}

/** Normalize numbers: handles "100 000,50", "(1000)", "1,000.50", etc. */
export function parseNumber(val: unknown): number {
  if (val == null || val === '') return 0;
  if (typeof val === 'number') return val;

  let str = String(val).trim();

  // Detect parentheses → negative: (1000) → -1000
  const isNegative = /^\(.*\)$/.test(str);
  str = str.replace(/[()]/g, '');

  // Remove currency symbols & whitespace-as-thousands-separator
  str = str.replace(/[$€£¥₹]/g, '').replace(/\u00A0/g, ' ');

  // Determine decimal separator heuristic:
  // If last separator is a comma with ≤2 digits after → comma is decimal
  // If last separator is a dot with ≤2 digits after → dot is decimal
  const lastComma = str.lastIndexOf(',');
  const lastDot = str.lastIndexOf('.');

  if (lastComma > lastDot) {
    // e.g. "1.000,50" or "1 000,50" → comma is decimal
    str = str.replace(/[\s.]/g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    // e.g. "1,000.50" → dot is decimal
    str = str.replace(/[\s,]/g, '');
  } else {
    // No dot or comma, or neither → just remove spaces
    str = str.replace(/\s/g, '');
  }

  const num = parseFloat(str);
  if (isNaN(num)) return 0;
  return isNegative ? -Math.abs(num) : num;
}

function parseDate(val: unknown): string {
  if (!val) return new Date().toISOString().slice(0, 10);
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? new Date().toISOString().slice(0, 10) : val.toISOString().slice(0, 10);
  }
  if (typeof val === 'number') {
    const epoch = new Date(1899, 11, 30);
    epoch.setDate(epoch.getDate() + val);
    return epoch.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  // Try DD/MM/YYYY or DD-MM-YYYY (French format)
  const frMatch = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (frMatch) {
    const [, day, month, year] = frMatch;
    const d = new Date(+year, +month - 1, +day);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  // Try YYYY-MM-DD
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

/** Detect if a row is a totals/summary row */
function isTotalsRow(row: RawRow): boolean {
  const vals = Object.values(row).map(v => String(v ?? '').toLowerCase().trim());
  return vals.some(v =>
    /^total/i.test(v) || /^sous[\s-]?total/i.test(v) || /^sub[\s-]?total/i.test(v) ||
    /^grand\s*total/i.test(v) || /^solde/i.test(v) || v === '---' || v === '==='
  );
}

function isEmptyRow(row: RawRow): boolean {
  return Object.values(row).every(v => v == null || String(v).trim() === '');
}

export interface PreviewData {
  headers: string[];
  rows: RawRow[];
  suggestedMapping: ColumnMapping;
  fileName: string;
}

export interface ParseResult {
  entries: JournalEntry[];
  mappings: AccountMapping[];
  entriesExtracted: number;
}

/** Step 1: Read file and return preview data + auto-detected columns */
export async function previewFile(file: File): Promise<PreviewData> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: RawRow[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (!rows.length) return { headers: [], rows: [], suggestedMapping: autoDetectColumns([]), fileName: file.name };

  const headers = Object.keys(rows[0]);
  const suggestedMapping = autoDetectColumns(headers);
  // Return up to 20 preview rows
  const previewRows = rows.filter(r => !isEmptyRow(r)).slice(0, 20);

  return { headers, rows: previewRows, suggestedMapping, fileName: file.name };
}

/** Step 2: Parse with confirmed column mapping */
export async function parseFileWithMapping(file: File, mapping: ColumnMapping): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: RawRow[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (!rows.length) return { entries: [], mappings: [], entriesExtracted: 0 };

  const entries: JournalEntry[] = [];
  const accountSet = new Map<string, string>();

  rows.forEach((row, idx) => {
    if (isEmptyRow(row) || isTotalsRow(row)) return;

    let debit = 0;
    let credit = 0;

    if (mapping.debit || mapping.credit) {
      debit = mapping.debit ? Math.abs(parseNumber(row[mapping.debit])) : 0;
      credit = mapping.credit ? Math.abs(parseNumber(row[mapping.credit])) : 0;
    } else if (mapping.amount) {
      const num = parseNumber(row[mapping.amount]);
      if (num >= 0) debit = num;
      else credit = Math.abs(num);
    }

    // Skip rows with no financial data
    if (debit === 0 && credit === 0) return;

    const accountCode = mapping.account_code ? String(row[mapping.account_code] ?? '').trim() : '';
    const accountName = mapping.account_name
      ? String(row[mapping.account_name] ?? '').trim()
      : (mapping.description ? String(row[mapping.description] ?? '').trim() : `Account ${idx + 1}`);

    if (accountCode && !accountSet.has(accountCode)) {
      accountSet.set(accountCode, accountName);
    }

    entries.push({
      id: `e-${Date.now()}-${idx}`,
      date: parseDate(mapping.date ? row[mapping.date] : ''),
      reference: mapping.reference ? String(row[mapping.reference] ?? '').trim() : `JE-${String(idx + 1).padStart(3, '0')}`,
      description: mapping.description ? String(row[mapping.description] ?? '').trim() : accountName,
      accountCode,
      accountName,
      debit,
      credit,
      isValidated: false,
      source: file.name,
    });
  });

  const mappings: AccountMapping[] = Array.from(accountSet.entries()).map(([code, name], idx) => {
    const type = guessAccountType(code, name);
    return {
      id: `m-${Date.now()}-${idx}`,
      accountCode: code,
      accountName: name,
      suggestedCategory: guessCategoryFromType(type),
      confirmedCategory: '',
      type,
      isMapped: false,
    };
  });

  return { entries, mappings, entriesExtracted: entries.length };
}

/** Legacy: auto-detect + parse in one step */
export async function parseFile(file: File): Promise<ParseResult> {
  const preview = await previewFile(file);
  if (!preview.headers.length) return { entries: [], mappings: [], entriesExtracted: 0 };
  return parseFileWithMapping(file, preview.suggestedMapping);
}

function guessAccountType(code: string, name: string): AccountMapping['type'] {
  const n = name.toLowerCase();
  const c = parseInt(code);

  if (!isNaN(c)) {
    // French PCG and common international charts
    if (c >= 1000 && c < 2000) return 'asset';       // Class 1: Equity/Capital (FR) or Assets
    if (c >= 2000 && c < 3000) return 'asset';        // Class 2: Fixed assets
    if (c >= 3000 && c < 4000) return 'asset';        // Class 3: Inventories
    if (c >= 4000 && c < 5000) return 'liability';     // Class 4: Payables/Receivables
    if (c >= 5000 && c < 6000) return 'asset';         // Class 5: Cash
    if (c >= 6000 && c < 7000) return 'expense';       // Class 6: Expenses
    if (c >= 7000 && c < 8000) return 'revenue';       // Class 7: Revenue
  }

  // French terms
  if (/chiffre\s*d'affaires|ventes?|produits?|recettes?|revenue|sales|income/i.test(n)) return 'revenue';
  if (/charges?|frais|achats?|salaire|loyer|expense|cost|salary|rent|util/i.test(n)) return 'expense';
  if (/fournisseur|dette|emprunt|payable|debt|loan|liability/i.test(n)) return 'liability';
  if (/capital|réserv|résultat|equity|retained/i.test(n)) return 'equity';
  if (/banque|caisse|client|stock|immobili|trésorerie|cash|bank|receivable|inventory/i.test(n)) return 'asset';

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
