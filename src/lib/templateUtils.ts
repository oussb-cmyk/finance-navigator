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

/** Parse a template-matched file directly without AI detection */
export function parseTemplateFile(
  rows: Record<string, unknown>[],
  mappedColumns: Record<string, string>,
): {
  entries: {
    date: string;
    accountCode: string;
    accountName: string;
    description: string;
    debit: number;
    credit: number;
  }[];
  errors: string[];
} {
  const entries: ReturnType<typeof parseTemplateFile>['entries'] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rawDate = row[mappedColumns.date];
    const rawAcctNum = mappedColumns.accountNumber ? row[mappedColumns.accountNumber] : '';
    const rawAcctName = mappedColumns.accountName ? row[mappedColumns.accountName] : '';
    const rawDesc = mappedColumns.description ? row[mappedColumns.description] : '';
    const rawDebit = row[mappedColumns.debit];
    const rawCredit = row[mappedColumns.credit];

    // Skip empty rows
    if (!rawDate && !rawDebit && !rawCredit) continue;

    // Validate date
    const date = parseTemplateDate(rawDate);
    if (!date) {
      errors.push(`Row ${i + 2}: Invalid date "${rawDate}"`);
      continue;
    }

    // Validate numbers
    const debit = toNumber(rawDebit);
    const credit = toNumber(rawCredit);

    if (debit === null && credit === null) {
      errors.push(`Row ${i + 2}: No valid numeric debit or credit`);
      continue;
    }

    entries.push({
      date,
      accountCode: String(rawAcctNum ?? '').trim(),
      accountName: String(rawAcctName ?? '').trim(),
      description: String(rawDesc ?? '').trim(),
      debit: debit ?? 0,
      credit: credit ?? 0,
    });
  }

  return { entries, errors };
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
