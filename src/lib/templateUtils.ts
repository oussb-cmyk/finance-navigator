import * as XLSX from 'xlsx';

// ─── Template column definitions ───────────────────────────────────

export const TEMPLATE_COLUMNS = [
  'Date',
  'Account Number',
  'Account Name',
  'Description',
  'Debit',
  'Credit',
] as const;

const TEMPLATE_EXAMPLE_ROWS = [
  ['2024-01-15', '101000', 'Cash', 'Opening balance', 5000, 0],
  ['2024-01-15', '401000', 'Sales Revenue', 'Invoice #001', 0, 5000],
  ['2024-01-20', '601000', 'Office Supplies', 'Stationery purchase', 250, 0],
  ['2024-01-20', '101000', 'Cash', 'Stationery purchase', 0, 250],
];

/** Generate and download the structured Excel template */
export function downloadTemplate(): void {
  const wb = XLSX.utils.book_new();
  const wsData = [
    [...TEMPLATE_COLUMNS],
    ...TEMPLATE_EXAMPLE_ROWS,
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  ws['!cols'] = [
    { wch: 14 }, // Date
    { wch: 16 }, // Account Number
    { wch: 22 }, // Account Name
    { wch: 30 }, // Description
    { wch: 14 }, // Debit
    { wch: 14 }, // Credit
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Journal Entries');
  XLSX.writeFile(wb, 'journal_template.xlsx');
}

/** Check if uploaded file headers match the template structure */
export function detectTemplateMatch(headers: string[]): {
  isTemplate: boolean;
  mappedColumns: Record<string, string>;
} {
  const normalized = headers.map(h => h.trim().toLowerCase());

  const templatePatterns: Record<string, RegExp[]> = {
    date: [/^date$/],
    accountNumber: [/^account\s*number$/, /^account\s*#$/, /^acct\s*num(ber)?$/],
    accountName: [/^account\s*name$/],
    description: [/^description$/, /^desc$/],
    debit: [/^debit$/],
    credit: [/^credit$/],
  };

  const mapped: Record<string, string> = {};
  let matchCount = 0;

  for (const [role, patterns] of Object.entries(templatePatterns)) {
    for (const h of normalized) {
      if (patterns.some(p => p.test(h))) {
        const originalHeader = headers[normalized.indexOf(h)];
        mapped[role] = originalHeader;
        matchCount++;
        break;
      }
    }
  }

  // Require at least date + debit + credit + one account field
  const hasDate = !!mapped.date;
  const hasDebit = !!mapped.debit;
  const hasCredit = !!mapped.credit;
  const hasAccount = !!mapped.accountNumber || !!mapped.accountName;

  return {
    isTemplate: hasDate && hasDebit && hasCredit && hasAccount && matchCount >= 5,
    mappedColumns: mapped,
  };
}

// ─── Strict validation types ──────────────────────────────────────

export interface TemplateRowError {
  row: number;       // 1-indexed spreadsheet row (header = row 1)
  field: string;
  message: string;
}

export interface TemplateValidationResult {
  valid: boolean;
  entries: {
    date: string;
    accountCode: string;
    accountName: string;
    description: string;
    debit: number;
    credit: number;
  }[];
  errors: TemplateRowError[];
  totalRows: number;
  skippedEmpty: number;
}

/** Strictly validate and parse a template file. Blocks import on any error. */
export function validateAndParseTemplate(
  rows: Record<string, unknown>[],
  mappedColumns: Record<string, string>,
): TemplateValidationResult {
  const entries: TemplateValidationResult['entries'] = [];
  const errors: TemplateRowError[] = [];
  let skippedEmpty = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const spreadsheetRow = i + 2; // Row 1 = header

    const rawDate = row[mappedColumns.date];
    const rawAcctNum = mappedColumns.accountNumber ? row[mappedColumns.accountNumber] : '';
    const rawAcctName = mappedColumns.accountName ? row[mappedColumns.accountName] : '';
    const rawDesc = mappedColumns.description ? row[mappedColumns.description] : '';
    const rawDebit = row[mappedColumns.debit];
    const rawCredit = row[mappedColumns.credit];

    // Skip completely empty rows
    if (!rawDate && !rawDebit && !rawCredit && !rawAcctNum) {
      skippedEmpty++;
      continue;
    }

    let rowHasError = false;

    // 1. Date validation
    const date = parseTemplateDate(rawDate);
    if (!date) {
      errors.push({ row: spreadsheetRow, field: 'Date', message: `Invalid date "${rawDate}"` });
      rowHasError = true;
    }

    // 2. Account Number must not be empty
    const acctNum = String(rawAcctNum ?? '').trim();
    if (!acctNum) {
      errors.push({ row: spreadsheetRow, field: 'Account Number', message: 'Missing account number' });
      rowHasError = true;
    }

    // 3. Debit & Credit must be numeric
    const debit = toNumber(rawDebit);
    const credit = toNumber(rawCredit);

    if (rawDebit != null && String(rawDebit).trim() !== '' && debit === null) {
      errors.push({ row: spreadsheetRow, field: 'Debit', message: `Not a valid number "${rawDebit}"` });
      rowHasError = true;
    }
    if (rawCredit != null && String(rawCredit).trim() !== '' && credit === null) {
      errors.push({ row: spreadsheetRow, field: 'Credit', message: `Not a valid number "${rawCredit}"` });
      rowHasError = true;
    }

    // 4. At least one of Debit or Credit must be filled (non-zero)
    const dVal = debit ?? 0;
    const cVal = credit ?? 0;
    if (dVal === 0 && cVal === 0) {
      errors.push({ row: spreadsheetRow, field: 'Debit/Credit', message: 'Both Debit and Credit are zero or empty' });
      rowHasError = true;
    }

    if (!rowHasError) {
      entries.push({
        date: date!,
        accountCode: acctNum,
        accountName: String(rawAcctName ?? '').trim(),
        description: String(rawDesc ?? '').trim(),
        debit: dVal,
        credit: cVal,
      });
    }
  }

  return {
    valid: errors.length === 0,
    entries,
    errors,
    totalRows: rows.length - skippedEmpty,
    skippedEmpty,
  };
}

/** @deprecated Use validateAndParseTemplate instead */
export function parseTemplateFile(
  rows: Record<string, unknown>[],
  mappedColumns: Record<string, string>,
) {
  const result = validateAndParseTemplate(rows, mappedColumns);
  return {
    entries: result.entries,
    errors: result.errors.map(e => `Row ${e.row}: ${e.message}`),
  };
}

function parseTemplateDate(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(val).trim();
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  // MM/DD/YYYY
  const mdy = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (mdy) {
    const m = parseInt(mdy[1]), d = parseInt(mdy[2]);
    if (m <= 12 && d <= 31) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  }
  return null;
}

function toNumber(val: unknown): number | null {
  if (val == null || String(val).trim() === '') return null;
  if (typeof val === 'number') return val;
  let s = String(val).trim();
  s = s.replace(/[€$£¥,\s]/g, '');
  s = s.replace(/\u00A0/g, '');
  // Handle French decimals: replace last comma with dot if no dot present
  if (s.includes(',') && !s.includes('.')) {
    const lastComma = s.lastIndexOf(',');
    s = s.substring(0, lastComma) + '.' + s.substring(lastComma + 1);
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
