// ─── Standard French Poste / Category lists ──────────────────────────

export const POSTES = [
  'Masse salariale',
  'Loyer et charges locatives',
  'Publicité et marketing',
  'Frais bancaires',
  'Honoraires et conseils',
  'Fournitures et consommables',
  'Déplacements et missions',
  'Assurances',
  'Télécommunications',
  'Logiciels et abonnements',
  'Impôts et taxes',
  'Chiffre d\'affaires',
  'Subventions',
  'Investissements',
  'Emprunts et financements',
  'Remboursements clients',
  'Frais de personnel divers',
  'Entretien et réparations',
  'Formation',
  'Amortissements',
  'Autres charges',
  'Autres produits',
] as const;

export const CATEGORIES_TRESO = [
  'Encaissement client',
  'Décaissement fournisseur',
  'Salaires et charges sociales',
  'Loyer',
  'Impôts',
  'Frais bancaires',
  'Investissement',
  'Financement',
  'TVA',
  'Remboursement',
  'Divers',
] as const;

export const CATEGORIES_PNL = [
  'Chiffre d\'affaires',
  'Achats et charges externes',
  'Charges de personnel',
  'Impôts et taxes',
  'Dotations amortissements',
  'Charges financières',
  'Produits financiers',
  'Charges exceptionnelles',
  'Produits exceptionnels',
  'Autres produits',
  'Autres charges',
] as const;

export type Poste = typeof POSTES[number] | string;
export type CategorieTreso = typeof CATEGORIES_TRESO[number] | string;
export type CategoriePnL = typeof CATEGORIES_PNL[number] | string;

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  sourceAccount: string;
  poste: Poste;
  categorieTreso: CategorieTreso;
  categoriePnL: CategoriePnL;
  tva: number;
  entity: string;
  source: string;
  isMapped: boolean;
}

export interface TransactionAutoSuggestion {
  poste: Poste;
  categorieTreso: CategorieTreso;
  categoriePnL: CategoriePnL;
  confidence: number;
}

// Detection result when checking file type
export type FileDataType = 'general_ledger' | 'transaction';
