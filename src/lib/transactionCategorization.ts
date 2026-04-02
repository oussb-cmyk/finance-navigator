import type { TransactionAutoSuggestion, Poste, CategorieTreso, CategoriePnL } from '@/types/transaction';

interface KeywordRule {
  patterns: RegExp[];
  poste: Poste;
  categorieTreso: CategorieTreso;
  categoriePnL: CategoriePnL;
  weight: number;
}

const KEYWORD_RULES: KeywordRule[] = [
  {
    patterns: [/\b(urssaf|cotisation|charges?\s+sociales?)\b/i],
    poste: 'Masse salariale', categorieTreso: 'Salaires et charges sociales', categoriePnL: 'Charges de personnel', weight: 90,
  },
  {
    patterns: [/\b(salaire|paie|paye|salary|wages|payroll)\b/i],
    poste: 'Masse salariale', categorieTreso: 'Salaires et charges sociales', categoriePnL: 'Charges de personnel', weight: 90,
  },
  {
    patterns: [/\b(loyer|rent|bail|lease)\b/i],
    poste: 'Loyer et charges locatives', categorieTreso: 'Loyer', categoriePnL: 'Achats et charges externes', weight: 85,
  },
  {
    patterns: [/\b(google\s*ads|facebook\s*ads|meta\s*ads|linkedin\s*ads|publicit[eé]|advertising|marketing|campagne)\b/i],
    poste: 'Publicité et marketing', categorieTreso: 'Décaissement fournisseur', categoriePnL: 'Achats et charges externes', weight: 85,
  },
  {
    patterns: [/\b(qonto|banque|bank\s*fee|commission\s*banc|frais?\s*bancaire|agios?)\b/i],
    poste: 'Frais bancaires', categorieTreso: 'Frais bancaires', categoriePnL: 'Charges financières', weight: 85,
  },
  {
    patterns: [/\b(avocat|notaire|comptable|expert|lawyer|attorney|audit|conseil|consultant)\b/i],
    poste: 'Honoraires et conseils', categorieTreso: 'Décaissement fournisseur', categoriePnL: 'Achats et charges externes', weight: 80,
  },
  {
    patterns: [/\b(fourniture|office\s*supply|papeterie|consommable)\b/i],
    poste: 'Fournitures et consommables', categorieTreso: 'Décaissement fournisseur', categoriePnL: 'Achats et charges externes', weight: 75,
  },
  {
    patterns: [/\b(d[eé]placement|mission|voyage|transport|travel|flight|train|uber|taxi)\b/i],
    poste: 'Déplacements et missions', categorieTreso: 'Décaissement fournisseur', categoriePnL: 'Achats et charges externes', weight: 80,
  },
  {
    patterns: [/\b(assurance|insurance|mutuelle|pr[eé]voyance)\b/i],
    poste: 'Assurances', categorieTreso: 'Décaissement fournisseur', categoriePnL: 'Achats et charges externes', weight: 80,
  },
  {
    patterns: [/\b(t[eé]l[eé]com|internet|mobile|sfr|orange|bouygues|free|ovh|phone)\b/i],
    poste: 'Télécommunications', categorieTreso: 'Décaissement fournisseur', categoriePnL: 'Achats et charges externes', weight: 75,
  },
  {
    patterns: [/\b(saas|logiciel|software|abonnement|subscription|licence|slack|notion|figma|github|aws|azure|gcp)\b/i],
    poste: 'Logiciels et abonnements', categorieTreso: 'Décaissement fournisseur', categoriePnL: 'Achats et charges externes', weight: 80,
  },
  {
    patterns: [/\b(tva|vat|taxe|tax|imp[oô]t|cfe|cvae|csg|crds)\b/i],
    poste: 'Impôts et taxes', categorieTreso: 'Impôts', categoriePnL: 'Impôts et taxes', weight: 85,
  },
  {
    patterns: [/\b(facture?\s*(client|vente)|invoice|chiffre\s*d'affaires|ca\s*mensuel|revenue|vente|sale)\b/i],
    poste: "Chiffre d'affaires", categorieTreso: 'Encaissement client', categoriePnL: "Chiffre d'affaires", weight: 85,
  },
  {
    patterns: [/\b(subvention|grant|aide|bpi|region|subsidy)\b/i],
    poste: 'Subventions', categorieTreso: 'Encaissement client', categoriePnL: 'Autres produits', weight: 80,
  },
  {
    patterns: [/\b(emprunt|loan|cr[eé]dit|financing|pr[eê]t|leasing)\b/i],
    poste: 'Emprunts et financements', categorieTreso: 'Financement', categoriePnL: 'Charges financières', weight: 80,
  },
  {
    patterns: [/\b(formation|training|s[eé]minaire|workshop|conference)\b/i],
    poste: 'Formation', categorieTreso: 'Décaissement fournisseur', categoriePnL: 'Achats et charges externes', weight: 75,
  },
  {
    patterns: [/\b(entretien|r[eé]paration|maintenance|repair)\b/i],
    poste: 'Entretien et réparations', categorieTreso: 'Décaissement fournisseur', categoriePnL: 'Achats et charges externes', weight: 75,
  },
  {
    patterns: [/\b(remboursement|refund|avoir|credit\s*note)\b/i],
    poste: 'Remboursements clients', categorieTreso: 'Remboursement', categoriePnL: 'Autres charges', weight: 70,
  },
];

export interface LearnedPattern {
  description: RegExp | string;
  poste: Poste;
  categorieTreso: CategorieTreso;
  categoriePnL: CategoriePnL;
}

/**
 * Auto-categorize a transaction based on description keywords.
 * Optionally accepts user-learned patterns which are tried first.
 */
export function autoCategorize(
  description: string,
  amount: number,
  learnedPatterns: LearnedPattern[] = [],
): TransactionAutoSuggestion {
  const text = description.toLowerCase();

  // 1. User-learned patterns first (highest priority)
  for (const lp of learnedPatterns) {
    const pat = typeof lp.description === 'string' ? new RegExp(lp.description, 'i') : lp.description;
    if (pat.test(text)) {
      return { poste: lp.poste, categorieTreso: lp.categorieTreso, categoriePnL: lp.categoriePnL, confidence: 95 };
    }
  }

  // 2. Rule-based matching
  let bestMatch: KeywordRule | null = null;
  let bestWeight = 0;

  for (const rule of KEYWORD_RULES) {
    for (const pat of rule.patterns) {
      if (pat.test(text) && rule.weight > bestWeight) {
        bestMatch = rule;
        bestWeight = rule.weight;
      }
    }
  }

  if (bestMatch) {
    return {
      poste: bestMatch.poste,
      categorieTreso: bestMatch.categorieTreso,
      categoriePnL: bestMatch.categoriePnL,
      confidence: bestMatch.weight,
    };
  }

  // 3. Amount-based fallback
  if (amount > 0) {
    return { poste: "Chiffre d'affaires", categorieTreso: 'Encaissement client', categoriePnL: "Chiffre d'affaires", confidence: 30 };
  }

  return { poste: 'Autres charges', categorieTreso: 'Divers', categoriePnL: 'Autres charges', confidence: 20 };
}

/**
 * Detect if file columns indicate transaction data vs GL.
 */
export function detectTransactionColumns(headers: string[]): boolean {
  const h = headers.map(h => h.toLowerCase().trim());
  
  // Transaction indicators
  const txIndicators = [
    /poste/i, /cat[eé]gorie\s*(tréso|treso|p&l|pnl)/i, /amount/i, /montant/i,
    /source\s*account/i, /compte\s*source/i, /entity/i, /entit[eé]/i,
  ];
  
  // GL indicators (strict debit/credit structure)
  const glIndicators = [
    /^debit$/i, /^credit$/i, /^d[eé]bit$/i, /^cr[eé]dit$/i,
    /account\s*(code|number)/i, /num[eé]ro?\s*de?\s*compte/i,
    /compte\s*g[eé]n[eé]ral/i,
  ];

  const txScore = txIndicators.filter(pat => h.some(col => pat.test(col))).length;
  const glScore = glIndicators.filter(pat => h.some(col => pat.test(col))).length;

  // If we have tx-specific columns or lack GL structure
  if (txScore >= 2) return true;
  
  // Single amount column without debit/credit → transaction
  const hasAmount = h.some(c => /^(amount|montant)$/i.test(c));
  const hasDebitCredit = h.some(c => /^(debit|d[eé]bit)$/i.test(c)) && h.some(c => /^(credit|cr[eé]dit)$/i.test(c));
  if (hasAmount && !hasDebitCredit) return true;

  return txScore > glScore;
}
