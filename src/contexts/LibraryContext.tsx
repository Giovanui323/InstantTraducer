import React, { createContext, useContext } from 'react';
import { ReadingProgress, Group } from '../types';

export type SavePriority = 'CRITICAL' | 'BACKGROUND' | 'BATCH';

export interface LibraryContextType {
  recentBooks: Record<string, ReadingProgress>;
  availableGroups: Group[];
  selectedGroupFilters: string[];
  currentProjectFileId: string | null;
  setCurrentProjectFileId: (id: string | null) => void;
  refreshLibrary: () => Promise<void>;
  createGroup: (group: string) => void;
  deleteGroup: (group: string) => void;
  toggleGroupFilter: (group: string) => void;
  addBookToGroup: (fileId: string, group: string) => void;
  removeBookFromGroup: (fileId: string, group: string) => void;
  updateLibrary: (fileId: string, data: Partial<ReadingProgress>, priority?: SavePriority, silent?: boolean) => Promise<string>;
  cancelPendingSaves: (fileId: string) => void;
  flushSaves: () => Promise<boolean>;
  deleteProject: (fileId: string) => Promise<boolean>;
}

export const LibraryContext = createContext<LibraryContextType | undefined>(undefined);

export const useLibrary = () => {
  const context = useContext(LibraryContext);
  if (context === undefined) {
    throw new Error('useLibrary must be used within a LibraryContext.Provider');
  }
  return context;
};
