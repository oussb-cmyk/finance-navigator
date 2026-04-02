import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Transaction, Poste, CategorieTreso, CategoriePnL } from '@/types/transaction';
import type { LearnedPattern } from '@/lib/transactionCategorization';

interface TransactionStore {
  // Per-project transactions
  transactions: Record<string, Transaction[]>;
  // Per-project learned patterns for categorization
  learnedPatterns: Record<string, LearnedPattern[]>;

  getTransactions: (projectId: string) => Transaction[];
  addTransactions: (projectId: string, txs: Transaction[]) => void;
  updateTransaction: (projectId: string, txId: string, updates: Partial<Transaction>) => void;
  bulkUpdateField: (projectId: string, txIds: string[], field: 'poste' | 'categorieTreso' | 'categoriePnL', value: string) => void;
  deleteTransactions: (projectId: string, txIds: string[]) => void;

  getLearnedPatterns: (projectId: string) => LearnedPattern[];
  learnFromCorrection: (projectId: string, description: string, poste: Poste, categorieTreso: CategorieTreso, categoriePnL: CategoriePnL) => void;
}

const EMPTY_TXS: Transaction[] = [];
const EMPTY_PATTERNS: LearnedPattern[] = [];

export const useTransactionStore = create<TransactionStore>()(
  persist(
    (set, get) => ({
      transactions: {},
      learnedPatterns: {},

      getTransactions: (pid) => get().transactions[pid] || EMPTY_TXS,

      addTransactions: (pid, txs) => set((s) => ({
        transactions: { ...s.transactions, [pid]: [...(s.transactions[pid] || []), ...txs] },
      })),

      updateTransaction: (pid, txId, updates) => set((s) => ({
        transactions: {
          ...s.transactions,
          [pid]: (s.transactions[pid] || []).map(t => t.id === txId ? { ...t, ...updates, isMapped: true } : t),
        },
      })),

      bulkUpdateField: (pid, txIds, field, value) => set((s) => {
        const idSet = new Set(txIds);
        return {
          transactions: {
            ...s.transactions,
            [pid]: (s.transactions[pid] || []).map(t =>
              idSet.has(t.id) ? { ...t, [field]: value, isMapped: true } : t
            ),
          },
        };
      }),

      deleteTransactions: (pid, txIds) => set((s) => {
        const idSet = new Set(txIds);
        return {
          transactions: {
            ...s.transactions,
            [pid]: (s.transactions[pid] || []).filter(t => !idSet.has(t.id)),
          },
        };
      }),

      getLearnedPatterns: (pid) => get().learnedPatterns[pid] || EMPTY_PATTERNS,

      learnFromCorrection: (pid, description, poste, categorieTreso, categoriePnL) => set((s) => {
        const existing = s.learnedPatterns[pid] || [];
        // Extract first 2-3 significant words as pattern
        const words = description.toLowerCase().replace(/[^a-zà-ÿ0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2).slice(0, 3);
        if (words.length === 0) return s;
        const patStr = words.join('.*');
        // Don't duplicate
        if (existing.some(p => typeof p.description === 'string' && p.description === patStr)) return s;
        return {
          learnedPatterns: {
            ...s.learnedPatterns,
            [pid]: [...existing, { description: patStr, poste, categorieTreso, categoriePnL }].slice(-200),
          },
        };
      }),
    }),
    { name: 'transaction-store' },
  ),
);
