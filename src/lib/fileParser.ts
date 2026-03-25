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

  const isNegative = /^\(.*\)$/.test(str);
  str = str.replace(/[()]/g, '');

  // Remove currency symbols & non-breaking spaces
  str = str.replace(/[$€£¥₹]/g, '').replace(/\u00A0/g, ' ');

  const lastComma = str.lastIndexOf(',');
  const lastDot = str.lastIndexOf('.');

  if (lastComma > lastDot) {
    str = str.replace(/[\s.]/g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    str = str.replace(/[\s,]/g, '');
  } else {
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
  const frMatch = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (frMatch) {
    const [, day, month, year] = frMatch;
    const d = new Date(+year, +month - 1, +day);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

/** Check if a string looks like a date */
function looksLikeDate(val: unknown): boolean {
  if (!val) return false;
  if (val instanceof Date) return !isNaN(val.getTime());
  if (typeof val === 'number') return val > 40000 && val < 60000;
  const s = String(val).trim();
  return /^\d{1,2}[/\-.]?\d{1,2}[/\-.]?\d{2,4}$/.test(s) || /^\d{4}[/\-]\d{2}[/\-]\d{2}$/.test(s);
}

/** Detect if a row is a totals/summary row */
function isTotalsRow(row: RawRow): boolean {
  const vals = Object.values(row).map(v => String(v ?? '').toLowerCase().trim());
  return vals.some(v =>
    /^total/i.test(v) || /^totaux/i.test(v) || /^sous[\s-]?total/i.test(v) || /^sub[\s-]?total/i.test(v) ||
    /^grand\s*total/i.test(v) || /^solde/i.test(v) || /^totaux\s*du\s*poste/i.test(v) ||
    /^totaux\s*(g[ée]n[ée]raux|du\s*compte|du\s*journal)/i.test(v) ||
    /^report\s*(nouveau|à\s*nouveau)/i.test(v) || /^carried\s*forward/i.test(v) ||
    /^brought\s*forward/i.test(v) || /^balance\s*(c\/d|b\/d|carried|brought)/i.test(v) ||
    v === '---' || v === '===' || v === '***'
  );
}

/** Detect repeated column header rows embedded in data */
function isRepeatedHeaderRow(row: RawRow, originalHeaders: string[]): boolean {
  const vals = Object.values(row).map(v => String(v ?? '').trim().toLowerCase());
  const nonEmpty = vals.filter(v => v.length > 0);
  if (nonEmpty.length < 2) return false;
  const headerLower = originalHeaders.map(h => h.trim().toLowerCase());
  const matchCount = nonEmpty.filter(v => headerLower.includes(v)).length;
  return matchCount >= Math.min(nonEmpty.length * 0.6, 3);
}

function isEmptyRow(row: RawRow): boolean {
  return Object.values(row).every(v => v == null || String(v).trim() === '');
}

// ─── File type detection ───────────────────────────────────────────

export type FileStructureType = 'tabular' | 'hierarchical';

export interface DetectedAccount {
  code: string;
  name: string;
  transactionCount: number;
}

export interface HierarchicalTransaction {
  rowIndex: number;
  date: string;
  accountCode: string;
  accountName: string;
  description: string;
  debit: number;
  credit: number;
}

export interface HierarchicalParseResult {
  accounts: DetectedAccount[];
  transactions: HierarchicalTransaction[];
  unparsedRowCount: number;
}

/** Check if a value looks like a number (including formatted: "1 000,50") */
function looksLikeNumber(val: unknown): boolean {
  if (val == null || val === '') return false;
  if (typeof val === 'number') return true;
  const s = String(val).trim().replace(/[$€£¥₹\s\u00A0]/g, '').replace(/[()]/g, '');
  return /^-?\d[\d.,\s]*$/.test(s) && s.length > 0;
}

/** Detect an account header row from raw cell values (no column mapping needed) */
function detectAccountHeaderFromValues(values: string[]): { code: string; name: string } | null {
  // Check each cell for "123456 Account Name" pattern
  for (const v of values) {
    const s = v.trim();
    const match = s.match(/^(\d{3,})\s+([A-Za-zÀ-ÿ].+)/);
    if (match) {
      return { code: match[1], name: match[2].trim() };
    }
  }

  // Check if first cell is a pure account code and second cell is a name
  if (values.length >= 2) {
    const first = values[0].trim();
    const second = values[1].trim();
    if (/^\d{3,}$/.test(first) && /^[A-Za-zÀ-ÿ]/.test(second) && second.length > 2) {
      return { code: first, name: second };
    }
  }

  // Standalone account code row
  const nonEmpty = values.filter(v => v.trim().length > 0);
  if (nonEmpty.length === 1) {
    const m = nonEmpty[0].trim().match(/^(\d{3,})\s*(.*)/);
    if (m) {
      return { code: m[1], name: m[2] || `Account ${m[1]}` };
    }
  }

  return null;
}

/** Extract date and amounts from a row's values without column mapping */
function extractTransactionFromValues(values: string[]): {
  date: string; description: string; debit: number; credit: number;
} | null {
  let dateVal: string | null = null;
  const amounts: number[] = [];
  const textParts: string[] = [];

  for (const v of values) {
    const s = v.trim();
    if (!s) continue;

    if (!dateVal && looksLikeDate(s)) {
      dateVal = parseDate(s);
    } else if (looksLikeNumber(s)) {
      const n = parseNumber(s);
      if (n !== 0) amounts.push(n);
    } else {
      // Skip noise keywords
      if (!/^(d[ée]bit|cr[ée]dit|solde|balance|debit|credit)$/i.test(s)) {
        textParts.push(s);
      }
    }
  }

  // Must have a date to be a transaction
  if (!dateVal) return null;
  // Must have at least one amount
  if (amounts.length === 0) return null;

  let debit = 0;
  let credit = 0;

  if (amounts.length === 1) {
    // Single amount — positive = debit, negative = credit
    if (amounts[0] >= 0) debit = amounts[0];
    else credit = Math.abs(amounts[0]);
  } else if (amounts.length >= 2) {
    // Assume debit, credit order (most common in GL formats)
    debit = Math.abs(amounts[0]);
    credit = Math.abs(amounts[1]);
    // If one is zero, fine; if both nonzero, keep as-is
  }

  if (debit === 0 && credit === 0) return null;

  return {
    date: dateVal,
    description: textParts.join(' ').slice(0, 200) || 'Transaction',
    debit,
    credit,
  };
}

/** Detect whether a file is tabular or hierarchical */
export function detectFileStructure(rows: RawRow[], headers: string[]): {
  type: FileStructureType;
  confidence: number;
} {
  const mapping = autoDetectColumns(headers);
  const tabularScore = computeConfidence(mapping, rows);

  // Count hierarchical signals
  let accountHeaders = 0;
  let transactionRows = 0;
  let totalRows = 0;

  for (const row of rows.slice(0, 100)) {
    if (isEmptyRow(row)) continue;
    totalRows++;

    const values = Object.values(row).map(v => String(v ?? ''));
    const acctHeader = detectAccountHeaderFromValues(values);
    if (acctHeader) {
      accountHeaders++;
      continue;
    }

    // Check for transaction-like rows (date + amount)
    const hasDate = values.some(v => looksLikeDate(v.trim()));
    const hasAmount = values.some(v => looksLikeNumber(v.trim()) && parseNumber(v.trim()) !== 0);
    if (hasDate && hasAmount) transactionRows++;
  }

  const hierarchicalSignal = totalRows > 0
    ? (accountHeaders >= 2 && transactionRows >= 3) ? 1 : (accountHeaders / totalRows) * 3
    : 0;

  // If tabular detection is strong, prefer it
  if (tabularScore >= 0.8 && hierarchicalSignal < 0.5) {
    return { type: 'tabular', confidence: tabularScore };
  }

  // If hierarchical signals are strong
  if (hierarchicalSignal >= 0.5 && accountHeaders >= 2) {
    return { type: 'hierarchical', confidence: Math.min(hierarchicalSignal, 1) };
  }

  // Low confidence either way — default to tabular (user can switch)
  return { type: tabularScore >= hierarchicalSignal ? 'tabular' : 'hierarchical', confidence: Math.max(tabularScore, hierarchicalSignal) };
}

/** Parse a file in hierarchical mode (no column mapping needed) */
export function parseHierarchical(rows: RawRow[]): HierarchicalParseResult {
  const accounts: DetectedAccount[] = [];
  const transactions: HierarchicalTransaction[] = [];
  let currentAccount: { code: string; name: string } | null = null;
  let unparsedRowCount = 0;
  const accountTxCounts = new Map<string, number>();

  rows.forEach((row, idx) => {
    if (isEmptyRow(row)) return;
    if (isTotalsRow(row)) return;

    const values = Object.values(row).map(v => String(v ?? ''));

    // Check for account header
    const acctHeader = detectAccountHeaderFromValues(values);
    if (acctHeader) {
      currentAccount = acctHeader;
      if (!accounts.find(a => a.code === acctHeader.code)) {
        accounts.push({ code: acctHeader.code, name: acctHeader.name, transactionCount: 0 });
      }
      return;
    }

    // Try to extract a transaction
    const tx = extractTransactionFromValues(values);
    if (tx) {
      const accountCode = currentAccount?.code || 'UNKNOWN';
      const accountName = currentAccount?.name || 'Unknown Account';
      transactions.push({
        rowIndex: idx,
        date: tx.date,
        accountCode,
        accountName,
        description: tx.description,
        debit: tx.debit,
        credit: tx.credit,
      });
      accountTxCounts.set(accountCode, (accountTxCounts.get(accountCode) || 0) + 1);
      return;
    }

    // Not empty, not total, not header, not transaction → unparsed
    unparsedRowCount++;
  });

  // Update transaction counts on accounts
  for (const acct of accounts) {
    acct.transactionCount = accountTxCounts.get(acct.code) || 0;
  }

  return { accounts, transactions, unparsedRowCount };
}

// ─── Existing tabular types ────────────────────────────────────────

export interface PreviewData {
  headers: string[];
  rows: RawRow[];
  suggestedMapping: ColumnMapping;
  fileName: string;
  confidence: number;
  detectedAccounts: DetectedAccount[];
  isHierarchical: boolean;
  /** The detected structure type */
  structureType: FileStructureType;
  /** Hierarchical parse result (populated only when structureType === 'hierarchical') */
  hierarchicalResult: HierarchicalParseResult | null;
}

export interface ParseResult {
  entries: JournalEntry[];
  mappings: AccountMapping[];
  entriesExtracted: number;
}

/** Compute confidence score for the auto-detected mapping */
function computeConfidence(mapping: ColumnMapping, rows: RawRow[]): number {
  let score = 0;
  const total = 5;
  if (mapping.date) {
    const dateHits = rows.slice(0, 20).filter(r => looksLikeDate(r[mapping.date!])).length;
    if (dateHits > 0) score += 1;
  }
  if (mapping.debit || mapping.credit || mapping.amount) score += 1;
  if (mapping.account_code) score += 1;
  if (mapping.description || mapping.account_name) score += 1;
  const hasFinData = rows.slice(0, 20).some(r => {
    if (mapping.debit && parseNumber(r[mapping.debit]) !== 0) return true;
    if (mapping.credit && parseNumber(r[mapping.credit]) !== 0) return true;
    if (mapping.amount && parseNumber(r[mapping.amount]) !== 0) return true;
    return false;
  });
  if (hasFinData) score += 1;
  return score / total;
}

/** Read file and return preview data with structure detection */
export async function previewFile(file: File): Promise<PreviewData> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: RawRow[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (!rows.length) return {
    headers: [], rows: [], suggestedMapping: autoDetectColumns([]),
    fileName: file.name, confidence: 0, detectedAccounts: [], isHierarchical: false,
    structureType: 'tabular', hierarchicalResult: null,
  };

  const headers = Object.keys(rows[0]);
  const suggestedMapping = autoDetectColumns(headers);
  const { type: structureType, confidence: structConfidence } = detectFileStructure(rows, headers);

  let hierarchicalResult: HierarchicalParseResult | null = null;
  let detectedAccounts: DetectedAccount[] = [];

  if (structureType === 'hierarchical') {
    hierarchicalResult = parseHierarchical(rows);
    detectedAccounts = hierarchicalResult.accounts;
  }

  const confidence = structureType === 'tabular'
    ? computeConfidence(suggestedMapping, rows)
    : structConfidence;

  const previewRows = rows.filter(r => !isEmptyRow(r)).slice(0, 20);

  return {
    headers,
    rows: previewRows,
    suggestedMapping,
    fileName: file.name,
    confidence,
    detectedAccounts,
    isHierarchical: structureType === 'hierarchical',
    structureType,
    hierarchicalResult,
  };
}

/** Convert hierarchical transactions to journal entries + account mappings */
export function hierarchicalToParseResult(
  transactions: HierarchicalTransaction[],
  accounts: DetectedAccount[],
  fileName: string,
): ParseResult {
  const entries: JournalEntry[] = transactions.map((tx, idx) => ({
    id: `e-${Date.now()}-${idx}`,
    date: tx.date,
    reference: `JE-${String(idx + 1).padStart(3, '0')}`,
    description: tx.description,
    accountCode: tx.accountCode,
    accountName: tx.accountName,
    debit: tx.debit,
    credit: tx.credit,
    isValidated: false,
    source: fileName,
  }));

  const mappings: AccountMapping[] = accounts.map((acct, idx) => {
    const type = guessAccountType(acct.code, acct.name);
    return {
      id: `m-${Date.now()}-${idx}`,
      accountCode: acct.code,
      accountName: acct.name,
      suggestedCategory: guessCategoryFromType(type),
      confirmedCategory: '',
      type,
      isMapped: false,
    };
  });

  return { entries, mappings, entriesExtracted: entries.length };
}

/** Parse with confirmed column mapping (tabular mode) */
export async function parseFileWithMapping(file: File, mapping: ColumnMapping): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: RawRow[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (!rows.length) return { entries: [], mappings: [], entriesExtracted: 0 };

  const headers = Object.keys(rows[0]);
  const entries: JournalEntry[] = [];
  const accountSet = new Map<string, string>();

  let currentAccount: { code: string; name: string } | null = null;

  rows.forEach((row, idx) => {
    if (isEmptyRow(row)) return;
    if (isTotalsRow(row)) return;
    if (isRepeatedHeaderRow(row, headers)) return;

    // Check if this is an account header row (using column-mapping-aware detection)
    const vals = Object.values(row);
    let hasAmount = false;
    if (mapping.debit) hasAmount = hasAmount || parseNumber(row[mapping.debit]) !== 0;
    if (mapping.credit) hasAmount = hasAmount || parseNumber(row[mapping.credit]) !== 0;
    if (mapping.amount) hasAmount = hasAmount || parseNumber(row[mapping.amount]) !== 0;

    if (!hasAmount && !(mapping.date && looksLikeDate(row[mapping.date]))) {
      // Might be an account header
      const headerValues = vals.map(v => String(v ?? ''));
      const headerAccount = detectAccountHeaderFromValues(headerValues);
      if (headerAccount) {
        currentAccount = headerAccount;
        if (!accountSet.has(headerAccount.code)) {
          accountSet.set(headerAccount.code, headerAccount.name);
        }
        return;
      }
    }

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

    if (debit === 0 && credit === 0) return;

    let accountCode = mapping.account_code ? String(row[mapping.account_code] ?? '').trim() : '';
    let accountName = mapping.account_name
      ? String(row[mapping.account_name] ?? '').trim()
      : (mapping.description ? String(row[mapping.description] ?? '').trim() : '');

    if (!accountCode && currentAccount) {
      accountCode = currentAccount.code;
      accountName = accountName || currentAccount.name;
    }
    if (!accountName) {
      accountName = currentAccount?.name || `Account ${idx + 1}`;
    }

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
    if (c >= 1000 && c < 2000) return 'asset';
    if (c >= 2000 && c < 3000) return 'asset';
    if (c >= 3000 && c < 4000) return 'asset';
    if (c >= 4000 && c < 5000) return 'liability';
    if (c >= 5000 && c < 6000) return 'asset';
    if (c >= 6000 && c < 7000) return 'expense';
    if (c >= 7000 && c < 8000) return 'revenue';
  }

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
