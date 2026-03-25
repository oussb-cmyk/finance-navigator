import { useMemo } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import type { UploadedFile, AccountMapping, JournalEntry } from '@/types/finance';

// Stable empty arrays — same reference every render
const EMPTY_FILES: UploadedFile[] = [];
const EMPTY_MAPPINGS: AccountMapping[] = [];
const EMPTY_ENTRIES: JournalEntry[] = [];

/**
 * Returns a stable reference for project files.
 * Avoids the `?? []` pattern that creates new arrays each render.
 */
export function useProjectFiles(projectId: string): UploadedFile[] {
  const files = useProjectStore((s) => s.files[projectId]);
  return files ?? EMPTY_FILES;
}

export function useProjectMappings(projectId: string): AccountMapping[] {
  const mappings = useProjectStore((s) => s.mappings[projectId]);
  return mappings ?? EMPTY_MAPPINGS;
}

export function useProjectEntries(projectId: string): JournalEntry[] {
  const entries = useProjectStore((s) => s.entries[projectId]);
  return entries ?? EMPTY_ENTRIES;
}
