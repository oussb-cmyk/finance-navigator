/**
 * Data Quality Engine — scoring, issue detection, and auto-fix for import rows.
 */

export interface ImportRow {
  date: string;
  accountCode: string;
  accountName: string;
  description: string;
  debit: number;
  credit: number;
}

// ── Issue types ────────────────────────────────────────────────

export type IssueType =
  | 'invalid_date'
  | 'missing_account'
  | 'non_numeric_amount'
  | 'zero_amounts'
  | 'suspicious_date'
  | 'duplicate'
  | 'imbalance';

export interface RowIssue {
  rowIndex: number;
  type: IssueType;
  field: string;
  message: string;
}

export interface IssueSummary {
  type: IssueType;
  label: string;
  count: number;
}

export type QualityLevel = 'high' | 'medium' | 'low';

export interface DataQualityResult {
  score: number;
  level: QualityLevel;
  issues: RowIssue[];
  summary: IssueSummary[];
  totalRows: number;
  cleanRows: number;
}

// ── Helpers ────────────────────────────────────────────────────

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const DATE_DMY = /^\d{2}\/\d{2}\/\d{4}$/;
const DATE_MDY = /^\d{2}-\d{2}-\d{4}$/;

function isValidDate(v: string): boolean {
  if (!v || v.trim() === '') return false;
  const s = v.trim();
  if (DATE_ISO.test(s) || DATE_DMY.test(s) || DATE_MDY.test(s)) {
    const d = new Date(s.includes('/') ? s.split('/').reverse().join('-') : s);
    return !isNaN(d.getTime());
  }
  // Try generic parse
  const d = new Date(s);
  return !isNaN(d.getTime());
}

function isSuspiciousDate(v: string): boolean {
  const d = new Date(v.includes('/') ? v.split('/').reverse().join('-') : v);
  if (isNaN(d.getTime())) return false;
  const year = d.getFullYear();
  return year < 1990 || year > 2060;
}

function rowFingerprint(r: ImportRow): string {
  return `${r.date}|${r.accountCode}|${r.debit}|${r.credit}|${r.description}`;
}

// ── Core quality analysis ──────────────────────────────────────

export function analyzeQuality(rows: ImportRow[]): DataQualityResult {
  const issues: RowIssue[] = [];
  const seen = new Map<string, number>();

  let totalDebit = 0;
  let totalCredit = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];

    // Invalid date
    if (!isValidDate(r.date)) {
      issues.push({ rowIndex: i, type: 'invalid_date', field: 'Date', message: `Invalid date: "${r.date}"` });
    } else if (isSuspiciousDate(r.date)) {
      issues.push({ rowIndex: i, type: 'suspicious_date', field: 'Date', message: `Suspicious year in date: "${r.date}"` });
    }

    // Missing account
    if (!r.accountCode || r.accountCode.trim() === '' || r.accountCode === 'UNKNOWN') {
      issues.push({ rowIndex: i, type: 'missing_account', field: 'Account', message: 'Missing or unknown account number' });
    }

    // Zero amounts
    if (r.debit === 0 && r.credit === 0) {
      issues.push({ rowIndex: i, type: 'zero_amounts', field: 'Amount', message: 'Both debit and credit are zero' });
    }

    // Non-numeric (NaN from upstream)
    if (isNaN(r.debit) || isNaN(r.credit)) {
      issues.push({ rowIndex: i, type: 'non_numeric_amount', field: 'Amount', message: 'Non-numeric amount detected' });
    }

    // Duplicates
    const fp = rowFingerprint(r);
    if (seen.has(fp)) {
      issues.push({ rowIndex: i, type: 'duplicate', field: 'Row', message: `Duplicate of row ${(seen.get(fp)!) + 1}` });
    } else {
      seen.set(fp, i);
    }

    totalDebit += isNaN(r.debit) ? 0 : r.debit;
    totalCredit += isNaN(r.credit) ? 0 : r.credit;
  }

  // Global imbalance
  const imbalance = Math.abs(totalDebit - totalCredit);
  if (imbalance > 0.01 && rows.length > 0) {
    issues.push({
      rowIndex: -1,
      type: 'imbalance',
      field: 'Totals',
      message: `Debit/Credit imbalance: ${imbalance.toFixed(2)} difference`,
    });
  }

  // Summarize
  const typeCounts = new Map<IssueType, number>();
  for (const iss of issues) {
    typeCounts.set(iss.type, (typeCounts.get(iss.type) || 0) + 1);
  }

  const LABELS: Record<IssueType, string> = {
    invalid_date: 'Invalid dates',
    missing_account: 'Missing accounts',
    non_numeric_amount: 'Non-numeric amounts',
    zero_amounts: 'Zero-amount rows',
    suspicious_date: 'Suspicious dates',
    duplicate: 'Duplicate entries',
    imbalance: 'Debit/Credit imbalance',
  };

  const summary: IssueSummary[] = Array.from(typeCounts.entries()).map(([type, count]) => ({
    type,
    label: LABELS[type],
    count,
  }));

  // Score: start at 100, penalize per issue relative to row count
  const rowCount = Math.max(rows.length, 1);
  const rowIssueCount = issues.filter(i => i.rowIndex >= 0).length;
  const globalPenalty = issues.some(i => i.type === 'imbalance') ? 10 : 0;
  const rowPenalty = Math.min(90, Math.round((rowIssueCount / rowCount) * 100));
  const score = Math.max(0, 100 - rowPenalty - globalPenalty);

  const level: QualityLevel = score >= 90 ? 'high' : score >= 60 ? 'medium' : 'low';
  const affectedRows = new Set(issues.filter(i => i.rowIndex >= 0).map(i => i.rowIndex));

  return {
    score,
    level,
    issues,
    summary,
    totalRows: rows.length,
    cleanRows: rows.length - affectedRows.size,
  };
}

// ── Auto-fix ───────────────────────────────────────────────────

function cleanAmount(val: number | string): number {
  if (typeof val === 'number' && !isNaN(val)) return val;
  const s = String(val)
    .replace(/[^\d.,-]/g, '')         // strip currency symbols, spaces
    .replace(/\s/g, '')
    .replace(/,(\d{2})$/, '.$1')      // 1000,00 → 1000.00
    .replace(/,/g, '');               // remaining thousands sep
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function normalizeDate(val: string): string {
  const s = val.trim();
  // DD/MM/YYYY → YYYY-MM-DD
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split('/');
    return `${y}-${m}-${d}`;
  }
  // Already ISO
  if (DATE_ISO.test(s)) return s;
  // Try generic parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return s; // leave as-is if unparseable
}

export function autoFixRows(rows: ImportRow[]): { fixed: ImportRow[]; fixCount: number } {
  let fixCount = 0;
  const seen = new Set<string>();

  const fixed: ImportRow[] = [];
  for (const r of rows) {
    // Skip truly empty rows
    if (!r.date && !r.accountCode && r.debit === 0 && r.credit === 0 && !r.description) {
      fixCount++;
      continue;
    }

    const newDate = normalizeDate(r.date);
    const newDebit = cleanAmount(r.debit);
    const newCredit = cleanAmount(r.credit);
    const newDesc = (r.description || '').trim();
    const newCode = (r.accountCode || '').trim();
    const newName = (r.accountName || '').trim();

    if (newDate !== r.date || newDebit !== r.debit || newCredit !== r.credit ||
        newDesc !== r.description || newCode !== r.accountCode || newName !== r.accountName) {
      fixCount++;
    }

    // Remove exact duplicates
    const fp = `${newDate}|${newCode}|${newDebit}|${newCredit}|${newDesc}`;
    if (seen.has(fp)) {
      fixCount++;
      continue;
    }
    seen.add(fp);

    fixed.push({
      date: newDate,
      accountCode: newCode,
      accountName: newName,
      description: newDesc,
      debit: newDebit,
      credit: newCredit,
    });
  }

  return { fixed, fixCount };
}

// ── UI helpers ─────────────────────────────────────────────────

export function getQualityColor(level: QualityLevel): string {
  switch (level) {
    case 'high': return 'text-success';
    case 'medium': return 'text-warning';
    case 'low': return 'text-destructive';
  }
}

export function getQualityBg(level: QualityLevel): string {
  switch (level) {
    case 'high': return 'bg-success/10 border-success/20';
    case 'medium': return 'bg-warning/10 border-warning/20';
    case 'low': return 'bg-destructive/10 border-destructive/20';
  }
}

export function getRowIssueTypes(rowIndex: number, issues: RowIssue[]): Set<IssueType> {
  const types = new Set<IssueType>();
  for (const iss of issues) {
    if (iss.rowIndex === rowIndex) types.add(iss.type);
  }
  return types;
}

// ── Duplicate removal ─────────────────────────────────────────

export function removeDuplicates(rows: ImportRow[]): { deduped: ImportRow[]; removedCount: number } {
  const seen = new Set<string>();
  const deduped: ImportRow[] = [];
  let removedCount = 0;
  for (const r of rows) {
    const fp = rowFingerprint(r);
    if (seen.has(fp)) {
      removedCount++;
    } else {
      seen.add(fp);
      deduped.push(r);
    }
  }
  return { deduped, removedCount };
}
