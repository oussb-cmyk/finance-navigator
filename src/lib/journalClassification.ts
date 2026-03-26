import type { JournalEntry, JournalType } from '@/types/finance';

interface ClassificationRule {
  type: JournalType;
  descriptionKeywords: RegExp;
  accountRanges?: [number, number][];
  referencePatterns?: RegExp;
}

const RULES: ClassificationRule[] = [
  {
    type: 'sales',
    descriptionKeywords: /\b(sale|vente|invoice|facture\s*client|revenue|chiffre|CA|product\s*revenue|service\s*revenue)\b/i,
    accountRanges: [[700, 709], [411, 411]],
    referencePatterns: /^(VE|FAC|INV|SA)/i,
  },
  {
    type: 'purchases',
    descriptionKeywords: /\b(purchase|achat|fournisseur|supplier|vendor|expense|charge|facture\s*fourn|procurement)\b/i,
    accountRanges: [[600, 629], [401, 401]],
    referencePatterns: /^(ACH|HA|PO|AP)/i,
  },
  {
    type: 'bank',
    descriptionKeywords: /\b(bank|banque|virement|transfer|wire|sepa|prélèvement|direct\s*debit|cheque|chèque|cb\b|carte\s*bancaire)\b/i,
    accountRanges: [[512, 519]],
    referencePatterns: /^(BQ|BK|VIR)/i,
  },
  {
    type: 'cash',
    descriptionKeywords: /\b(cash|caisse|espèces|petty\s*cash|liquide)\b/i,
    accountRanges: [[530, 539]],
    referencePatterns: /^(CA|CSH)/i,
  },
];

function matchAccountRange(code: string, ranges: [number, number][]): boolean {
  const num = parseInt(code, 10);
  if (isNaN(num)) return false;
  return ranges.some(([min, max]) => num >= min && num <= max);
}

export function detectJournalType(entry: JournalEntry): JournalType {
  let bestMatch: JournalType = 'general';
  let bestScore = 0;

  for (const rule of RULES) {
    let score = 0;

    if (rule.descriptionKeywords.test(entry.description)) score += 3;
    if (rule.referencePatterns && rule.referencePatterns.test(entry.reference)) score += 2;
    if (rule.accountRanges && entry.accountCode && matchAccountRange(entry.accountCode, rule.accountRanges)) score += 4;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = rule.type;
    }
  }

  return bestMatch;
}

export function classifyEntries(entries: JournalEntry[]): JournalEntry[] {
  return entries.map(e => ({
    ...e,
    journalType: e.journalType || detectJournalType(e),
  }));
}
