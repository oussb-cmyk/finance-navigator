import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** A learned account pattern: code → name mapping */
export interface AccountPattern {
  code: string;
  name: string;
  /** How many times this pattern was seen/confirmed */
  frequency: number;
  /** Last confirmed timestamp */
  lastSeen: number;
}

/** A user correction record */
export interface CorrectionRecord {
  /** Original parsed value */
  original: {
    date?: string;
    accountCode?: string;
    accountName?: string;
    description?: string;
    debit?: number;
    credit?: number;
  };
  /** User-corrected value */
  corrected: {
    date?: string;
    accountCode?: string;
    accountName?: string;
    description?: string;
    debit?: number;
    credit?: number;
  };
  timestamp: number;
}

/** File structure fingerprint for pattern matching */
export interface FileFingerprint {
  /** Hash-like identifier based on header/structure patterns */
  id: string;
  /** Structure type that worked for this file */
  structureType: 'tabular' | 'hierarchical';
  /** Column positions if tabular */
  columnMapping?: Record<string, string | null>;
  /** Number of times this fingerprint was matched */
  matchCount: number;
  lastUsed: number;
}

interface ProjectLearningData {
  accountPatterns: AccountPattern[];
  corrections: CorrectionRecord[];
  fileFingerprints: FileFingerprint[];
}

interface LearningStore {
  /** Per-project learning data */
  projects: Record<string, ProjectLearningData>;

  /** Get or init project learning data */
  getProjectData: (projectId: string) => ProjectLearningData;

  /** Learn account patterns from confirmed imports */
  learnAccountPatterns: (projectId: string, accounts: { code: string; name: string }[]) => void;

  /** Record a user correction */
  recordCorrection: (projectId: string, correction: CorrectionRecord) => void;

  /** Save a file fingerprint */
  saveFileFingerprint: (projectId: string, fingerprint: FileFingerprint) => void;

  /** Look up a known account name by code */
  getLearnedAccountName: (projectId: string, code: string) => string | null;

  /** Get confidence boost for a given account code (based on frequency) */
  getAccountConfidenceBoost: (projectId: string, code: string) => number;

  /** Find matching file fingerprint */
  findMatchingFingerprint: (projectId: string, fingerprintId: string) => FileFingerprint | null;

  /** Batch-record corrections from review */
  recordBatchCorrections: (projectId: string, corrections: CorrectionRecord[]) => void;
}

const EMPTY_PROJECT_DATA: ProjectLearningData = {
  accountPatterns: [],
  corrections: [],
  fileFingerprints: [],
};

export const useLearningStore = create<LearningStore>()(
  persist(
    (set, get) => ({
      projects: {},

      getProjectData: (projectId) => {
        return get().projects[projectId] || EMPTY_PROJECT_DATA;
      },

      learnAccountPatterns: (projectId, accounts) => {
        set((s) => {
          const existing = s.projects[projectId] || { ...EMPTY_PROJECT_DATA, accountPatterns: [], corrections: [], fileFingerprints: [] };
          const patternMap = new Map(existing.accountPatterns.map(p => [p.code, p]));

          for (const acct of accounts) {
            const prev = patternMap.get(acct.code);
            if (prev) {
              patternMap.set(acct.code, {
                ...prev,
                name: acct.name || prev.name,
                frequency: prev.frequency + 1,
                lastSeen: Date.now(),
              });
            } else {
              patternMap.set(acct.code, {
                code: acct.code,
                name: acct.name,
                frequency: 1,
                lastSeen: Date.now(),
              });
            }
          }

          return {
            projects: {
              ...s.projects,
              [projectId]: {
                ...existing,
                accountPatterns: Array.from(patternMap.values()),
              },
            },
          };
        });
      },

      recordCorrection: (projectId, correction) => {
        set((s) => {
          const existing = s.projects[projectId] || { ...EMPTY_PROJECT_DATA, accountPatterns: [], corrections: [], fileFingerprints: [] };
          return {
            projects: {
              ...s.projects,
              [projectId]: {
                ...existing,
                corrections: [...existing.corrections.slice(-200), correction],
              },
            },
          };
        });
      },

      recordBatchCorrections: (projectId, corrections) => {
        set((s) => {
          const existing = s.projects[projectId] || { ...EMPTY_PROJECT_DATA, accountPatterns: [], corrections: [], fileFingerprints: [] };
          return {
            projects: {
              ...s.projects,
              [projectId]: {
                ...existing,
                corrections: [...existing.corrections.slice(-200), ...corrections].slice(-200),
              },
            },
          };
        });
      },

      saveFileFingerprint: (projectId, fingerprint) => {
        set((s) => {
          const existing = s.projects[projectId] || { ...EMPTY_PROJECT_DATA, accountPatterns: [], corrections: [], fileFingerprints: [] };
          const fps = existing.fileFingerprints.filter(f => f.id !== fingerprint.id);
          return {
            projects: {
              ...s.projects,
              [projectId]: {
                ...existing,
                fileFingerprints: [...fps, fingerprint].slice(-50),
              },
            },
          };
        });
      },

      getLearnedAccountName: (projectId, code) => {
        const data = get().projects[projectId];
        if (!data) return null;
        const pattern = data.accountPatterns.find(p => p.code === code);
        return pattern?.name || null;
      },

      getAccountConfidenceBoost: (projectId, code) => {
        const data = get().projects[projectId];
        if (!data) return 0;
        const pattern = data.accountPatterns.find(p => p.code === code);
        if (!pattern) return 0;
        // More frequent = higher boost, max +15
        return Math.min(pattern.frequency * 3, 15);
      },

      findMatchingFingerprint: (projectId, fingerprintId) => {
        const data = get().projects[projectId];
        if (!data) return null;
        return data.fileFingerprints.find(f => f.id === fingerprintId) || null;
      },
    }),
    {
      name: 'finance-hub-learning',
      version: 1,
    }
  )
);

/** Generate a fingerprint ID from headers or structure */
export function generateFileFingerprint(headers: string[], structureType: 'tabular' | 'hierarchical'): string {
  const sorted = [...headers].map(h => h.toLowerCase().trim()).sort().join('|');
  return `${structureType}:${simpleHash(sorted)}`;
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
