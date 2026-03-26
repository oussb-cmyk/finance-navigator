import type { JournalEntry, JournalType } from '@/types/finance';

/**
 * Full French Plan Comptable Général (PCG) classification engine.
 * Priority: 1) Account number prefix  2) Description keywords  3) Fallback "general"
 */

// ── Account-prefix rules (PCG Classes 1–7) ──────────────────────────

interface AccountRule {
  /** Prefix string to match (longest-prefix wins) */
  prefix: string;
  journal: JournalType;
}

/**
 * Order matters: longer prefixes are checked first so that e.g. "401" beats "4".
 * The list is sorted by prefix length desc at module load.
 */
const ACCOUNT_RULES: AccountRule[] = ([
  // Class 4 — detailed sub-ranges
  { prefix: '401', journal: 'purchases' },
  { prefix: '402', journal: 'purchases' },
  { prefix: '403', journal: 'purchases' },
  { prefix: '404', journal: 'purchases' },
  { prefix: '405', journal: 'purchases' },
  { prefix: '406', journal: 'purchases' },
  { prefix: '407', journal: 'purchases' },
  { prefix: '408', journal: 'purchases' },
  { prefix: '411', journal: 'sales' },
  { prefix: '412', journal: 'sales' },
  { prefix: '413', journal: 'sales' },
  { prefix: '414', journal: 'sales' },
  { prefix: '415', journal: 'sales' },
  { prefix: '416', journal: 'sales' },
  { prefix: '417', journal: 'sales' },
  { prefix: '418', journal: 'sales' },
  { prefix: '421', journal: 'payroll' },
  { prefix: '422', journal: 'payroll' },
  { prefix: '423', journal: 'payroll' },
  { prefix: '424', journal: 'payroll' },
  { prefix: '425', journal: 'payroll' },
  { prefix: '426', journal: 'payroll' },
  { prefix: '427', journal: 'payroll' },
  { prefix: '428', journal: 'payroll' },
  { prefix: '431', journal: 'payroll' },
  { prefix: '432', journal: 'payroll' },
  { prefix: '433', journal: 'payroll' },
  { prefix: '434', journal: 'payroll' },
  { prefix: '435', journal: 'payroll' },
  { prefix: '436', journal: 'payroll' },
  { prefix: '437', journal: 'payroll' },
  { prefix: '445', journal: 'tax' },
  { prefix: '447', journal: 'tax' },

  // Class 5 — Cash & Bank
  { prefix: '512', journal: 'bank' },
  { prefix: '514', journal: 'bank' },
  { prefix: '515', journal: 'bank' },
  { prefix: '516', journal: 'bank' },
  { prefix: '517', journal: 'bank' },
  { prefix: '518', journal: 'bank' },
  { prefix: '519', journal: 'bank' },
  { prefix: '53', journal: 'cash' },
  { prefix: '54', journal: 'cash' },
  { prefix: '58', journal: 'bank' },

  // Class 6 — Expenses (sub-detail)
  { prefix: '641', journal: 'payroll' },
  { prefix: '642', journal: 'payroll' },
  { prefix: '643', journal: 'payroll' },
  { prefix: '644', journal: 'payroll' },
  { prefix: '645', journal: 'payroll' },
  { prefix: '646', journal: 'payroll' },
  { prefix: '647', journal: 'payroll' },
  { prefix: '648', journal: 'payroll' },
  { prefix: '631', journal: 'tax' },
  { prefix: '635', journal: 'tax' },
  { prefix: '637', journal: 'tax' },
  { prefix: '64', journal: 'payroll' },
  { prefix: '63', journal: 'tax' },
  { prefix: '6', journal: 'purchases' },

  // Class 7 — Revenue
  { prefix: '7', journal: 'sales' },

  // Class 1 — Equity & Capital (detailed)
  { prefix: '16', journal: 'financing' },
  { prefix: '17', journal: 'financing' },
  { prefix: '168', journal: 'financing' },
  { prefix: '164', journal: 'financing' },
  { prefix: '1', journal: 'general' },

  // Class 2 — Fixed Assets
  { prefix: '28', journal: 'general' },
  { prefix: '2', journal: 'general' },

  // Class 3 — Inventory → Purchases (stock is part of purchasing cycle)
  { prefix: '3', journal: 'purchases' },

  // Class 4 catch-all (misc third parties)
  { prefix: '44', journal: 'tax' },
  { prefix: '4', journal: 'general' },

  // Class 5 catch-all
  { prefix: '51', journal: 'bank' },
  { prefix: '5', journal: 'bank' },
] as AccountRule[]).sort((a, b) => b.prefix.length - a.prefix.length);

// ── Keyword rules ───────────────────────────────────────────────────

interface KeywordRule {
  journal: JournalType;
  pattern: RegExp;
}

const KEYWORD_RULES: KeywordRule[] = [
  {
    journal: 'sales',
    pattern: /\b(facture\s*client|vente|sale|invoice|revenue|chiffre\s*d'affaires|CA\b|product\s*revenue|service\s*revenue)\b/i,
  },
  {
    journal: 'purchases',
    pattern: /\b(achat|fournisseur|purchase|supplier|vendor|expense|charge|facture\s*fourn|procurement)\b/i,
  },
  {
    journal: 'bank',
    pattern: /\b(banque|bank|virement|transfer|wire|sepa|prélèvement|direct\s*debit|cheque|chèque|cb\b|carte\s*bancaire)\b/i,
  },
  {
    journal: 'cash',
    pattern: /\b(caisse|cash|espèces|petty\s*cash|liquide)\b/i,
  },
  {
    journal: 'payroll',
    pattern: /\b(salaire|salary|paie|payroll|employee|cotisation|social\s*charge|urssaf|retraite|mutuelle)\b/i,
  },
  {
    journal: 'tax',
    pattern: /\b(tva|vat|tax|taxe|impôt|contribution|cfe|cvae|is\b|ir\b)\b/i,
  },
];

// ── Public API ──────────────────────────────────────────────────────

/**
 * Classify a single entry.
 * Returns the detected JournalType using PCG account-prefix first,
 * then keyword matching, then defaults to 'general'.
 */
export function detectJournalType(entry: JournalEntry): JournalType {
  const code = (entry.accountCode || '').replace(/\D/g, '');

  // 1) Account-prefix match (highest priority)
  if (code.length > 0) {
    for (const rule of ACCOUNT_RULES) {
      if (code.startsWith(rule.prefix)) {
        return rule.journal;
      }
    }
  }

  // 2) Keyword match on description + reference
  const text = `${entry.description} ${entry.reference}`;
  let bestKeyword: JournalType | null = null;
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(text)) {
      bestKeyword = rule.journal;
      break;
    }
  }
  if (bestKeyword) return bestKeyword;

  // 3) Fallback
  return 'general';
}

/** Classify all entries that don't already have a journalType. */
export function classifyEntries(entries: JournalEntry[]): JournalEntry[] {
  return entries.map((e) => ({
    ...e,
    journalType: e.journalType || detectJournalType(e),
  }));
}

/** Re-classify all entries (overwrite existing). */
export function reclassifyEntries(entries: JournalEntry[]): JournalEntry[] {
  return entries.map((e) => ({
    ...e,
    journalType: detectJournalType(e),
  }));
}
