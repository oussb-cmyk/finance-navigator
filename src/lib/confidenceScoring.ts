/**
 * Per-row confidence scoring engine.
 * 
 * Scoring rules:
 * +30 if valid date detected
 * +30 if valid numeric amount (debit or credit)
 * +40 if account assigned (code known)
 * 
 * Bonuses from learning store:
 * +up to 15 if account code is recognized from previous imports
 * 
 * Thresholds:
 * 90-100 → auto-validated
 * 70-89  → needs review
 * <70    → rejected / needs correction
 */

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface RowConfidence {
  score: number;
  level: ConfidenceLevel;
  reasons: string[];
}

export interface ScoredRow {
  rowIndex: number;
  date: string;
  accountCode: string;
  accountName: string;
  description: string;
  debit: number;
  credit: number;
  confidence: RowConfidence;
  /** Whether the user has explicitly validated this row */
  isValidated: boolean;
  /** Whether the row has been edited by the user */
  isEdited: boolean;
}

export function computeRowConfidence(
  row: {
    date: string;
    accountCode: string;
    debit: number;
    credit: number;
  },
  learnedBoost: number = 0,
): RowConfidence {
  let score = 0;
  const reasons: string[] = [];

  // +30 for valid date
  const hasDate = row.date && row.date !== '' && row.date !== new Date().toISOString().slice(0, 10);
  if (hasDate) {
    score += 30;
  } else {
    reasons.push('No valid date detected');
  }

  // +30 for valid amount
  if (row.debit > 0 || row.credit > 0) {
    score += 30;
  } else {
    reasons.push('No debit or credit amount');
  }

  // +40 for account assigned
  if (row.accountCode && row.accountCode !== '' && row.accountCode !== 'UNKNOWN') {
    score += 40;
  } else {
    reasons.push('No account assigned');
  }

  // Learning bonus
  if (learnedBoost > 0) {
    score = Math.min(score + learnedBoost, 100);
  }

  score = Math.min(score, 100);

  const level: ConfidenceLevel = score >= 90 ? 'high' : score >= 70 ? 'medium' : 'low';

  return { score, level, reasons };
}

export function getConfidenceColor(level: ConfidenceLevel): string {
  switch (level) {
    case 'high': return 'text-success';
    case 'medium': return 'text-warning';
    case 'low': return 'text-destructive';
  }
}

export function getConfidenceBgColor(level: ConfidenceLevel): string {
  switch (level) {
    case 'high': return 'bg-success/10';
    case 'medium': return 'bg-warning/10';
    case 'low': return 'bg-destructive/10';
  }
}

export function getConfidenceLabel(level: ConfidenceLevel): string {
  switch (level) {
    case 'high': return 'Auto-validated';
    case 'medium': return 'Needs review';
    case 'low': return 'Rejected';
  }
}
