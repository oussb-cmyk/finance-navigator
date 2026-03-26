/**
 * French Plan Comptable Général (PCG) — common accounts for autocomplete.
 * Each entry has a code and a bilingual label.
 */
export interface PCGAccount {
  code: string;
  label: string;
}

export const PCG_ACCOUNTS: PCGAccount[] = [
  // Class 1 — Capitaux
  { code: '101', label: 'Capital social' },
  { code: '106', label: 'Réserves' },
  { code: '108', label: 'Compte de l\'exploitant' },
  { code: '110', label: 'Report à nouveau' },
  { code: '120', label: 'Résultat de l\'exercice (bénéfice)' },
  { code: '129', label: 'Résultat de l\'exercice (perte)' },
  { code: '131', label: 'Subventions d\'équipement' },
  { code: '164', label: 'Emprunts auprès des établissements de crédit' },
  { code: '165', label: 'Dépôts et cautionnements reçus' },
  { code: '168', label: 'Autres emprunts et dettes assimilées' },

  // Class 2 — Immobilisations
  { code: '201', label: 'Frais d\'établissement' },
  { code: '205', label: 'Concessions, brevets, licences' },
  { code: '206', label: 'Droit au bail' },
  { code: '207', label: 'Fonds commercial' },
  { code: '211', label: 'Terrains' },
  { code: '213', label: 'Constructions' },
  { code: '215', label: 'Installations techniques, matériel' },
  { code: '218', label: 'Autres immobilisations corporelles' },
  { code: '261', label: 'Titres de participation' },
  { code: '271', label: 'Titres immobilisés' },
  { code: '275', label: 'Dépôts et cautionnements versés' },
  { code: '280', label: 'Amortissements des immobilisations' },
  { code: '281', label: 'Amortissements des immobilisations corporelles' },

  // Class 3 — Stocks
  { code: '311', label: 'Matières premières' },
  { code: '321', label: 'En-cours de production' },
  { code: '355', label: 'Produits finis' },
  { code: '371', label: 'Marchandises' },
  { code: '391', label: 'Provisions pour dépréciation des stocks' },

  // Class 4 — Tiers
  { code: '401', label: 'Fournisseurs' },
  { code: '403', label: 'Fournisseurs — effets à payer' },
  { code: '404', label: 'Fournisseurs d\'immobilisations' },
  { code: '408', label: 'Fournisseurs — factures non parvenues' },
  { code: '411', label: 'Clients' },
  { code: '413', label: 'Clients — effets à recevoir' },
  { code: '416', label: 'Clients douteux ou litigieux' },
  { code: '418', label: 'Clients — produits non encore facturés' },
  { code: '421', label: 'Personnel — rémunérations dues' },
  { code: '425', label: 'Personnel — avances et acomptes' },
  { code: '431', label: 'Sécurité sociale' },
  { code: '437', label: 'Autres organismes sociaux' },
  { code: '4455', label: 'TVA à décaisser' },
  { code: '4456', label: 'TVA déductible' },
  { code: '4457', label: 'TVA collectée' },
  { code: '4458', label: 'TVA à régulariser' },
  { code: '447', label: 'Autres impôts, taxes et versements assimilés' },
  { code: '455', label: 'Associés — comptes courants' },
  { code: '467', label: 'Autres comptes débiteurs ou créditeurs' },
  { code: '471', label: 'Comptes d\'attente' },
  { code: '486', label: 'Charges constatées d\'avance' },
  { code: '487', label: 'Produits constatés d\'avance' },

  // Class 5 — Financiers
  { code: '512', label: 'Banque' },
  { code: '514', label: 'Chèques postaux' },
  { code: '517', label: 'Autres organismes financiers' },
  { code: '530', label: 'Caisse' },
  { code: '531', label: 'Caisse en monnaie nationale' },
  { code: '580', label: 'Virements internes' },

  // Class 6 — Charges
  { code: '601', label: 'Achats de matières premières' },
  { code: '602', label: 'Achats d\'autres approvisionnements' },
  { code: '604', label: 'Achats d\'études et prestations' },
  { code: '606', label: 'Achats non stockés' },
  { code: '607', label: 'Achats de marchandises' },
  { code: '6091', label: 'Rabais, remises, ristournes obtenus' },
  { code: '611', label: 'Sous-traitance générale' },
  { code: '612', label: 'Redevances de crédit-bail' },
  { code: '613', label: 'Locations' },
  { code: '614', label: 'Charges locatives et de copropriété' },
  { code: '615', label: 'Entretien et réparations' },
  { code: '616', label: 'Primes d\'assurance' },
  { code: '617', label: 'Études et recherches' },
  { code: '618', label: 'Divers (documentation, séminaires)' },
  { code: '621', label: 'Personnel extérieur' },
  { code: '622', label: 'Rémunérations d\'intermédiaires' },
  { code: '623', label: 'Publicité, publications, relations publiques' },
  { code: '624', label: 'Transports de biens et collectifs' },
  { code: '625', label: 'Déplacements, missions et réceptions' },
  { code: '626', label: 'Frais postaux et de télécommunications' },
  { code: '627', label: 'Services bancaires et assimilés' },
  { code: '628', label: 'Divers (cotisations, pourboires)' },
  { code: '631', label: 'Impôts, taxes sur rémunérations' },
  { code: '635', label: 'Autres impôts, taxes' },
  { code: '637', label: 'Autres impôts (CFE, CVAE)' },
  { code: '641', label: 'Rémunérations du personnel' },
  { code: '645', label: 'Charges de sécurité sociale' },
  { code: '646', label: 'Cotisations sociales de l\'exploitant' },
  { code: '647', label: 'Autres charges sociales' },
  { code: '651', label: 'Redevances pour concessions, brevets' },
  { code: '654', label: 'Pertes sur créances irrécouvrables' },
  { code: '658', label: 'Charges diverses de gestion courante' },
  { code: '661', label: 'Charges d\'intérêts' },
  { code: '665', label: 'Escomptes accordés' },
  { code: '666', label: 'Pertes de change' },
  { code: '668', label: 'Autres charges financières' },
  { code: '671', label: 'Charges exceptionnelles sur opérations de gestion' },
  { code: '675', label: 'Valeurs comptables des éléments cédés' },
  { code: '681', label: 'Dotations aux amortissements et provisions (exploitation)' },
  { code: '686', label: 'Dotations aux amortissements et provisions (financier)' },
  { code: '687', label: 'Dotations aux amortissements et provisions (exceptionnel)' },
  { code: '691', label: 'Participation des salariés aux résultats' },
  { code: '695', label: 'Impôts sur les bénéfices' },

  // Class 7 — Produits
  { code: '701', label: 'Ventes de produits finis' },
  { code: '706', label: 'Prestations de services' },
  { code: '707', label: 'Ventes de marchandises' },
  { code: '708', label: 'Produits des activités annexes' },
  { code: '709', label: 'Rabais, remises, ristournes accordés' },
  { code: '713', label: 'Variation des stocks' },
  { code: '721', label: 'Production immobilisée — incorporelle' },
  { code: '722', label: 'Production immobilisée — corporelle' },
  { code: '740', label: 'Subventions d\'exploitation' },
  { code: '751', label: 'Redevances pour concessions, brevets' },
  { code: '758', label: 'Produits divers de gestion courante' },
  { code: '761', label: 'Produits de participations' },
  { code: '762', label: 'Produits des autres immobilisations financières' },
  { code: '764', label: 'Revenus des valeurs mobilières de placement' },
  { code: '765', label: 'Escomptes obtenus' },
  { code: '766', label: 'Gains de change' },
  { code: '771', label: 'Produits exceptionnels sur opérations de gestion' },
  { code: '775', label: 'Produits des cessions d\'éléments d\'actif' },
  { code: '781', label: 'Reprises sur amortissements et provisions (exploitation)' },
  { code: '786', label: 'Reprises sur provisions (financier)' },
  { code: '787', label: 'Reprises sur provisions (exceptionnel)' },
];

/**
 * Search PCG accounts by code or label (case-insensitive).
 * Also searches previously used accounts from the project (user history).
 */
export function searchPCGAccounts(
  query: string,
  userAccounts?: { code: string; name: string }[],
  maxResults = 10,
): PCGAccount[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const isNumeric = /^\d+$/.test(q);

  // Score each account
  type Scored = PCGAccount & { score: number; source: 'user' | 'pcg' };
  const results: Scored[] = [];
  const seen = new Set<string>();

  // User accounts first (higher priority)
  if (userAccounts) {
    for (const ua of userAccounts) {
      if (seen.has(ua.code)) continue;
      const matchCode = ua.code.startsWith(q) || ua.code.includes(q);
      const matchLabel = ua.name.toLowerCase().includes(q);
      if (isNumeric ? matchCode : (matchCode || matchLabel)) {
        seen.add(ua.code);
        let score = 100; // user history bonus
        if (ua.code === q) score += 50;
        else if (ua.code.startsWith(q)) score += 30;
        results.push({ code: ua.code, label: ua.name, score, source: 'user' });
      }
    }
  }

  // PCG accounts
  for (const acct of PCG_ACCOUNTS) {
    if (seen.has(acct.code)) continue;
    const matchCode = acct.code.startsWith(q) || acct.code.includes(q);
    const matchLabel = acct.label.toLowerCase().includes(q);
    if (isNumeric ? matchCode : (matchCode || matchLabel)) {
      seen.add(acct.code);
      let score = 0;
      if (acct.code === q) score = 50;
      else if (acct.code.startsWith(q)) score = 30;
      else if (matchCode) score = 20;
      else score = 10;
      results.push({ ...acct, score, source: 'pcg' });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, maxResults);
}
