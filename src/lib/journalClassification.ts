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
  { prefix: '66', journal: 'financing' },
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
  {
    journal: 'financing',
    pattern: /\b(emprunt|loan|prêt|crédit-bail|leasing|obligation|borrowing|dette\s*financière|remboursement\s*emprunt)\b/i,
  },
];

// ── Account vs Description consistency rules ────────────────────────

interface ConsistencyRule {
  accountPrefix: string;
  forbiddenPattern: RegExp;
  expectedJournal: JournalType;
  suggestedAccount: string;
  suggestedLabel: string;
  message: string;
}

const CONSISTENCY_RULES: ConsistencyRule[] = [
  { accountPrefix: '6', forbiddenPattern: /\b(emprunt|loan|prêt|crédit-bail|leasing|borrowing|remboursement\s*emprunt|dette\s*financière)\b/i,
    expectedJournal: 'financing', suggestedAccount: '164', suggestedLabel: 'Emprunts auprès des établissements de crédit',
    message: 'Financing keywords detected in an expense account' },
  { accountPrefix: '6', forbiddenPattern: /\b(facture\s*client|vente|sale|revenue|chiffre\s*d'affaires)\b/i,
    expectedJournal: 'sales', suggestedAccount: '701', suggestedLabel: 'Ventes de produits finis',
    message: 'Sales keywords detected in an expense account' },
  { accountPrefix: '7', forbiddenPattern: /\b(achat|fournisseur|purchase|supplier|vendor|facture\s*fourn|procurement)\b/i,
    expectedJournal: 'purchases', suggestedAccount: '601', suggestedLabel: 'Achats stockés - Matières premières',
    message: 'Purchase keywords detected in a revenue account' },
  { accountPrefix: '7', forbiddenPattern: /\b(salaire|salary|paie|payroll|cotisation|urssaf)\b/i,
    expectedJournal: 'payroll', suggestedAccount: '641', suggestedLabel: 'Rémunérations du personnel',
    message: 'Payroll keywords detected in a revenue account' },
  { accountPrefix: '5', forbiddenPattern: /\b(tva|vat|tax|taxe|impôt|contribution|cfe|cvae)\b/i,
    expectedJournal: 'tax', suggestedAccount: '445', suggestedLabel: 'État - Taxes sur le chiffre d\'affaires',
    message: 'Tax keywords detected in a bank/cash account' },
  { accountPrefix: '10', forbiddenPattern: /\b(achat|purchase|fournisseur|supplier|facture\s*fourn)\b/i,
    expectedJournal: 'purchases', suggestedAccount: '401', suggestedLabel: 'Fournisseurs',
    message: 'Purchase keywords detected in an equity account' },
  { accountPrefix: '401', forbiddenPattern: /\b(facture\s*client|vente|sale|revenue|client)\b/i,
    expectedJournal: 'sales', suggestedAccount: '411', suggestedLabel: 'Clients',
    message: 'Sales keywords detected in a supplier account' },
  { accountPrefix: '411', forbiddenPattern: /\b(achat|fournisseur|purchase|supplier|vendor)\b/i,
    expectedJournal: 'purchases', suggestedAccount: '401', suggestedLabel: 'Fournisseurs',
    message: 'Purchase keywords detected in a client account' },
];

function checkConsistency(code: string, text: string): {
  inconsistent: boolean; penalty: number; message: string;
  suggestedAccount?: string; suggestedLabel?: string; expectedJournal?: JournalType;
} {
  for (const rule of CONSISTENCY_RULES) {
    if (code.startsWith(rule.accountPrefix) && rule.forbiddenPattern.test(text)) {
      return { inconsistent: true, penalty: 50, message: rule.message,
        suggestedAccount: rule.suggestedAccount, suggestedLabel: rule.suggestedLabel, expectedJournal: rule.expectedJournal };
    }
  }
  return { inconsistent: false, penalty: 0, message: '' };
}

// ── Confidence scoring ──────────────────────────────────────────────

export type ClassificationConfidence = 'high' | 'medium' | 'low';

export interface ClassificationResult {
  journal: JournalType;
  confidence: number;          // 0–100
  level: ClassificationConfidence;
  reason: string;
  suggestion?: string;         // hint for the user when confidence is low
  inconsistency?: string;      // mismatch warning message
  suggestedAccount?: string;   // suggested account code on mismatch
  suggestedAccountLabel?: string;
}

function levelFromScore(score: number): ClassificationConfidence {
  if (score >= 85) return 'high';
  if (score >= 60) return 'medium';
  return 'low';
}

/**
 * Classify a single entry and compute a confidence score.
 */
export function classifyWithConfidence(entry: JournalEntry): ClassificationResult {
  const code = (entry.accountCode || '').replace(/\D/g, '');
  const text = `${entry.description} ${entry.reference}`;

  const hasAccount = !!code;
  const hasAmount = entry.debit > 0 || entry.credit > 0;
  const hasDate = !!entry.date;

  if (!hasAmount || !hasDate) {
    const journal = hasAccount ? classifyByAccount(code) ?? classifyByKeyword(text) ?? 'general' : 'general';
    const missing: string[] = [];
    if (!hasAmount) missing.push('zero amounts');
    if (!hasDate) missing.push('missing date');
    return {
      journal,
      confidence: Math.min(30, hasAccount ? 30 : 10),
      level: 'low',
      reason: `Needs review: ${missing.join(', ')}`,
      suggestion: 'Verify this entry has valid amounts and date before proceeding.',
    };
  }

  // 1) Account-prefix match
  if (hasAccount) {
    const accountJournal = classifyByAccount(code);
    if (accountJournal) {
      const matchedRule = ACCOUNT_RULES.find(r => code.startsWith(r.prefix));
      const prefixLen = matchedRule?.prefix.length ?? 1;
      let score = Math.min(95, 80 + prefixLen * 5);

      // Consistency check: account class vs description keywords
      const con = checkConsistency(code, text);
      if (con.inconsistent) {
        score = Math.min(score, 40);
        return {
          journal: accountJournal,
          confidence: score,
          level: levelFromScore(score),
          reason: `Account prefix ${matchedRule?.prefix} → ${accountJournal}`,
          inconsistency: con.message,
          suggestion: `Account may be incorrect. Suggested: ${con.suggestedAccount} — ${con.suggestedLabel}`,
          suggestedAccount: con.suggestedAccount,
          suggestedAccountLabel: con.suggestedLabel,
        };
      }

      return {
        journal: accountJournal,
        confidence: score,
        level: levelFromScore(score),
        reason: `Account prefix ${matchedRule?.prefix} → ${accountJournal}`,
      };
    }
  }

  // 2) Keyword match
  const keywordJournal = classifyByKeyword(text);
  if (keywordJournal) {
    return {
      journal: keywordJournal,
      confidence: 65,
      level: 'medium',
      reason: `Keyword match in description → ${keywordJournal}`,
      suggestion: `Suggested: ${capitalize(keywordJournal)} (based on description keywords)`,
    };
  }

  // 3) Account exists but no rule matched
  if (hasAccount) {
    return {
      journal: 'general',
      confidence: 45,
      level: 'low',
      reason: 'Account exists but no specific classification rule matched',
      suggestion: 'Review and assign the correct journal type manually.',
    };
  }

  // 4) No match at all
  return {
    journal: 'general',
    confidence: 20,
    level: 'low',
    reason: 'No account number or keyword match',
    suggestion: 'Missing account code — assign journal manually.',
  };
}

function classifyByAccount(code: string): JournalType | null {
  for (const rule of ACCOUNT_RULES) {
    if (code.startsWith(rule.prefix)) return rule.journal;
  }
  return null;
}

function classifyByKeyword(text: string): JournalType | null {
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(text)) return rule.journal;
  }
  return null;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Classify a single entry (simple — backward compatible).
 */
export function detectJournalType(entry: JournalEntry): JournalType {
  return classifyWithConfidence(entry).journal;
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
