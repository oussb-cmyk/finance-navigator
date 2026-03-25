import * as XLSX from 'xlsx';
import type { JournalEntry, AccountMapping } from '@/types/finance';

interface RawRow {
  [key: string]: unknown;
}

// ─── Expanded bilingual column detection patterns ──────────────────

const COLUMN_PATTERNS: Record<string, RegExp[]> = {
  date: [
    /^date$/i, /^dt$/i, /^period$/i, /^jour$/i,
    /^date\s*(comptable|écriture|pièce|opération|mouvement)/i,
    /^date\s*d[e']/i, /^posting\s*date/i, /^transaction\s*date/i,
    /^entry\s*date/i, /^value\s*date/i, /^date\s*valeur/i,
    /^date\s*(de\s*)?saisie/i, /^date\s*effet/i,
  ],
  account_code: [
    /^(n[°o]?\s*)?(de\s*)?(compte|account)/i,
    /^compte\s*(g[ée]n[ée]ral|général|auxiliaire)?$/i,
    /^account\s*(code|number|no|num|#)?$/i,
    /^acct\s*(code|no|#)?$/i,
    /^code\s*(compte)?$/i, /^numéro/i, /^n[°o]\s*compte/i,
    /^general\s*account/i, /^gl\s*(code|account|#)/i,
    /^ledger\s*(code|account)/i, /^cpt/i,
    /^num[ée]ro\s*(de\s*)?(compte|cpt)/i,
    /^compte\s*g[ée]n[ée]ral/i,
  ],
  account_name: [
    /^(libellé|intitulé|nom)\s*(du\s*)?(compte)?/i,
    /^account\s*(name|desc|label|title)/i,
    /^acct\s*(name|desc)/i, /^intitulé$/i,
    /^libellé\s*compte/i, /^description\s*(du\s*)?compte/i,
    /^désignation/i, /^intitulé\s*(du\s*)?(compte|cpt)/i,
  ],
  description: [
    /^(libellé|label|desc|description|narration|memo|detail|particulars)/i,
    /^libellé\s*(écriture|opération|mouvement)?$/i,
    /^wording/i, /^text/i, /^remarque/i, /^observation/i, /^motif/i,
    /^objet/i, /^commentaire/i, /^note/i,
  ],
  reference: [
    /^(ref|référence|reference|journal|voucher|doc|pièce|jv|entry\s*#)/i,
    /^n[°o]\s*(pièce|écriture)/i, /^piece\s*(comptable)?$/i,
    /^folio/i, /^journal\s*(code|ref|#)?$/i,
    /^n[°o]\s*(document|doc)/i,
  ],
  debit: [
    /^d[ée]bit/i, /^dr$/i, /^montant\s*d[ée]bit/i,
    /^debit\s*amount/i, /^mouvement\s*d[ée]bit/i,
  ],
  credit: [
    /^cr[ée]dit/i, /^cr$/i, /^montant\s*cr[ée]dit/i,
    /^credit\s*amount/i, /^mouvement\s*cr[ée]dit/i,
  ],
  amount: [
    /^(amount|montant|value|sum|solde|balance)/i,
    /^mouvement/i,
  ],
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

// ─── Pre-cleaning utilities ────────────────────────────────────────

/** Normalize text: fix encoding artifacts, trim whitespace, collapse spaces */
function normalizeText(val: unknown): string {
  if (val == null) return '';
  let s = String(val);
  s = s.replace(/\u00A0/g, ' ');
  s = s.replace(/\uFEFF/g, '');
  s = s.replace(/\r\n/g, '\n');
  s = s.replace(/\r/g, '\n');
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/** Normalize all values in a row */
function normalizeRow(row: RawRow): RawRow {
  const out: RawRow = {};
  for (const [k, v] of Object.entries(row)) {
    const nk = normalizeText(k);
    if (typeof v === 'string') {
      out[nk] = normalizeText(v);
    } else {
      out[nk] = v;
    }
  }
  return out;
}

function isEmptyRow(row: RawRow): boolean {
  return Object.values(row).every(v => v == null || String(v).trim() === '');
}

/** Detect if a row looks like a header row (contains known column keywords) */
function rowLooksLikeHeader(row: RawRow): boolean {
  const vals = Object.values(row).map(v => normalizeText(v).toLowerCase());
  const nonEmpty = vals.filter(v => v.length > 0);
  if (nonEmpty.length < 2) return false;

  const allPatterns = Object.values(COLUMN_PATTERNS).flat();
  let matchCount = 0;
  for (const v of nonEmpty) {
    if (allPatterns.some(p => p.test(v))) matchCount++;
  }
  return matchCount >= 2;
}

/** Score how well a row of headers maps to our known column patterns */
function scoreHeaderRow(headers: string[]): number {
  const mapping = autoDetectColumns(headers);
  let score = 0;
  if (mapping.date) score += 2;
  if (mapping.debit) score += 1.5;
  if (mapping.credit) score += 1.5;
  if (mapping.amount) score += 1;
  if (mapping.account_code) score += 1;
  if (mapping.account_name) score += 0.5;
  if (mapping.description) score += 0.5;
  if (mapping.reference) score += 0.5;
  return score;
}

// ─── Report-style layout detection ────────────────────────────────

/** Detect report-style files: merged cells, titles, misaligned columns */
export interface ReportDetectionResult {
  isReport: boolean;
  confidence: number;
  titleRows: number;
  tableStartRow: number;
  reasons: string[];
}

const REPORT_TITLE_PATTERNS = [
  /grand[\s-]*livre/i,
  /general\s*ledger/i,
  /balance\s*(g[ée]n[ée]rale|sheet)/i,
  /journal\s*(g[ée]n[ée]ral|entries)/i,
  /compte\s*de\s*r[ée]sultat/i,
  /income\s*statement/i,
  /profit\s*(and|&)\s*loss/i,
  /trial\s*balance/i,
  /bilan/i,
  /r[ée]capitulatif/i,
  /situation\s*(comptable|financi[èe]re)/i,
  /état\s*(financier|comptable|de\s*rapprochement)/i,
  /rapport/i,
  /summary/i,
  /report/i,
];

function detectReportLayout(rawRows: RawRow[]): ReportDetectionResult {
  const reasons: string[] = [];
  let reportScore = 0;
  let titleRows = 0;
  let tableStartRow = 0;

  if (rawRows.length === 0) {
    return { isReport: false, confidence: 0, titleRows: 0, tableStartRow: 0, reasons: [] };
  }

  // Analyze the first 25 rows for report indicators
  const scanLimit = Math.min(25, rawRows.length);

  // 1. Check for title/banner rows at the top (single-cell or very sparse rows)
  let topSparseRows = 0;
  for (let i = 0; i < scanLimit; i++) {
    const row = rawRows[i];
    const vals = Object.values(row).map(v => normalizeText(v));
    const nonEmpty = vals.filter(v => v.length > 0);

    if (nonEmpty.length <= 2 && nonEmpty.length > 0) {
      const text = nonEmpty.join(' ');
      // Check for report title patterns
      if (REPORT_TITLE_PATTERNS.some(p => p.test(text))) {
        reportScore += 3;
        reasons.push(`Report title detected: "${text.slice(0, 60)}"`);
      }
      // Long text in a single cell = likely a merged title
      if (nonEmpty.length === 1 && text.length > 15) {
        topSparseRows++;
      }
    }

    if (topSparseRows > 0 && nonEmpty.length >= 3) {
      break; // found end of title area
    }
  }

  if (topSparseRows >= 2) {
    reportScore += 2;
    titleRows = topSparseRows;
    reasons.push(`${topSparseRows} title/metadata rows detected`);
  }

  // 2. Check for inconsistent column counts (sign of merged cells / report formatting)
  const colCounts: number[] = [];
  for (let i = 0; i < scanLimit; i++) {
    const row = rawRows[i];
    const nonEmpty = Object.values(row).filter(v => normalizeText(v).length > 0).length;
    if (nonEmpty > 0) colCounts.push(nonEmpty);
  }
  if (colCounts.length >= 5) {
    const median = colCounts.slice().sort((a, b) => a - b)[Math.floor(colCounts.length / 2)];
    const inconsistent = colCounts.filter(c => Math.abs(c - median) > 2).length;
    if (inconsistent > colCounts.length * 0.3) {
      reportScore += 2;
      reasons.push('Inconsistent column alignment detected');
    }
  }

  // 3. Check for rows with "Total compte", "Totaux du poste", etc. scattered through the file
  let totalRowCount = 0;
  for (const row of rawRows.slice(0, Math.min(100, rawRows.length))) {
    if (isTotalsRow(row)) totalRowCount++;
  }
  if (totalRowCount >= 3) {
    reportScore += 1;
    reasons.push(`${totalRowCount} summary/total rows found`);
  }

  // 4. Find the table start: first row where we see repeated numeric patterns
  tableStartRow = findTableStartRow(rawRows);

  const isReport = reportScore >= 3;

  return {
    isReport,
    confidence: Math.min(reportScore / 6, 1),
    titleRows,
    tableStartRow,
    reasons,
  };
}

/** Find the row index where actual tabular data begins */
function findTableStartRow(rows: RawRow[]): number {
  const scanLimit = Math.min(30, rows.length);

  // Look for the first row that has both a date-like value and a number-like value,
  // or the first header-like row
  for (let i = 0; i < scanLimit; i++) {
    const row = rows[i];
    const vals = Object.values(row).map(v => normalizeText(v));
    const nonEmpty = vals.filter(v => v.length > 0);

    // If it looks like a header row, data starts after it
    if (nonEmpty.length >= 3 && rowLooksLikeHeader(row)) {
      return i;
    }

    // If it has date + number, it's likely data (table may have started 1 row before with headers)
    if (nonEmpty.length >= 3) {
      const hasDate = vals.some(v => looksLikeDate(v));
      const hasNumber = vals.some(v => looksLikeNumber(v) && parseNumber(v) !== 0);
      if (hasDate && hasNumber && i > 0) {
        // Check if the previous row might be a header
        const prevVals = Object.values(rows[i - 1]).map(v => normalizeText(v));
        const prevNonEmpty = prevVals.filter(v => v.length > 0);
        if (prevNonEmpty.length >= 3) return i - 1;
        return i;
      }
    }
  }

  return 0;
}

/** Extract the table zone from a report-style file */
function extractTableFromReport(rawRows: RawRow[], tableStartRow: number): {
  headers: string[];
  rows: RawRow[];
  headerRowIndex: number;
} {
  if (tableStartRow >= rawRows.length) {
    return { headers: [], rows: [], headerRowIndex: 0 };
  }

  // Slice from table start
  const relevantRows = rawRows.slice(tableStartRow);
  if (relevantRows.length === 0) return { headers: [], rows: [], headerRowIndex: 0 };

  // Try to find the header row within the first few rows of the table zone
  let bestScore = 0;
  let bestIdx = 0;

  for (let i = 0; i < Math.min(5, relevantRows.length); i++) {
    const vals = Object.values(relevantRows[i]).map(v => normalizeText(v));
    const nonEmpty = vals.filter(v => v.length > 0);
    if (nonEmpty.length < 2) continue;
    const score = scoreHeaderRow(nonEmpty);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  // Use the detected header row
  const headerRow = relevantRows[bestIdx];
  const headers = Object.values(headerRow)
    .map(v => normalizeText(v))
    .filter(v => v.length > 0);

  if (headers.length < 2) {
    // Fallback: use original keys
    return { headers: Object.keys(relevantRows[0]), rows: relevantRows, headerRowIndex: tableStartRow };
  }

  // Re-key subsequent rows with the new headers
  const dataRows = relevantRows.slice(bestIdx + 1)
    .filter(r => !isEmptyRow(r))
    .map(row => {
      const vals = Object.values(row);
      const newRow: RawRow = {};
      headers.forEach((h, i) => {
        newRow[h] = i < vals.length ? vals[i] : '';
      });
      return newRow;
    })
    .filter(r => !isEmptyRow(r));

  // Remove total/summary rows and repeated headers
  const cleanRows = dataRows.filter(r => {
    if (isTotalsRow(r)) return false;
    if (isRepeatedHeaderRow(r, headers)) return false;
    return true;
  });

  return { headers, rows: cleanRows, headerRowIndex: tableStartRow + bestIdx };
}

/**
 * Pre-clean raw worksheet data:
 * 1. Normalize text encoding
 * 2. Remove fully empty rows
 * 3. Detect report-style layout and extract table zone if needed
 * 4. Detect the true header row (may not be row 0)
 * 5. Remove merged-cell artifacts
 */
function preCleanData(rawRows: RawRow[]): {
  headers: string[];
  rows: RawRow[];
  headerRowIndex: number;
  reportInfo: ReportDetectionResult | null;
} {
  if (rawRows.length === 0) return { headers: [], rows: [], headerRowIndex: 0, reportInfo: null };

  // Normalize all rows
  const normalized = rawRows.map(normalizeRow).filter(r => !isEmptyRow(r));
  if (normalized.length === 0) return { headers: [], rows: [], headerRowIndex: 0, reportInfo: null };

  // Detect report-style layout
  const reportInfo = detectReportLayout(normalized);

  // If report-style, extract the table zone first
  if (reportInfo.isReport && reportInfo.tableStartRow > 0) {
    const extracted = extractTableFromReport(normalized, reportInfo.tableStartRow);
    if (extracted.headers.length >= 2 && extracted.rows.length > 0) {
      return {
        headers: extracted.headers,
        rows: extracted.rows,
        headerRowIndex: extracted.headerRowIndex,
        reportInfo,
      };
    }
    // If extraction failed, fall through to standard cleaning
  }

  // Standard header detection (same as before)
  const defaultHeaders = Object.keys(normalized[0]);
  let bestHeaderScore = scoreHeaderRow(defaultHeaders);
  let bestHeaderIdx = -1;

  for (let i = 0; i < Math.min(15, normalized.length); i++) {
    const vals = Object.values(normalized[i]).map(v => normalizeText(v));
    const nonEmpty = vals.filter(v => v.length > 0);
    if (nonEmpty.length < 2) continue;
    const candidateScore = scoreHeaderRow(nonEmpty);
    if (candidateScore > bestHeaderScore) {
      bestHeaderScore = candidateScore;
      bestHeaderIdx = i;
    }
  }

  let headers: string[];
  let dataRows: RawRow[];
  let headerRowIndex: number;

  if (bestHeaderIdx >= 0 && bestHeaderScore > scoreHeaderRow(defaultHeaders)) {
    const headerRow = normalized[bestHeaderIdx];
    headers = Object.values(headerRow).map(v => normalizeText(v)).filter(v => v.length > 0);
    headerRowIndex = bestHeaderIdx;

    dataRows = normalized.slice(bestHeaderIdx + 1).map(row => {
      const vals = Object.values(row);
      const newRow: RawRow = {};
      headers.forEach((h, i) => {
        newRow[h] = i < vals.length ? vals[i] : '';
      });
      return newRow;
    });
  } else {
    headers = defaultHeaders;
    dataRows = normalized;
    headerRowIndex = 0;
  }

  // Remove merged-cell artifacts
  dataRows = dataRows.filter(row => {
    const nonEmpty = Object.values(row).filter(v => normalizeText(v).length > 0);
    if (nonEmpty.length <= 1 && nonEmpty.length > 0) {
      const val = normalizeText(nonEmpty[0]);
      if (/^\d{3,}\s+[A-Za-zÀ-ÿ]/.test(val) || /^\d{3,}$/.test(val)) return true;
      return false;
    }
    return true;
  });

  return { headers, rows: dataRows, headerRowIndex, reportInfo };
}

// ─── Number and date parsing ───────────────────────────────────────

/** Normalize numbers: handles "100 000,50", "(1000)", "1,000.50", "1.000,50" etc. */
export function parseNumber(val: unknown): number {
  if (val == null || val === '') return 0;
  if (typeof val === 'number') return val;

  let str = normalizeText(val);

  const isNegative = /^\(.*\)$/.test(str) || str.startsWith('-');
  str = str.replace(/[()]/g, '');

  // Remove currency symbols
  str = str.replace(/[$€£¥₹]/g, '').replace(/\u00A0/g, ' ').trim();

  // Detect French format: "1 000,50" or "1.000,50"
  const lastComma = str.lastIndexOf(',');
  const lastDot = str.lastIndexOf('.');

  if (lastComma > lastDot) {
    // Comma is decimal separator (French/European)
    str = str.replace(/[\s.]/g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    // Dot is decimal separator (English/US)
    str = str.replace(/[\s,]/g, '');
  } else {
    // No decimal separator, just remove spaces
    str = str.replace(/\s/g, '');
    // Handle comma-only: "1000,50" with no dots
    if (lastComma >= 0 && str.split(',').length === 2) {
      const afterComma = str.split(',')[1];
      if (afterComma.length <= 2) {
        str = str.replace(',', '.');
      } else {
        str = str.replace(/,/g, '');
      }
    }
  }

  const num = parseFloat(str);
  if (isNaN(num)) return 0;
  return isNegative ? -Math.abs(num) : num;
}

/** Parse date to YYYY-MM-DD format */
export function parseDate(val: unknown): string {
  const fallback = new Date().toISOString().slice(0, 10);
  if (!val) return fallback;

  if (val instanceof Date) {
    return isNaN(val.getTime()) ? fallback : val.toISOString().slice(0, 10);
  }

  // Excel serial date number
  if (typeof val === 'number') {
    if (val > 40000 && val < 60000) {
      const epoch = new Date(1899, 11, 30);
      epoch.setDate(epoch.getDate() + val);
      return epoch.toISOString().slice(0, 10);
    }
    return fallback;
  }

  const s = normalizeText(val);

  // dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy
  const frMatch = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (frMatch) {
    const [, day, month, year] = frMatch;
    const d = new Date(+year, +month - 1, +day);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  // yyyy-mm-dd or yyyy/mm/dd
  const isoMatch = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const d = new Date(+year, +month - 1, +day);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  // dd/mm/yy
  const shortMatch = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})$/);
  if (shortMatch) {
    const [, day, month, yr] = shortMatch;
    const year = +yr + (+yr > 50 ? 1900 : 2000);
    const d = new Date(year, +month - 1, +day);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  // Month name formats: "15 Jan 2024", "Jan 15, 2024", "15 janvier 2024"
  const monthNames = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|janv|févr?|mars|avr|mai|juin|juil|août|sept|oct|nov|déc)/i;
  if (monthNames.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? fallback : d.toISOString().slice(0, 10);
}

/** Check if a value looks like a date */
export function looksLikeDate(val: unknown): boolean {
  if (!val) return false;
  if (val instanceof Date) return !isNaN(val.getTime());
  if (typeof val === 'number') return val > 40000 && val < 60000;
  const s = normalizeText(val);
  if (!s) return false;
  // dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy, yyyy-mm-dd, dd/mm/yy
  if (/^\d{1,2}[/\-.]?\d{1,2}[/\-.]?\d{2,4}$/.test(s)) return true;
  if (/^\d{4}[/\-]\d{1,2}[/\-]\d{1,2}$/.test(s)) return true;
  // Month name formats
  const monthNames = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|janv|févr?|mars|avr|mai|juin|juil|août|sept|déc)/i;
  if (monthNames.test(s) && /\d{1,2}/.test(s) && /\d{4}|\d{2}/.test(s)) return true;
  return false;
}

/** Check if a value looks like a number */
function looksLikeNumber(val: unknown): boolean {
  if (val == null || val === '') return false;
  if (typeof val === 'number') return true;
  const s = normalizeText(val).replace(/[$€£¥₹\s\u00A0]/g, '').replace(/[()]/g, '');
  return /^-?\d[\d.,\s]*$/.test(s) && s.length > 0;
}

// ─── Row classification ───────────────────────────────────────────

/** Detect totals/summary rows to ignore */
function isTotalsRow(row: RawRow): boolean {
  const vals = Object.values(row).map(v => normalizeText(v).toLowerCase());
  return vals.some(v =>
    /^total/i.test(v) || /^totaux/i.test(v) || /^sous[\s-]?total/i.test(v) ||
    /^sub[\s-]?total/i.test(v) || /^grand\s*total/i.test(v) ||
    /^solde/i.test(v) || /^totaux\s*du\s*poste/i.test(v) ||
    /^totaux\s*(g[ée]n[ée]raux|du\s*compte|du\s*journal)/i.test(v) ||
    /^report\s*(nouveau|à\s*nouveau)/i.test(v) ||
    /^carried\s*forward/i.test(v) || /^brought\s*forward/i.test(v) ||
    /^balance\s*(c\/d|b\/d|carried|brought)/i.test(v) ||
    v === '---' || v === '===' || v === '***'
  );
}

/** Detect repeated column header rows embedded in data */
function isRepeatedHeaderRow(row: RawRow, originalHeaders: string[]): boolean {
  const vals = Object.values(row).map(v => normalizeText(v).toLowerCase());
  const nonEmpty = vals.filter(v => v.length > 0);
  if (nonEmpty.length < 2) return false;
  const headerLower = originalHeaders.map(h => h.trim().toLowerCase());
  const matchCount = nonEmpty.filter(v => headerLower.includes(v)).length;
  return matchCount >= Math.min(nonEmpty.length * 0.6, 3);
}

// ─── Hierarchical parsing ─────────────────────────────────────────

export type FileStructureType = 'tabular' | 'hierarchical' | 'report';

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

/**
 * Detect an account header row.
 * Account header = starts with a number (>= 3 digits), contains an account label,
 * and does NOT contain a valid date.
 */
function detectAccountHeaderFromValues(values: string[]): { code: string; name: string } | null {
  const hasDate = values.some(v => looksLikeDate(v.trim()));
  if (hasDate) return null; // Account headers should NOT contain dates

  for (const v of values) {
    const s = v.trim();
    // Pattern: "123456 Account Name" (code >= 3 digits followed by text)
    const match = s.match(/^(\d{3,})\s+([A-Za-zÀ-ÿ].+)/);
    if (match) {
      return { code: match[1], name: match[2].trim() };
    }
  }

  // Check if first cell = pure account code, second cell = name
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

  if (!dateVal) return null;
  if (amounts.length === 0) return null;

  let debit = 0;
  let credit = 0;

  if (amounts.length === 1) {
    if (amounts[0] >= 0) debit = amounts[0];
    else credit = Math.abs(amounts[0]);
  } else if (amounts.length >= 2) {
    debit = Math.abs(amounts[0]);
    credit = Math.abs(amounts[1]);
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

  let accountHeaders = 0;
  let transactionRows = 0;
  let totalRows = 0;

  for (const row of rows.slice(0, 100)) {
    if (isEmptyRow(row)) continue;
    totalRows++;

    const values = Object.values(row).map(v => normalizeText(v));
    const acctHeader = detectAccountHeaderFromValues(values);
    if (acctHeader) {
      accountHeaders++;
      continue;
    }

    const hasDate = values.some(v => looksLikeDate(v));
    const hasAmount = values.some(v => looksLikeNumber(v) && parseNumber(v) !== 0);
    if (hasDate && hasAmount) transactionRows++;
  }

  const hierarchicalSignal = totalRows > 0
    ? (accountHeaders >= 2 && transactionRows >= 3) ? 1 : (accountHeaders / totalRows) * 3
    : 0;

  if (tabularScore >= 0.8 && hierarchicalSignal < 0.5) {
    return { type: 'tabular', confidence: tabularScore };
  }

  if (hierarchicalSignal >= 0.5 && accountHeaders >= 2) {
    return { type: 'hierarchical', confidence: Math.min(hierarchicalSignal, 1) };
  }

  return {
    type: tabularScore >= hierarchicalSignal ? 'tabular' : 'hierarchical',
    confidence: Math.max(tabularScore, hierarchicalSignal),
  };
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

    const values = Object.values(row).map(v => normalizeText(v));

    // Check for repeated header rows embedded in data
    if (rowLooksLikeHeader(row)) return;

    const acctHeader = detectAccountHeaderFromValues(values);
    if (acctHeader) {
      currentAccount = acctHeader;
      if (!accounts.find(a => a.code === acctHeader.code)) {
        accounts.push({ code: acctHeader.code, name: acctHeader.name, transactionCount: 0 });
      }
      return;
    }

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

    unparsedRowCount++;
  });

  for (const acct of accounts) {
    acct.transactionCount = accountTxCounts.get(acct.code) || 0;
  }

  return { accounts, transactions, unparsedRowCount };
}

// ─── Preview & tabular types ──────────────────────────────────────

export interface PreviewData {
  headers: string[];
  rows: RawRow[];
  suggestedMapping: ColumnMapping;
  fileName: string;
  confidence: number;
  detectedAccounts: DetectedAccount[];
  isHierarchical: boolean;
  structureType: FileStructureType;
  hierarchicalResult: HierarchicalParseResult | null;
}

export interface ParseResult {
  entries: JournalEntry[];
  mappings: AccountMapping[];
  entriesExtracted: number;
}

/** Compute confidence score for the auto-detected column mapping */
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

/** Read file and return preview data with structure detection + pre-cleaning */
export async function previewFile(file: File): Promise<PreviewData> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows: RawRow[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (!rawRows.length) return {
    headers: [], rows: [], suggestedMapping: autoDetectColumns([]),
    fileName: file.name, confidence: 0, detectedAccounts: [], isHierarchical: false,
    structureType: 'tabular', hierarchicalResult: null,
  };

  // Pre-clean: normalize, find true header, remove artifacts
  const { headers, rows: cleanedRows } = preCleanData(rawRows);

  if (headers.length === 0 || cleanedRows.length === 0) {
    return {
      headers: [], rows: [], suggestedMapping: autoDetectColumns([]),
      fileName: file.name, confidence: 0, detectedAccounts: [], isHierarchical: false,
      structureType: 'tabular', hierarchicalResult: null,
    };
  }

  const suggestedMapping = autoDetectColumns(headers);
  const { type: structureType, confidence: structConfidence } = detectFileStructure(cleanedRows, headers);

  let hierarchicalResult: HierarchicalParseResult | null = null;
  let detectedAccounts: DetectedAccount[] = [];

  if (structureType === 'hierarchical') {
    hierarchicalResult = parseHierarchical(cleanedRows);
    detectedAccounts = hierarchicalResult.accounts;
  }

  const confidence = structureType === 'tabular'
    ? computeConfidence(suggestedMapping, cleanedRows)
    : structConfidence;

  const previewRows = cleanedRows.filter(r => !isEmptyRow(r)).slice(0, 20);

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
  const rawRows: RawRow[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (!rawRows.length) return { entries: [], mappings: [], entriesExtracted: 0 };

  // Pre-clean the data
  const { headers, rows } = preCleanData(rawRows);
  if (rows.length === 0) return { entries: [], mappings: [], entriesExtracted: 0 };

  const entries: JournalEntry[] = [];
  const accountSet = new Map<string, string>();
  let currentAccount: { code: string; name: string } | null = null;

  rows.forEach((row, idx) => {
    if (isEmptyRow(row)) return;
    if (isTotalsRow(row)) return;
    if (isRepeatedHeaderRow(row, headers)) return;

    const vals = Object.values(row);
    let hasAmount = false;
    if (mapping.debit) hasAmount = hasAmount || parseNumber(row[mapping.debit]) !== 0;
    if (mapping.credit) hasAmount = hasAmount || parseNumber(row[mapping.credit]) !== 0;
    if (mapping.amount) hasAmount = hasAmount || parseNumber(row[mapping.amount]) !== 0;

    if (!hasAmount && !(mapping.date && looksLikeDate(row[mapping.date]))) {
      const headerValues = vals.map(v => normalizeText(v));
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

    let accountCode = mapping.account_code ? normalizeText(row[mapping.account_code]).trim() : '';
    let accountName = mapping.account_name
      ? normalizeText(row[mapping.account_name]).trim()
      : (mapping.description ? normalizeText(row[mapping.description]).trim() : '');

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
      reference: mapping.reference ? normalizeText(row[mapping.reference]).trim() : `JE-${String(idx + 1).padStart(3, '0')}`,
      description: mapping.description ? normalizeText(row[mapping.description]).trim() : accountName,
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

// ─── Account type guessing (French PCG + English) ─────────────────

function guessAccountType(code: string, name: string): AccountMapping['type'] {
  const n = name.toLowerCase();
  const c = parseInt(code);

  // French Plan Comptable Général classification
  if (!isNaN(c)) {
    if (c >= 1000 && c < 2000) return 'equity';     // Class 1: Capitaux
    if (c >= 2000 && c < 3000) return 'asset';       // Class 2: Immobilisations
    if (c >= 3000 && c < 4000) return 'asset';       // Class 3: Stocks
    if (c >= 4000 && c < 5000) return 'liability';   // Class 4: Tiers
    if (c >= 5000 && c < 6000) return 'asset';       // Class 5: Financiers
    if (c >= 6000 && c < 7000) return 'expense';     // Class 6: Charges
    if (c >= 7000 && c < 8000) return 'revenue';     // Class 7: Produits
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
